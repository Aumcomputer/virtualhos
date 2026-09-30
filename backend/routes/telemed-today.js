const express = require('express');
const { pool_vhos, pool_hos } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ---------------------------------------------------------------------------
// Auto-Migration: Ensure workflow columns exist in virtualhos.req_telemed
// ---------------------------------------------------------------------------
(async () => {
  let conn;
  try {
    conn = await pool_vhos.getConnection();
    await conn.query(`
      ALTER TABLE virtualhos.req_telemed 
      ADD COLUMN IF NOT EXISTS vn_today VARCHAR(20) DEFAULT NULL COMMENT 'VN ของ visit วันนี้ที่เวชระเบียนเปิดใน HOSxP' AFTER oapp_id,
      ADD COLUMN IF NOT EXISTS pharmacy_pay_type VARCHAR(20) DEFAULT NULL COMMENT 'PAID (ต้องชำระเงิน), FREE (ไม่ต้องชำระเงิน)' AFTER pharmacy_remark,
      ADD COLUMN IF NOT EXISTS pharmacy_dispense_by VARCHAR(100) DEFAULT NULL COMMENT 'เภสัชกรผู้จัดยา' AFTER pharmacy_pay_type,
      ADD COLUMN IF NOT EXISTS pharmacy_dispense_at DATETIME DEFAULT NULL COMMENT 'วันเวลาที่เภสัชกรจัดยา' AFTER pharmacy_dispense_by,
      ADD COLUMN IF NOT EXISTS finance_status VARCHAR(20) DEFAULT NULL COMMENT 'PENDING (รอชำระเงิน), PAID (ชำระเงินแล้ว), FREE (ไม่ต้องชำระ)' AFTER pharmacy_dispense_at,
      ADD COLUMN IF NOT EXISTS finance_by VARCHAR(100) DEFAULT NULL COMMENT 'เจ้าหน้าที่การเงินผู้บันทึกชำระ' AFTER finance_status,
      ADD COLUMN IF NOT EXISTS finance_at DATETIME DEFAULT NULL COMMENT 'วันเวลาที่ชำระเงิน' AFTER finance_by
    `);
    console.log('[telemed-today] Ensured Telemed Today columns exist in virtualhos.req_telemed');
  } catch (err) {
    // Non-fatal if DB user does not have ALTER permission or columns already exist
    console.warn('[telemed-today] Migration notice:', err.message);
  } finally {
    if (conn) conn.release();
  }
})();

function serializeRow(row) {
  if (!row) return null;
  const item = {};
  for (const key of Object.keys(row)) {
    if (typeof row[key] === 'bigint') {
      item[key] = Number(row[key]);
    } else {
      item[key] = row[key];
    }
  }
  return item;
}

/**
 * Helper to fetch clinical visit details by VN from HOSxP
 */
async function fetchClinicalVisit(connHos, targetVn) {
  if (!targetVn) return null;

  const visitQuery = `
    SELECT o.vn, o.vstdate, o.vsttime, p.hn, v.age_y, v.age_m, v.age_d,
           od.bps, od.bpd, od.height, od.bw, od.pulse, od.temperature, od.cc, od.hr, od.pe, od.rr, od.bmi,
           ovstist.name AS ovstist_name,
           o.pttype,
           pt.name AS pttype_name,
           (SELECT GROUP_CONCAT(IF(ovstdiag.diagtype = 1, CONCAT(ovstdiag.icd10, ':', icd101.name, ' (PDX)'), CONCAT(ovstdiag.icd10, ':', icd101.name)) SEPARATOR '\n')
            FROM ovstdiag
            LEFT OUTER JOIN icd101 ON icd101.code = ovstdiag.icd10
            WHERE vn = o.vn
           ) AS diagnosis_concat,
           (SELECT GROUP_CONCAT(
               CONCAT(IFNULL(d.name, ''), ' ', IFNULL(d.strength, ''), ' ',
                      IF(o1.sp_use <> '', CONCAT(IFNULL(u.name1, ''), ' ', IFNULL(u.name2, ''), ' ', IFNULL(u.name3, '')), ''),
                      IFNULL(du.shortlist, ''), ' #', IFNULL(o1.qty, ''))
               SEPARATOR '\n')
            FROM opitemrece o1
            INNER JOIN drugitems d ON o1.icode = d.icode
            LEFT OUTER JOIN drugusage du ON du.drugusage = o1.drugusage
            LEFT OUTER JOIN sp_use u ON u.sp_use = o1.sp_use
            WHERE o1.vn = o.vn
           ) AS drug_concat,
           (SELECT GROUP_CONCAT(CONCAT(d.name, ' #', o2.qty) SEPARATOR '\n')
            FROM opitemrece o2
            INNER JOIN nondrugitems d ON o2.icode = d.icode
            WHERE o2.vn = o.vn
           ) AS nondrug_concat,
           (SELECT report_text FROM xray_report WHERE vn = o.vn LIMIT 1) AS xray_report
    FROM ovst o
    LEFT OUTER JOIN vn_stat v ON v.vn = o.vn
    LEFT OUTER JOIN patient p ON p.hn = o.hn
    LEFT OUTER JOIN pttype pt ON pt.pttype = o.pttype
    LEFT OUTER JOIN opdscreen od ON od.vn = o.vn
    LEFT OUTER JOIN ovstist ON ovstist.ovstist = o.ovstist
    WHERE o.vn = ?
    LIMIT 1
  `;

  try {
    const rows = await connHos.query(visitQuery, [targetVn]);
    if (rows && rows.length > 0) {
      return serializeRow(rows[0]);
    }
  } catch (err) {
    console.warn('[telemed-today] Clinical query fallback:', err.message);
  }
  return null;
}

/**
 * Helper to fetch payment summary from vn_stat in HOSxP
 */
async function fetchVnStat(connHos, targetVn) {
  if (!targetVn) return null;
  try {
    const rows = await connHos.query(`
      SELECT v.vn, v.hn, v.vstdate, v.pttype, pt.name AS pttype_name,
             IFNULL(v.item_money, 0) AS item_money,
             IFNULL(v.uc_money, 0) AS uc_money,
             IFNULL(v.paid_money, 0) AS paid_money,
             IFNULL(v.rcpt_money, 0) AS rcpt_money,
             IFNULL(v.remain_money, 0) AS remain_money
      FROM vn_stat v
      LEFT OUTER JOIN pttype pt ON pt.pttype = v.pttype
      WHERE v.vn = ?
      LIMIT 1
    `, [targetVn]);

    if (rows && rows.length > 0) {
      return serializeRow(rows[0]);
    }
  } catch (err) {
    console.warn('[telemed-today] vn_stat query warning:', err.message);
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. GET /api/telemed-today/appointments — “รับยาไม่พบแพทย์” วันนี้
// Shows approved telemed requests having appointment on target date (default CURDATE())
// Checks HOSxP ovst to detect and auto-sync vn_today if Medical Records opened visit
// ---------------------------------------------------------------------------
router.get('/appointments', authenticateToken, async (req, res) => {
  const targetDate = (req.query.date || '').trim() || null;
  const search = (req.query.search || '').trim();

  let connVhos;
  let connHos;
  try {
    connVhos = await pool_vhos.getConnection();
    connHos = await pool_hos.getConnection();

    let whereClause = `
      (status LIKE '%สามารถจัดส่งได้%' OR status LIKE '%อนุมัติ%')
      AND (status NOT LIKE '%ไม่อนุมัติ%' AND status NOT LIKE '%ไม่สามารถจัดส่งได้%')
    `;
    const params = [];

    if (targetDate) {
      whereClause += ` AND DATE(nextdate) = ?`;
      params.push(targetDate);
    } else {
      whereClause += ` AND DATE(nextdate) = CURDATE()`;
    }

    if (search) {
      whereClause += ` AND (hn LIKE ? OR patient_name LIKE ? OR phone LIKE ? OR clinic_name LIKE ? OR doctor_name LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }

    const query = `
      SELECT *
      FROM virtualhos.req_telemed
      WHERE ${whereClause}
      ORDER BY id ASC
    `;
    const rows = await connVhos.query(query, params);

    // Auto-check and sync vn_today from HOSxP ovst for cases where vn_today is missing
    const results = [];
    let hasVisitCount = 0;
    let noVisitCount = 0;

    for (const rawRow of rows) {
      const item = serializeRow(rawRow);
      let currentVn = item.vn_today;

      // If vn_today is not yet recorded, search HOSxP ovst for this patient on this date
      if (!currentVn && item.hn) {
        try {
          const dateParam = targetDate || new Date().toISOString().split('T')[0];
          const strippedHn = item.hn.replace(/^0+/, '') || item.hn;
          const ovstRows = await connHos.query(`
            SELECT vn, vstdate, vsttime, cur_dep
            FROM ovst
            WHERE (hn = ? OR hn = ?) AND vstdate = ?
            ORDER BY vsttime DESC
            LIMIT 1
          `, [item.hn, strippedHn, dateParam]);

          if (ovstRows && ovstRows.length > 0 && ovstRows[0].vn) {
            currentVn = ovstRows[0].vn;
            item.vn_today = currentVn;
            // Persist vn_today into virtualhos.req_telemed
            await connVhos.query(`
              UPDATE virtualhos.req_telemed
              SET vn_today = ?, updated_at = NOW()
              WHERE id = ?
            `, [currentVn, item.id]);
          }
        } catch (ovstErr) {
          console.warn('[telemed-today] Error checking ovst for hn:', item.hn, ovstErr.message);
        }
      }

      if (currentVn) {
        hasVisitCount++;
        item.has_visit = true;
      } else {
        noVisitCount++;
        item.has_visit = false;
      }

      results.push(item);
    }

    res.json({
      data: results,
      summary: {
        total: results.length,
        has_visit: hasVisitCount,
        no_visit: noVisitCount,
      },
    });
  } catch (err) {
    console.error('Error in /api/telemed-today/appointments:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (connVhos) connVhos.release();
    if (connHos) connHos.release();
  }
});

// ---------------------------------------------------------------------------
// 2. POST /api/telemed-today/:id/sync-vn — Explicitly search & sync vn_today from HOSxP
// ---------------------------------------------------------------------------
router.post('/:id/sync-vn', authenticateToken, async (req, res) => {
  const { id } = req.params;

  let connVhos;
  let connHos;
  try {
    connVhos = await pool_vhos.getConnection();
    connHos = await pool_hos.getConnection();

    const existing = await connVhos.query('SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'ไม่พบรายการคำขอนี้' });
    }
    const item = existing[0];
    const strippedHn = item.hn.replace(/^0+/, '') || item.hn;
    const targetDate = item.nextdate ? new Date(item.nextdate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    const ovstRows = await connHos.query(`
      SELECT vn, vstdate, vsttime, cur_dep
      FROM ovst
      WHERE (hn = ? OR hn = ?) AND vstdate = ?
      ORDER BY vsttime DESC
      LIMIT 1
    `, [item.hn, strippedHn, targetDate]);

    if (!ovstRows || ovstRows.length === 0 || !ovstRows[0].vn) {
      return res.json({
        success: false,
        message: `ยังไม่พบการเปิด Visit ใน HOSxP สำหรับผู้ป่วย HN ${item.hn} ในวันที่ ${targetDate}`,
        vn_today: null,
      });
    }

    const vn = ovstRows[0].vn;
    await connVhos.query('UPDATE virtualhos.req_telemed SET vn_today = ?, updated_at = NOW() WHERE id = ?', [vn, id]);

    res.json({
      success: true,
      message: `ตรวจพบและซิงก์ VN วันนี้เรียบร้อยแล้ว: ${vn}`,
      vn_today: vn,
    });
  } catch (err) {
    console.error('Error syncing vn:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (connVhos) connVhos.release();
    if (connHos) connHos.release();
  }
});

// ---------------------------------------------------------------------------
// 3. GET /api/telemed-today/pharmacy — ห้องยา (2 Tabs: รายการวันนี้, รอจัดส่ง)
// ---------------------------------------------------------------------------
router.get('/pharmacy', authenticateToken, async (req, res) => {
  const tab = (req.query.tab || 'today').trim(); // 'today' | 'delivery'
  const search = (req.query.search || '').trim();

  let connVhos;
  let connHos;
  try {
    connVhos = await pool_vhos.getConnection();
    connHos = await pool_hos.getConnection();

    // Summary counts for badges
    const summaryRows = await connVhos.query(`
      SELECT 
        SUM(CASE WHEN (DATE(nextdate) <= CURDATE() OR nextdate IS NULL) AND (pharmacy_pay_type IS NULL OR pharmacy_pay_type = '') THEN 1 ELSE 0 END) AS today_count,
        SUM(CASE WHEN (pharmacy_pay_type = 'FREE' OR (pharmacy_pay_type = 'PAID' AND finance_status = 'PAID')) AND (status != 'จัดส่งเรียบร้อย' OR delivery_at IS NULL) THEN 1 ELSE 0 END) AS delivery_count
      FROM virtualhos.req_telemed
      WHERE (status LIKE '%สามารถจัดส่งได้%' OR status LIKE '%อนุมัติ%')
        AND (status NOT LIKE '%ไม่อนุมัติ%' AND status NOT LIKE '%ไม่สามารถจัดส่งได้%')
    `);
    const todayCount = Number(summaryRows[0]?.today_count || 0);
    const deliveryCount = Number(summaryRows[0]?.delivery_count || 0);

    let whereClause = `
      (status LIKE '%สามารถจัดส่งได้%' OR status LIKE '%อนุมัติ%')
      AND (status NOT LIKE '%ไม่อนุมัติ%' AND status NOT LIKE '%ไม่สามารถจัดส่งได้%')
    `;
    const params = [];

    if (tab === 'today') {
      // 1. รายการยาวันนี้ + ย้อนหลังที่ยังไม่ได้กด dispense: นัดวันนี้หรือย้อนหลัง (<= CURDATE()) และยังไม่ได้กดยืนยันการชำระเงิน/จัดยา
      whereClause += ` AND (DATE(nextdate) <= CURDATE() OR nextdate IS NULL) AND (pharmacy_pay_type IS NULL OR pharmacy_pay_type = '')`;
    } else {
      // 2. รอจัดส่ง: เภสัชระบุไม่ต้องชำระ (FREE) หรือ การเงินชำระเงินแล้ว (PAID) และยังไม่จัดส่ง
      whereClause += `
        AND (pharmacy_pay_type = 'FREE' OR (pharmacy_pay_type = 'PAID' AND finance_status = 'PAID'))
        AND (status != 'จัดส่งเรียบร้อย' OR delivery_at IS NULL)
      `;
    }

    if (search) {
      whereClause += ` AND (hn LIKE ? OR patient_name LIKE ? OR phone LIKE ? OR clinic_name LIKE ? OR doctor_name LIKE ? OR vn_today LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s, s, s);
    }

    const query = `
      SELECT *
      FROM virtualhos.req_telemed
      WHERE ${whereClause}
      ORDER BY nextdate ASC, id ASC
    `;
    const rows = await connVhos.query(query, params);

    // Enrich with vn_stat prices if vn_today is present (and auto-sync vn_today if missing)
    const enriched = [];
    for (const r of rows) {
      const item = serializeRow(r);

      // If vn_today is not yet recorded, search HOSxP ovst for this patient on their appointment date
      if (!item.vn_today && item.hn) {
        try {
          const dateParam = item.nextdate ? new Date(item.nextdate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
          const strippedHn = item.hn.replace(/^0+/, '') || item.hn;
          const ovstRows = await connHos.query(`
            SELECT vn, vstdate, vsttime, cur_dep
            FROM ovst
            WHERE (hn = ? OR hn = ?) AND vstdate = ?
            ORDER BY vsttime DESC
            LIMIT 1
          `, [item.hn, strippedHn, dateParam]);

          if (ovstRows && ovstRows.length > 0 && ovstRows[0].vn) {
            item.vn_today = ovstRows[0].vn;
            await connVhos.query(`
              UPDATE virtualhos.req_telemed
              SET vn_today = ?, updated_at = NOW()
              WHERE id = ?
            `, [item.vn_today, item.id]);
          }
        } catch (ovstErr) {
          console.warn('[telemed-today] Pharmacy ovst lookup error:', ovstErr.message);
        }
      }

      if (item.vn_today) {
        const vnStat = await fetchVnStat(connHos, item.vn_today);
        if (vnStat) {
          item.item_money = vnStat.item_money;
          item.uc_money = vnStat.uc_money;
          item.paid_money = vnStat.paid_money;
          item.pttype_name = vnStat.pttype_name || item.pttype_name;
        }
      }
      enriched.push(item);
    }

    res.json({
      data: enriched,
      summary: {
        today_count: todayCount,
        delivery_count: deliveryCount,
      },
    });
  } catch (err) {
    console.error('Error in /api/telemed-today/pharmacy:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (connVhos) connVhos.release();
    if (connHos) connHos.release();
  }
});

// ---------------------------------------------------------------------------
// 4. GET /api/telemed-today/:id/detail — Modal รายละเอียดเปรียบเทียบ visit เก่า vs visit ปัจจุบัน
// ---------------------------------------------------------------------------
router.get('/:id/detail', authenticateToken, async (req, res) => {
  const { id } = req.params;

  let connVhos;
  let connHos;
  try {
    connVhos = await pool_vhos.getConnection();
    connHos = await pool_hos.getConnection();

    const reqRows = await connVhos.query('SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1', [id]);
    if (reqRows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลคำขอนี้' });
    }
    const requestItem = serializeRow(reqRows[0]);

    // 1. Previous visit (จาก oapp.vn หรือ visit ก่อนหน้า)
    let previousVn = null;
    if (requestItem.oapp_id) {
      const oappRows = await connHos.query('SELECT vn, vstdate, nextdate, clinic, doctor FROM oapp WHERE oapp_id = ? LIMIT 1', [requestItem.oapp_id]);
      if (oappRows && oappRows.length > 0) {
        previousVn = oappRows[0].vn;
      }
    }
    if (!previousVn && requestItem.hn) {
      const vstDate = requestItem.nextdate || requestItem.created_at;
      const ovstRows = await connHos.query(
        'SELECT vn FROM ovst WHERE hn = ? AND vstdate < ? ORDER BY vstdate DESC, vsttime DESC LIMIT 1',
        [requestItem.hn, vstDate]
      );
      if (ovstRows && ovstRows.length > 0) {
        previousVn = ovstRows[0].vn;
      }
    }

    const previousVisit = previousVn ? await fetchClinicalVisit(connHos, previousVn) : null;

    // 2. Current visit (จาก vn_today ของวันนี้)
    let currentVn = requestItem.vn_today;
    if (!currentVn && requestItem.hn) {
      // Auto look up from ovst today
      const targetDate = requestItem.nextdate ? new Date(requestItem.nextdate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      const strippedHn = requestItem.hn.replace(/^0+/, '') || requestItem.hn;
      const ovstRows = await connHos.query(`
        SELECT vn FROM ovst WHERE (hn = ? OR hn = ?) AND vstdate = ? ORDER BY vsttime DESC LIMIT 1
      `, [requestItem.hn, strippedHn, targetDate]);

      if (ovstRows && ovstRows.length > 0) {
        currentVn = ovstRows[0].vn;
        requestItem.vn_today = currentVn;
        await connVhos.query('UPDATE virtualhos.req_telemed SET vn_today = ? WHERE id = ?', [currentVn, id]);
      }
    }

    const currentVisit = currentVn ? await fetchClinicalVisit(connHos, currentVn) : null;
    const vnStat = currentVn ? await fetchVnStat(connHos, currentVn) : null;

    res.json({
      request: requestItem,
      previousVisit,
      previousVn,
      currentVisit,
      currentVn,
      vnStat,
    });
  } catch (err) {
    console.error('Error in /api/telemed-today/:id/detail:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (connVhos) connVhos.release();
    if (connHos) connHos.release();
  }
});

// ---------------------------------------------------------------------------
// 5. POST /api/telemed-today/:id/pharmacy-dispense — เภสัชจัดยา: เลือกว่า ต้องชำระเงิน / ไม่ต้องชำระเงิน
// ---------------------------------------------------------------------------
router.post('/:id/pharmacy-dispense', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { payType } = req.body; // 'PAID' (ต้องชำระเงิน) | 'FREE' (ไม่ต้องชำระเงิน)
  const staffName = req.user.displayName || req.user.name || req.user.username || 'เภสัชกร';

  if (!payType || (payType !== 'PAID' && payType !== 'FREE')) {
    return res.status(400).json({ error: 'กรุณาระบุรูปแบบการชำระเงิน (PAID หรือ FREE)' });
  }

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    const isPaid = payType === 'PAID';
    const financeStatus = isPaid ? 'PENDING' : 'FREE';

    await conn.query(`
      UPDATE virtualhos.req_telemed
      SET 
        pharmacy_pay_type = ?,
        pharmacy_dispense_by = ?,
        pharmacy_dispense_at = NOW(),
        finance_status = ?,
        updated_at = NOW()
      WHERE id = ?
    `, [payType, staffName, financeStatus, id]);

    const updated = await conn.query('SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1', [id]);

    res.json({
      success: true,
      message: isPaid
        ? 'บันทึกระบุ "ต้องชำระเงิน" เรียบร้อยแล้ว (ส่งรายการต่อไปยังเมนูการเงิน)'
        : 'บันทึกระบุ "ไม่ต้องชำระเงิน" เรียบร้อยแล้ว (ย้ายไปยังแท็บรอจัดส่ง)',
      data: serializeRow(updated[0]),
    });
  } catch (err) {
    console.error('Error in pharmacy-dispense:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// ---------------------------------------------------------------------------
// 6. GET /api/telemed-today/finance — การเงิน (แสดงรายชื่อที่ห้องยาส่งมา ที่ต้องชำระเงิน)
// ---------------------------------------------------------------------------
router.get('/finance', authenticateToken, async (req, res) => {
  const search = (req.query.search || '').trim();

  let connVhos;
  let connHos;
  try {
    connVhos = await pool_vhos.getConnection();
    connHos = await pool_hos.getConnection();

    let whereClause = `
      pharmacy_pay_type = 'PAID'
      AND finance_status = 'PENDING'
    `;
    const params = [];

    if (search) {
      whereClause += ` AND (hn LIKE ? OR patient_name LIKE ? OR phone LIKE ? OR vn_today LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const rows = await connVhos.query(`
      SELECT *
      FROM virtualhos.req_telemed
      WHERE ${whereClause}
      ORDER BY pharmacy_dispense_at DESC, id ASC
    `, params);

    // Enrich each row with exact financial data from HOSxP vn_stat
    const enriched = [];
    for (const r of rows) {
      const item = serializeRow(r);
      if (item.vn_today) {
        const vnStat = await fetchVnStat(connHos, item.vn_today);
        if (vnStat) {
          item.item_money = vnStat.item_money;
          item.uc_money = vnStat.uc_money;
          item.paid_money = vnStat.paid_money;
          item.rcpt_money = vnStat.rcpt_money;
          item.pttype_name = vnStat.pttype_name || item.pttype_name;
        }
      }
      enriched.push(item);
    }

    res.json({
      data: enriched,
      total: enriched.length,
    });
  } catch (err) {
    console.error('Error in /api/telemed-today/finance:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (connVhos) connVhos.release();
    if (connHos) connHos.release();
  }
});

// ---------------------------------------------------------------------------
// 7. POST /api/telemed-today/:id/finance-pay — การเงินกด "ชำระเงินแล้ว"
// เมื่อกดแล้วชื่อจะย้ายไปปรากฏที่ tab รอจัดส่ง ของห้องยา
// ---------------------------------------------------------------------------
router.post('/:id/finance-pay', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const staffName = req.user.displayName || req.user.name || req.user.username || 'เจ้าหน้าที่การเงิน';

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    await conn.query(`
      UPDATE virtualhos.req_telemed
      SET 
        finance_status = 'PAID',
        finance_by = ?,
        finance_at = NOW(),
        updated_at = NOW()
      WHERE id = ?
    `, [staffName, id]);

    const updated = await conn.query('SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1', [id]);

    res.json({
      success: true,
      message: 'บันทึกชำระเงินเรียบร้อยแล้ว (ส่งรายการไปยังแท็บรอจัดส่งของห้องยา)',
      data: serializeRow(updated[0]),
    });
  } catch (err) {
    console.error('Error in finance-pay:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// ---------------------------------------------------------------------------
// 8. POST /api/telemed-today/:id/delivery — จัดส่งยา / บันทึกเลขพัสดุ
// ---------------------------------------------------------------------------
router.post('/:id/delivery', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { tracking_number } = req.body;
  const officerName = req.user.displayName || req.user.name || req.user.username || 'เจ้าหน้าที่ห้องยา';

  if (!tracking_number || !tracking_number.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุเลขพัสดุจัดส่ง (Tracking Number)' });
  }

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    await conn.query(`
      UPDATE virtualhos.req_telemed
      SET 
        tracking_number = ?,
        delivery_at = NOW(),
        status = 'จัดส่งเรียบร้อย',
        updated_at = NOW()
      WHERE id = ?
    `, [tracking_number.trim(), id]);

    const updated = await conn.query('SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1', [id]);

    res.json({
      success: true,
      message: `บันทึกจัดส่งยาเรียบร้อยแล้ว (เลขพัสดุ: ${tracking_number.trim()})`,
      data: serializeRow(updated[0]),
    });
  } catch (err) {
    console.error('Error in delivery:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
