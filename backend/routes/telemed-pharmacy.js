const express = require('express');
const { pool_hos, pool_vhos } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function serializeRow(row) {
  if (!row) return row;
  const newRow = {};
  for (const key in row) {
    if (typeof row[key] === 'bigint') {
      newRow[key] = Number(row[key]);
    } else {
      newRow[key] = row[key];
    }
  }
  return newRow;
}

/**
 * ดึงข้อมูลราคาและวินิจฉัยจาก hos.vn_stat
 */
async function fetchVnStat(connHos, targetVn) {
  if (!targetVn) return null;
  try {
    const rows = await connHos.query(
      `SELECT vs.vn, vs.hn, vs.vstdate, vs.pdx, vs.dx0, vs.dx1, vs.dx2, vs.dx3, 
              vs.item_money, vs.paid_money, vs.remain_money, vs.uc_money, vs.rcpt_money,
              vs.pttype, pt.name AS pttype_name
       FROM vn_stat vs
       LEFT JOIN pttype pt ON vs.pttype = pt.pttype
       WHERE vs.vn = ? 
       LIMIT 1`,
      [targetVn]
    );
    if (rows && rows.length > 0) {
      return rows[0];
    }
  } catch (err) {
    console.warn('[telemed-pharmacy] vn_stat query warning:', err.message);
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. GET /api/telemed-pharmacy — รายการห้องยาจากผู้คัดกรองแล้ว (3 Tabs)
// ---------------------------------------------------------------------------
router.get('/', authenticateToken, async (req, res) => {
  const tab = (req.query.tab || 'today').trim(); // 'today' | 'delivery' | 'history'
  const search = (req.query.search || '').trim();
  const targetDate = (req.query.date || '').trim();
  const deliveryDate = (req.query.delivery_date || '').trim();

  let connVhos;
  let connHos;
  try {
    connVhos = await pool_vhos.getConnection();
    connHos = await pool_hos.getConnection();

    // 1. ซิงก์ข้อมูลจาก dextor.tele_prescreening ที่คัดกรองแล้ว เข้าสู่ telemed_stat อัตโนมัติ
    try {
      await connVhos.query(`
        INSERT INTO virtualhos.telemed_stat (
          prescreening_id, oapp_id, hn, vn, vstdate, patient_name, doctor_code, doctor_name, clinic
        )
        SELECT 
          p.id, p.oapp_id, p.hn, p.confirmed_vn, COALESCE(p.appointment_date, DATE(p.completed_at), CURDATE()), p.patient_name, p.doctor_code, p.doctor_name, p.clinic
        FROM dextor.tele_prescreening p
        WHERE p.status IN ('completed', 'confirmed')
        ON DUPLICATE KEY UPDATE
          patient_name = VALUES(patient_name),
          doctor_name = VALUES(doctor_name),
          clinic = VALUES(clinic),
          vn = COALESCE(virtualhos.telemed_stat.vn, VALUES(vn))
      `);
    } catch (syncErr) {
      console.warn('[telemed-pharmacy] auto sync prescreening warning:', syncErr.message);
    }

    // 2. คำนวณยอดสรุปตัวเลขของแต่ละแท็บ
    const summaryRows = await connVhos.query(`
      SELECT 
        SUM(CASE WHEN (pharmacy_pay_type IS NULL OR pharmacy_pay_type = '') AND (status NOT LIKE '%ไม่สามารถจัดส่งได้%' AND status NOT LIKE '%ยกเลิก%') THEN 1 ELSE 0 END) AS today_count,
        SUM(CASE WHEN (pharmacy_pay_type = 'FREE' OR (pharmacy_pay_type = 'PAID' AND finance_status = 'PAID')) AND (tracking_number IS NULL OR tracking_number = '') AND status != 'จัดส่งเรียบร้อย' THEN 1 ELSE 0 END) AS delivery_count,
        SUM(CASE WHEN (tracking_number IS NOT NULL AND tracking_number != '') OR status = 'จัดส่งเรียบร้อย' OR delivery_status = 'SHIPPED' THEN 1 ELSE 0 END) AS history_count
      FROM virtualhos.telemed_stat
    `);
    const todayCount = Number(summaryRows[0]?.today_count || 0);
    const deliveryCount = Number(summaryRows[0]?.delivery_count || 0);
    const historyCount = Number(summaryRows[0]?.history_count || 0);

    // 3. กรองข้อมูลตามแท็บ
    let whereClause = '1=1';
    const params = [];

    if (tab === 'today') {
      whereClause += `
        AND (ts.pharmacy_pay_type IS NULL OR ts.pharmacy_pay_type = '')
        AND (ts.status NOT LIKE '%ไม่สามารถจัดส่งได้%' AND ts.status NOT LIKE '%ยกเลิก%')
      `;
      if (targetDate) {
        whereClause += ` AND DATE(ts.vstdate) = ?`;
        params.push(targetDate);
      }
    } else if (tab === 'delivery') {
      whereClause += `
        AND (ts.pharmacy_pay_type = 'FREE' OR (ts.pharmacy_pay_type = 'PAID' AND ts.finance_status = 'PAID'))
        AND (ts.tracking_number IS NULL OR ts.tracking_number = '')
        AND ts.status != 'จัดส่งเรียบร้อย'
      `;
    } else if (tab === 'history') {
      whereClause += `
        AND ((ts.tracking_number IS NOT NULL AND ts.tracking_number != '') OR ts.status = 'จัดส่งเรียบร้อย' OR ts.delivery_status = 'SHIPPED')
      `;
      if (deliveryDate) {
        whereClause += ` AND (DATE(ts.delivery_at) = ? OR (ts.delivery_at IS NULL AND DATE(ts.updated_at) = ?))`;
        params.push(deliveryDate, deliveryDate);
      }
    }

    if (search) {
      whereClause += ` AND (ts.hn LIKE ? OR ts.patient_name LIKE ? OR ts.clinic LIKE ? OR ts.doctor_name LIKE ? OR ts.vn LIKE ? OR ts.tracking_number LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s, s, s);
    }

    let orderBy = 'ts.vstdate DESC, ts.id DESC';
    if (tab === 'history') {
      orderBy = 'ts.delivery_at DESC, ts.updated_at DESC, ts.id DESC';
    }

    const query = `
      SELECT 
        ts.*,
        p.phone,
        p.address,
        p.postal_code,
        p.sbp,
        p.dbp,
        p.pulse,
        p.temperature,
        p.weight,
        p.height,
        p.chief_complaint,
        p.current_medications,
        p.completed_at
      FROM virtualhos.telemed_stat ts
      LEFT JOIN dextor.tele_prescreening p ON ts.prescreening_id = p.id
      WHERE ${whereClause}
      ORDER BY ${orderBy}
    `;

    const rows = await connVhos.query(query, params);

    // 4. Enrich ข้อมูล VN วันนี้และราคา
    const enriched = [];
    for (const raw of rows) {
      const item = serializeRow(raw);

      // ตรวจสอบและซิงก์ VN ถ้ายังไม่มี
      if (!item.vn && item.hn) {
        try {
          let foundVn = null;
          // ถ้ามี oapp_id เช็ก visit_vn
          if (item.oapp_id) {
            const oappRows = await connHos.query(
              'SELECT visit_vn FROM oapp WHERE oapp_id = ? LIMIT 1',
              [item.oapp_id]
            );
            if (oappRows && oappRows.length > 0 && oappRows[0].visit_vn) {
              foundVn = String(oappRows[0].visit_vn).trim();
            }
          }
          // ถ้ายังไม่มี ค้นหาจาก ovst วันนี้
          if (!foundVn) {
            const targetDateStr = item.vstdate ? new Date(item.vstdate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
            const ovstRows = await connHos.query(
              'SELECT vn FROM ovst WHERE hn = ? AND vstdate = ? ORDER BY vsttime DESC LIMIT 1',
              [item.hn, targetDateStr]
            );
            if (ovstRows && ovstRows.length > 0 && ovstRows[0].vn) {
              foundVn = String(ovstRows[0].vn).trim();
            }
          }

          if (foundVn) {
            item.vn = foundVn;
            await connVhos.query(
              'UPDATE virtualhos.telemed_stat SET vn = ?, updated_at = NOW() WHERE id = ?',
              [foundVn, item.id]
            );
          }
        } catch (vErr) {
          console.warn('[telemed-pharmacy] Error syncing VN for item:', item.id, vErr.message);
        }
      }

      // ดึงสิทธิการรักษาจาก ovst.pttype และ ข้อมูลราคาจาก vn_stat
      if (item.vn) {
        // 1. ดึง pttype จาก ovst.pttype ของ VN ปัจจุบัน
        try {
          const ovstPtRows = await connHos.query(
            `SELECT o.pttype, pt.name AS pttype_name 
             FROM ovst o 
             LEFT JOIN pttype pt ON o.pttype = pt.pttype 
             WHERE o.vn = ? LIMIT 1`,
            [item.vn]
          );
          if (ovstPtRows && ovstPtRows.length > 0 && ovstPtRows[0].pttype) {
            item.pttype = ovstPtRows[0].pttype;
            item.pttype_name = ovstPtRows[0].pttype_name;
          }
        } catch (ovErr) {
          console.warn('[telemed-pharmacy] Error fetching ovst.pttype:', ovErr.message);
        }

        // 2. ดึงข้อมูลราคาจาก vn_stat
        const stat = await fetchVnStat(connHos, item.vn);
        if (stat) {
          item.item_money = Number(stat.item_money || 0);
          item.paid_money = Number(stat.paid_money || 0);
          item.remain_money = Number(stat.remain_money || 0);
          item.uc_money = Number(stat.uc_money || 0);
          item.pdx = stat.pdx || stat.dx0 || null;
          if (!item.pttype) {
            item.pttype = stat.pttype;
            item.pttype_name = stat.pttype_name;
          }
        }

        // เสริมสัญญาณชีพจาก opdscreen ถ้าใน tele_prescreening ไม่มี
        if (!item.sbp || !item.dbp) {
          try {
            const scRows = await connHos.query(
              'SELECT bps, bpd, pulse, temperature, bw, height FROM opdscreen WHERE vn = ? LIMIT 1',
              [item.vn]
            );
            if (scRows && scRows.length > 0) {
              const sc = scRows[0];
              item.sbp = item.sbp || sc.bps;
              item.dbp = item.dbp || sc.bpd;
              item.pulse = item.pulse || sc.pulse;
              item.temperature = item.temperature || sc.temperature;
              item.weight = item.weight || sc.bw;
              item.height = item.height || sc.height;
            }
          } catch {
            // ignore
          }
        }
      }

      // ถ้ายังไม่มี pttype และมี oapp_id ให้ดึงจาก ovst.pttype ของ visit ที่ออกใบนัด (oapp.vn)
      if (!item.pttype && item.oapp_id) {
        try {
          const oappPtRows = await connHos.query(
            `SELECT ov.pttype, pt.name AS pttype_name
             FROM oapp o
             LEFT JOIN ovst ov ON o.vn = ov.vn
             LEFT JOIN pttype pt ON ov.pttype = pt.pttype
             WHERE o.oapp_id = ? LIMIT 1`,
            [item.oapp_id]
          );
          if (oappPtRows && oappPtRows.length > 0 && oappPtRows[0].pttype) {
            item.pttype = oappPtRows[0].pttype;
            item.pttype_name = oappPtRows[0].pttype_name;
          }
        } catch {
          // ignore
        }
      }

      // Fallback ดึง pttype จาก patient ถ้ายังไม่มี
      if (!item.pttype && item.hn) {
        try {
          const ptRows = await connHos.query(
            `SELECT p.pttype, pt.name AS pttype_name, p.cid 
             FROM patient p 
             LEFT JOIN pttype pt ON p.pttype = pt.pttype 
             WHERE p.hn = ? LIMIT 1`,
            [item.hn]
          );
          if (ptRows && ptRows.length > 0) {
            item.pttype = ptRows[0].pttype;
            item.pttype_name = ptRows[0].pttype_name;
            item.cid = ptRows[0].cid;
          }
        } catch {
          // ignore
        }
      }

      enriched.push(item);
    }

    res.json({
      success: true,
      data: enriched,
      summary: {
        today_count: todayCount,
        delivery_count: deliveryCount,
        history_count: historyCount,
      },
    });
  } catch (err) {
    console.error('Error fetching telemed pharmacy data:', err);
    res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดในการดึงข้อมูลห้องยา' });
  } finally {
    if (connVhos) connVhos.release();
    if (connHos) connHos.release();
  }
});

// ---------------------------------------------------------------------------
// 2. POST /api/telemed-pharmacy/:id/sync-vn — บังคับค้นหาและซิงก์ VN จาก HOSxP
// ---------------------------------------------------------------------------
router.post('/:id/sync-vn', authenticateToken, async (req, res) => {
  const { id } = req.params;

  let connVhos;
  let connHos;
  try {
    connVhos = await pool_vhos.getConnection();
    connHos = await pool_hos.getConnection();

    const rows = await connVhos.query(
      'SELECT id, hn, oapp_id, vstdate, vn FROM virtualhos.telemed_stat WHERE id = ? LIMIT 1',
      [id]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบรายการนี้ในระบบ' });
    }
    const item = rows[0];
    const targetDateStr = item.vstdate ? new Date(item.vstdate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    let foundVn = null;

    // 1. จาก oapp
    if (item.oapp_id) {
      const oappRows = await connHos.query(
        'SELECT visit_vn FROM oapp WHERE oapp_id = ? LIMIT 1',
        [item.oapp_id]
      );
      if (oappRows && oappRows.length > 0 && oappRows[0].visit_vn) {
        foundVn = String(oappRows[0].visit_vn).trim();
      }
    }

    // 2. จาก ovst
    if (!foundVn) {
      const ovstRows = await connHos.query(
        'SELECT vn FROM ovst WHERE hn = ? AND vstdate = ? ORDER BY vsttime DESC LIMIT 1',
        [item.hn, targetDateStr]
      );
      if (ovstRows && ovstRows.length > 0 && ovstRows[0].vn) {
        foundVn = String(ovstRows[0].vn).trim();
      }
    }

    if (!foundVn) {
      return res.json({
        success: false,
        message: `ยังไม่พบการเปิด Visit ใน HOSxP สำหรับผู้ป่วย HN ${item.hn} ในวันที่ ${targetDateStr}`,
        vn: null,
      });
    }

    await connVhos.query(
      'UPDATE virtualhos.telemed_stat SET vn = ?, updated_at = NOW() WHERE id = ?',
      [foundVn, id]
    );

    res.json({
      success: true,
      message: `ตรวจพบและซิงก์ VN เรียบร้อยแล้ว: ${foundVn}`,
      vn: foundVn,
    });
  } catch (err) {
    console.error('Error syncing vn in telemed pharmacy:', err);
    res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดในการซิงก์ VN' });
  } finally {
    if (connVhos) connVhos.release();
    if (connHos) connHos.release();
  }
});

// ---------------------------------------------------------------------------
// 3. GET /api/telemed-pharmacy/:id/detail — รายละเอียดการรักษา รายการยา และสัญญาณชีพ
// ---------------------------------------------------------------------------
router.get('/:id/detail', authenticateToken, async (req, res) => {
  const { id } = req.params;

  let connVhos;
  let connHos;
  try {
    connVhos = await pool_vhos.getConnection();
    connHos = await pool_hos.getConnection();

    const statRows = await connVhos.query(`
      SELECT 
        ts.*,
        p.phone,
        p.address,
        p.postal_code,
        p.sbp,
        p.dbp,
        p.pulse,
        p.temperature,
        p.weight,
        p.height,
        p.spo2,
        p.chief_complaint,
        p.current_medications,
        p.additional_notes,
        p.completed_at
      FROM virtualhos.telemed_stat ts
      LEFT JOIN dextor.tele_prescreening p ON ts.prescreening_id = p.id
      WHERE ts.id = ? 
      LIMIT 1
    `, [id]);

    if (!statRows || statRows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบรายการนี้ในระบบ' });
    }

    const item = serializeRow(statRows[0]);

    // ถ้ายังไม่มี VN ลองค้นหาและซิงก์อัตโนมัติ
    if (!item.vn && item.hn) {
      try {
        let foundVn = null;
        if (item.oapp_id) {
          const oappRows = await connHos.query(
            'SELECT visit_vn FROM oapp WHERE oapp_id = ? LIMIT 1',
            [item.oapp_id]
          );
          if (oappRows && oappRows.length > 0 && oappRows[0].visit_vn) {
            foundVn = String(oappRows[0].visit_vn).trim();
          }
        }
        if (!foundVn) {
          const targetDateStr = item.vstdate ? new Date(item.vstdate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
          const ovstRows = await connHos.query(
            'SELECT vn FROM ovst WHERE hn = ? AND vstdate = ? ORDER BY vsttime DESC LIMIT 1',
            [item.hn, targetDateStr]
          );
          if (ovstRows && ovstRows.length > 0 && ovstRows[0].vn) {
            foundVn = String(ovstRows[0].vn).trim();
          }
        }

        if (foundVn) {
          item.vn = foundVn;
          await connVhos.query(
            'UPDATE virtualhos.telemed_stat SET vn = ?, updated_at = NOW() WHERE id = ?',
            [foundVn, item.id]
          );
        }
      } catch (syncErr) {
        console.warn('[telemed-pharmacy] detail vn auto-sync warning:', syncErr.message);
      }
    }

    let drugs = [];
    let vnStat = null;
    let opdScreen = null;
    let diagnoses = [];
    let visitInfo = null;
    let nonDrugItems = [];

    if (item.vn) {
      // 1. vn_stat (ยอดเงิน & PDX & สิทธิ)
      vnStat = await fetchVnStat(connHos, item.vn);

      // 2. ข้อมูล Visit ภาพรวม (ovst)
      try {
        const vRows = await connHos.query(`
          SELECT o.vn, o.vstdate, o.vsttime, o.doctor, d.name AS doctor_name, o.cur_dep, k.department, o.pttype, pt.name AS pttype_name
          FROM ovst o
          LEFT JOIN doctor d ON o.doctor = d.code
          LEFT JOIN kskdepartment k ON o.cur_dep = k.depcode
          LEFT JOIN pttype pt ON o.pttype = pt.pttype
          WHERE o.vn = ?
          LIMIT 1
        `, [item.vn]);
        if (vRows && vRows.length > 0) {
          visitInfo = serializeRow(vRows[0]);
          item.pttype = visitInfo.pttype;
          item.pttype_name = visitInfo.pttype_name;
        }
      } catch (vErr) {
        console.warn('[telemed-pharmacy] Error fetching ovst visitInfo:', vErr.message);
      }

      // ถ้ายังไม่มี pttype และมี oapp_id ให้ดึงจาก ovst.pttype ของ visit ที่ออกใบนัด (oapp.vn)
      if (!item.pttype && item.oapp_id) {
        try {
          const oappPtRows = await connHos.query(
            `SELECT ov.pttype, pt.name AS pttype_name
             FROM oapp o
             LEFT JOIN ovst ov ON o.vn = ov.vn
             LEFT JOIN pttype pt ON ov.pttype = pt.pttype
             WHERE o.oapp_id = ? LIMIT 1`,
            [item.oapp_id]
          );
          if (oappPtRows && oappPtRows.length > 0 && oappPtRows[0].pttype) {
            item.pttype = oappPtRows[0].pttype;
            item.pttype_name = oappPtRows[0].pttype_name;
          }
        } catch {
          // ignore
        }
      }

      // 3. ข้อมูลการตรวจร่างกาย/สัญญาณชีพ/บันทึกการรักษา (opdscreen)
      try {
        const scRows = await connHos.query(`
          SELECT bps, bpd, pulse, temperature, rr, bw, height, bmi, cc, pe, pmh, symptom, hpi
          FROM opdscreen
          WHERE vn = ?
          LIMIT 1
        `, [item.vn]);
        if (scRows && scRows.length > 0) {
          opdScreen = serializeRow(scRows[0]);
        }
      } catch (scErr) {
        console.warn('[telemed-pharmacy] Error fetching opdscreen:', scErr.message);
      }

      // 4. การวินิจฉัยโรค (ovstdiag)
      try {
        const diagRows = await connHos.query(`
          SELECT od.diagtype, od.icd10, i.name AS icd10_name, i.tname AS icd10_tname, d.name AS doctor_name
          FROM ovstdiag od
          LEFT JOIN icd101 i ON od.icd10 = i.code
          LEFT JOIN doctor d ON od.doctor = d.code
          WHERE od.vn = ?
          ORDER BY od.diagtype ASC
        `, [item.vn]);
        diagnoses = (diagRows || []).map(serializeRow);
      } catch (dgErr) {
        console.warn('[telemed-pharmacy] Error fetching diagnoses:', dgErr.message);
      }

      // 5. รายการยาของ VN นี้ (opitemrece + drugitems)
      try {
        const drugRows = await connHos.query(`
          SELECT 
            opi.hos_guid,
            opi.item_no,
            opi.icode,
            d.name AS drug_name,
            d.strength,
            d.units,
            opi.qty,
            opi.unitprice,
            opi.sum_price,
            du.name1 AS usage_line1,
            du.name2 AS usage_line2,
            du.name3 AS usage_line3,
            ds.name1 AS sp_usage_line1,
            ds.name2 AS sp_usage_line2
          FROM opitemrece opi
          JOIN drugitems d ON opi.icode = d.icode
          LEFT JOIN drugusage du ON opi.drugusage = du.drugusage
          LEFT JOIN sp_use ds ON opi.sp_use = ds.sp_use
          WHERE opi.vn = ?
          ORDER BY opi.item_no ASC
        `, [item.vn]);
        drugs = (drugRows || []).map(serializeRow);
      } catch (dErr) {
        console.warn('[telemed-pharmacy] Error fetching drug items:', dErr.message);
      }

      // 6. รายการเวชภัณฑ์มิใช่ยา / ค่าบริการ (opitemrece + nondrugitems)
      try {
        const ndRows = await connHos.query(`
          SELECT 
            opi.hos_guid,
            opi.item_no,
            opi.icode,
            d.name AS item_name,
            d.unit,
            opi.qty,
            opi.unitprice,
            opi.sum_price
          FROM opitemrece opi
          JOIN nondrugitems d ON opi.icode = d.icode
          WHERE opi.vn = ?
          ORDER BY opi.item_no ASC
        `, [item.vn]);
        nonDrugItems = (ndRows || []).map(serializeRow);
      } catch (ndErr) {
        console.warn('[telemed-pharmacy] Error fetching nondrug items:', ndErr.message);
      }
    }

    res.json({
      success: true,
      data: {
        stat: item,
        vn_stat: vnStat,
        opdscreen: opdScreen,
        diagnoses,
        drugs,
        nondrugitems: nonDrugItems,
        visit_info: visitInfo,
      },
    });
  } catch (err) {
    console.error('Error fetching telemed pharmacy detail:', err);
    res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดในการดึงรายละเอียด' });
  } finally {
    if (connVhos) connVhos.release();
    if (connHos) connHos.release();
  }
});

// ---------------------------------------------------------------------------
// 4. POST /api/telemed-pharmacy/:id/dispense — จัดยาเสร็จสิ้น (ระบุประเภทชำระเงิน)
// ---------------------------------------------------------------------------
router.post('/:id/dispense', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { payType, note } = req.body; // payType: 'FREE' | 'PAID'
  const username = req.user?.displayName || req.user?.name || req.user?.username || 'pharmacist';

  if (!payType || !['FREE', 'PAID'].includes(payType)) {
    return res.status(400).json({ error: 'กรุณาระบุประเภทการชำระเงิน (FREE หรือ PAID)' });
  }

  let connVhos;
  try {
    connVhos = await pool_vhos.getConnection();

    const nextStatus = payType === 'FREE' ? 'รอจัดส่ง' : 'รอชำระเงิน';
    const financeStatus = payType === 'FREE' ? 'WAIVED' : 'PENDING';

    await connVhos.query(`
      UPDATE virtualhos.telemed_stat
      SET 
        pharmacy_status = 'DISPENSED',
        pharmacy_pay_type = ?,
        pharmacy_note = COALESCE(?, pharmacy_note),
        finance_status = ?,
        dispensed_at = NOW(),
        dispensed_by = ?,
        status = ?,
        updated_at = NOW()
      WHERE id = ?
    `, [payType, note || null, financeStatus, username, nextStatus, id]);

    res.json({
      success: true,
      message: `บันทึกการจัดยาเรียบร้อยแล้ว (${payType === 'FREE' ? 'ไม่ต้องชำระเงิน' : 'มีค่าใช้จ่าย - รอการเงิน'})`,
    });
  } catch (err) {
    console.error('Error in pharmacy dispense:', err);
    res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดในการบันทึกการจัดยา' });
  } finally {
    if (connVhos) connVhos.release();
  }
});

// ---------------------------------------------------------------------------
// 5. POST /api/telemed-pharmacy/:id/delivery — บันทึกการจัดส่งยา (เลขพัสดุ)
// ---------------------------------------------------------------------------
router.post('/:id/delivery', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { tracking_number, delivery_type } = req.body;
  const username = req.user?.displayName || req.user?.name || req.user?.username || 'officer';

  if (!tracking_number || !tracking_number.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุหมายเลขพัสดุ (Tracking Number)' });
  }

  let connVhos;
  try {
    connVhos = await pool_vhos.getConnection();

    await connVhos.query(`
      UPDATE virtualhos.telemed_stat
      SET 
        tracking_number = ?,
        delivery_type = COALESCE(?, delivery_type, 'POST'),
        delivery_status = 'SHIPPED',
        delivery_at = NOW(),
        delivery_by = ?,
        status = 'จัดส่งเรียบร้อย',
        updated_at = NOW()
      WHERE id = ?
    `, [tracking_number.trim(), delivery_type || 'POST', username, id]);

    res.json({
      success: true,
      message: 'บันทึกการจัดส่งยาเรียบร้อยแล้ว',
    });
  } catch (err) {
    console.error('Error in pharmacy delivery:', err);
    res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดในการบันทึกการจัดส่ง' });
  } finally {
    if (connVhos) connVhos.release();
  }
});

module.exports = router;
