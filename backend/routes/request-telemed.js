const express = require('express');
const { pool_vhos, pool_hos } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Safely ensure request_by column exists in virtualhos.req_telemed (if user has ALTER privilege)
(async () => {
  let conn;
  try {
    conn = await pool_vhos.getConnection();
    await conn.query(`
      ALTER TABLE virtualhos.req_telemed 
      ADD COLUMN IF NOT EXISTS request_by VARCHAR(100) DEFAULT NULL COMMENT 'ผู้บันทึกคำขอ (เจ้าหน้าที่หรือคนไข้)'
    `);
    console.log('[req_telemed] Ensured request_by column exists in virtualhos.req_telemed');
  } catch (err) {
    // Non-fatal if DB user does not have ALTER permission or already exists
  } finally {
    if (conn) conn.release();
  }
})();

/**
 * Normalizes status string to match both with and without emoji
 */
function getStatusKeywords(status) {
  if (!status) return [];
  const trimmed = status.trim();
  if (trimmed.includes('รอตรวจสอบ')) return ['%รอตรวจสอบ%'];
  if (trimmed.includes('สามารถจัดส่งได้') && !trimmed.includes('ไม่สามารถ')) return ['%สามารถจัดส่งได้%'];
  if (trimmed.includes('ไม่สามารถจัดส่งได้')) return ['%ไม่สามารถจัดส่งได้%'];
  if (trimmed.includes('จัดส่งเรียบร้อย')) return ['%จัดส่งเรียบร้อย%'];
  return [`%${trimmed}%`];
}

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

// GET /api/request-telemed — List all telemed requests with filters, search, and pagination
router.get('/', authenticateToken, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const search = (req.query.search || '').trim();
  const statusFilter = (req.query.status || '').trim();
  const startDate = (req.query.startDate || '').trim();
  const endDate = (req.query.endDate || '').trim();
  const offset = (page - 1) * limit;

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    let whereConditions = ['1=1'];
    const params = [];

    // Search condition
    if (search) {
      whereConditions.push(`(
        hn LIKE ? OR 
        patient_name LIKE ? OR 
        phone LIKE ? OR 
        clinic_name LIKE ? OR 
        doctor_name LIKE ? OR 
        address LIKE ? OR 
        reason LIKE ? OR 
        symptoms LIKE ? OR
        tracking_number LIKE ? OR
        received_by LIKE ? OR
        approve_by LIKE ?
      )`);
      const searchParam = `%${search}%`;
      for (let i = 0; i < 11; i++) {
        params.push(searchParam);
      }
    }

    // Status filter
    if (statusFilter && statusFilter !== 'all') {
      const keywords = getStatusKeywords(statusFilter);
      if (keywords.length > 0) {
        whereConditions.push('(' + keywords.map(() => 'status LIKE ?').join(' OR ') + ')');
        params.push(...keywords);
      }
    }

    // Date range filter on created_at or nextdate
    if (startDate) {
      whereConditions.push('DATE(created_at) >= ?');
      params.push(startDate);
    }
    if (endDate) {
      whereConditions.push('DATE(created_at) <= ?');
      params.push(endDate);
    }

    const whereClause = whereConditions.join(' AND ');

    // 1. Total count with current filters
    const countQuery = `SELECT COUNT(*) AS total FROM virtualhos.req_telemed WHERE ${whereClause}`;
    const countResult = await conn.query(countQuery, params);
    const total = Number(countResult[0].total);

    // 2. Summary counts by status (overall)
    const summaryQuery = `
      SELECT 
        COUNT(*) AS total_all,
        SUM(CASE WHEN status LIKE '%รอตรวจสอบ%' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN status LIKE '%สามารถจัดส่งได้%' AND status NOT LIKE '%ไม่สามารถ%' THEN 1 ELSE 0 END) AS approved_count,
        SUM(CASE WHEN status LIKE '%ไม่สามารถจัดส่งได้%' THEN 1 ELSE 0 END) AS rejected_count,
        SUM(CASE WHEN status LIKE '%จัดส่งเรียบร้อย%' THEN 1 ELSE 0 END) AS delivered_count
      FROM virtualhos.req_telemed
    `;
    const summaryResult = await conn.query(summaryQuery);
    const summary = {
      total: Number(summaryResult[0]?.total_all || 0),
      pending: Number(summaryResult[0]?.pending_count || 0),
      approved: Number(summaryResult[0]?.approved_count || 0),
      rejected: Number(summaryResult[0]?.rejected_count || 0),
      delivered: Number(summaryResult[0]?.delivered_count || 0),
    };

    // 3. Fetch paginated data
    const dataQuery = `
      SELECT 
        id, oapp_id, hn, line_user_id, patient_name, nextdate, 
        clinic_name, doctor_name, reason, symptoms, address, 
        postcode, phone, status, received_by, received_at, 
        approve, approve_by, approve_at, tracking_number, delivery_at, 
        remark, created_at, updated_at
      FROM virtualhos.req_telemed
      WHERE ${whereClause}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `;
    const rows = await conn.query(dataQuery, [...params, limit, offset]);
    const serializedRows = rows.map(serializeRow);

    res.json({
      data: serializedRows,
      summary,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    console.error('Error fetching req_telemed data:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/request-telemed/:id — Single item detail
router.get('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  let conn;
  try {
    conn = await pool_vhos.getConnection();
    const query = `SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1`;
    const results = await conn.query(query, [id]);
    if (results.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูล' });
    }

    res.json(serializeRow(results[0]));
  } catch (err) {
    console.error('Error fetching req_telemed detail:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/request-telemed/:id/receive — รับเรื่องโดยเจ้าหน้าที่
router.post('/:id/receive', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const officerName = req.user.displayName || req.user.name || 'เจ้าหน้าที่';

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    // Check item exists
    const checkQuery = `SELECT id, received_by FROM virtualhos.req_telemed WHERE id = ? LIMIT 1`;
    const existing = await conn.query(checkQuery, [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลคำขอนี้' });
    }

    // Update received_by and received_at
    const updateQuery = `
      UPDATE virtualhos.req_telemed
      SET received_by = ?, received_at = NOW(), updated_at = NOW()
      WHERE id = ?
    `;
    await conn.query(updateQuery, [officerName, id]);

    // Return updated record
    const updated = await conn.query(`SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1`, [id]);
    res.json({
      message: 'รับเรื่องเรียบร้อยแล้ว',
      data: serializeRow(updated[0]),
    });
  } catch (err) {
    console.error('Error receiving req_telemed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/request-telemed/:id/approve — อนุมัติ หรือ ไม่อนุมัติ
router.post('/:id/approve', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { approve, remark } = req.body;
  const officerName = req.user.displayName || req.user.name || 'เจ้าหน้าที่';

  if (!approve || (approve !== 'Y' && approve !== 'N')) {
    return res.status(400).json({ error: 'ค่า approve ต้องเป็น Y หรือ N เท่านั้น' });
  }

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    // Check item exists
    const checkQuery = `SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1`;
    const existing = await conn.query(checkQuery, [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลคำขอนี้' });
    }

    const currentItem = existing[0];
    const newStatus = approve === 'Y' ? 'สามารถจัดส่งได้' : 'ไม่สามารถจัดส่งได้';
    const receivedBy = currentItem.received_by || officerName;
    const receivedAt = currentItem.received_at || new Date();

    const updateQuery = `
      UPDATE virtualhos.req_telemed
      SET 
        approve = ?,
        status = ?,
        approve_by = ?,
        approve_at = NOW(),
        remark = ?,
        received_by = ?,
        received_at = COALESCE(received_at, ?),
        updated_at = NOW()
      WHERE id = ?
    `;

    await conn.query(updateQuery, [
      approve,
      newStatus,
      officerName,
      remark !== undefined ? remark : currentItem.remark,
      receivedBy,
      receivedAt,
      id,
    ]);

    const updated = await conn.query(`SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1`, [id]);
    res.json({
      message: approve === 'Y' ? 'อนุมัติเรียบร้อยแล้ว (สามารถจัดส่งได้)' : 'บันทึกสถานะไม่อนุมัติเรียบร้อยแล้ว',
      data: serializeRow(updated[0]),
    });
  } catch (err) {
    console.error('Error approving req_telemed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/request-telemed/:id/delivery — บันทึกเลขพัสดุและจัดส่งเรียบร้อย
router.post('/:id/delivery', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { tracking_number } = req.body;

  if (!tracking_number || !tracking_number.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุเลขพัสดุ (Tracking Number)' });
  }

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    const checkQuery = `SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1`;
    const existing = await conn.query(checkQuery, [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลคำขอนี้' });
    }

    const updateQuery = `
      UPDATE virtualhos.req_telemed
      SET 
        tracking_number = ?,
        status = 'จัดส่งเรียบร้อย',
        delivery_at = NOW(),
        updated_at = NOW()
      WHERE id = ?
    `;
    await conn.query(updateQuery, [tracking_number.trim(), id]);

    const updated = await conn.query(`SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1`, [id]);
    res.json({
      message: 'บันทึกเลขพัสดุและสถานะจัดส่งเรียบร้อยแล้ว',
      data: serializeRow(updated[0]),
    });
  } catch (err) {
    console.error('Error updating delivery for req_telemed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/request-telemed/patient-appointments/:hn — Get patient profile and upcoming appointments from HOSxP
router.get('/patient-appointments/:hn', authenticateToken, async (req, res) => {
  const rawHn = (req.params.hn || '').trim();
  if (!rawHn) {
    return res.status(400).json({ error: 'กรุณาระบุเลข HN' });
  }

  let connHos;
  let connVhos;
  try {
    connHos = await pool_hos.getConnection();
    connVhos = await pool_vhos.getConnection();

    // 1. Query patient profile from HOSxP
    // Support searching by raw HN or trimmed leading zeros
    const strippedHn = rawHn.replace(/^0+/, '') || rawHn;
    const ptQuery = `
      SELECT p.hn, p.pname, p.fname, p.lname, p.addrpart, p.moopart, p.po_code,
             p.hometel, p.informtel, p.cid,
             tmb.name as tmb_name, amp.name as amp_name, chw.name as chw_name
      FROM patient p
      LEFT JOIN thaiaddress tmb ON tmb.addressid = CONCAT(p.chwpart, p.amppart, p.tmbpart)
      LEFT JOIN thaiaddress amp ON amp.addressid = CONCAT(p.chwpart, p.amppart, '00')
      LEFT JOIN thaiaddress chw ON chw.addressid = CONCAT(p.chwpart, '0000')
      WHERE p.hn = ? OR TRIM(LEADING '0' FROM p.hn) = ?
      LIMIT 1
    `;
    let ptRows = [];
    try {
      ptRows = await connHos.query(ptQuery, [rawHn, strippedHn]);
    } catch (addrErr) {
      console.warn('[req_telemed] Address join failed, falling back to simple patient query:', addrErr.message);
      const simplePtQuery = `
        SELECT p.hn, p.pname, p.fname, p.lname, p.addrpart, p.moopart, p.po_code,
               p.hometel, p.informtel, p.cid
        FROM patient p
        WHERE p.hn = ? OR TRIM(LEADING '0' FROM p.hn) = ?
        LIMIT 1
      `;
      ptRows = await connHos.query(simplePtQuery, [rawHn, strippedHn]);
    }

    if (!ptRows || ptRows.length === 0) {
      return res.status(404).json({ error: `ไม่พบข้อมูลผู้ป่วยสำหรับ HN ${rawHn} ในระบบ HOSxP` });
    }

    const pt = ptRows[0];
    const canonicalHn = pt.hn;

    const cleanAreaName = (name) => (name ? name.replace(/^(ต\.|ตำบล|อ\.|อำเภอ|จ\.|จังหวัด)/, '').trim() : '');
    const addrParts = [];
    if (pt.addrpart) addrParts.push(`บ้านเลขที่ ${pt.addrpart}`);
    if (pt.moopart && pt.moopart !== '-' && pt.moopart !== '0') addrParts.push(`หมู่ ${pt.moopart}`);
    if (pt.tmb_name) addrParts.push(`ต.${cleanAreaName(pt.tmb_name)}`);
    if (pt.amp_name) addrParts.push(`อ.${cleanAreaName(pt.amp_name)}`);
    if (pt.chw_name) addrParts.push(`จ.${cleanAreaName(pt.chw_name)}`);

    const patientProfile = {
      hn: canonicalHn,
      cid: pt.cid || '',
      fullname: `${pt.pname || ''}${pt.fname || ''} ${pt.lname || ''}`.trim(),
      address: addrParts.join(' '),
      postcode: pt.po_code || '',
      phone: (pt.informtel || pt.hometel || '').trim(),
    };

    // 2. Query upcoming appointments from HOSxP oapp (nextdate >= CURDATE())
    const oappQuery = `
      SELECT 
        o.oapp_id,
        o.vstdate, 
        o.nextdate, 
        o.nexttime, 
        o.endtime,
        c.name AS clinic_name, 
        d.name AS doctor_name, 
        o.note,
        o.app_cause
      FROM oapp o
      LEFT JOIN clinic c ON c.clinic = o.clinic
      LEFT JOIN doctor d ON d.code = o.doctor
      WHERE (o.hn = ? OR o.hn = ?) 
        AND o.nextdate >= CURDATE()
      ORDER BY o.nextdate ASC, o.nexttime ASC
    `;
    let apptRows = [];
    try {
      apptRows = await connHos.query(oappQuery, [canonicalHn, rawHn]);
    } catch (apptErr) {
      console.warn('[req_telemed] oapp join query failed, trying simpler oapp query:', apptErr.message);
      const simpleOapp = `
        SELECT oapp_id, vstdate, nextdate, nexttime, endtime, note, app_cause
        FROM oapp
        WHERE (hn = ? OR hn = ?) AND nextdate >= CURDATE()
        ORDER BY nextdate ASC, nexttime ASC
      `;
      apptRows = await connHos.query(simpleOapp, [canonicalHn, rawHn]);
    }

    // 3. Query existing requests in virtualhos.req_telemed for this HN
    const reqMap = {};
    try {
      const reqQuery = `
        SELECT id, oapp_id, hn, status, approve, tracking_number, reason, symptoms, address, postcode, phone, created_at
        FROM virtualhos.req_telemed
        WHERE hn = ? OR hn = ?
      `;
      const reqRows = await connVhos.query(reqQuery, [canonicalHn, rawHn]);
      for (const r of reqRows) {
        reqMap[Number(r.oapp_id)] = serializeRow(r);
      }
    } catch (reqErr) {
      console.warn('[req_telemed] Querying virtualhos.req_telemed error (ignored):', reqErr.message);
    }

    // Helper to format time range (e.g. 09.00 - 10.00 น.)
    const formatTimeRange = (nextTimeStr, endTimeStr) => {
      if (!nextTimeStr) return '';
      const [sH, sM] = String(nextTimeStr).split(':').map(Number);
      const startH = isNaN(sH) ? 0 : sH;
      const startM = isNaN(sM) ? 0 : sM;

      let endH;
      let endM;
      if (endTimeStr && endTimeStr !== '00:00:00') {
        const [eH, eM] = String(endTimeStr).split(':').map(Number);
        endH = isNaN(eH) ? (startH + 1) % 24 : eH;
        endM = isNaN(eM) ? startM : eM;
        if (endM === 29) endM = 30;
        else if (endM === 59) {
          endM = 0;
          endH = (endH + 1) % 24;
        }
      } else {
        endH = (startH + 1) % 24;
        endM = startM;
      }
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(startH)}.${pad(startM)} - ${pad(endH)}.${pad(endM)} น.`;
    };

    const appointments = apptRows.map((row) => {
      const oappIdNum = Number(row.oapp_id);
      const existingReq = reqMap[oappIdNum] || null;
      return {
        oappId: oappIdNum,
        vstdate: row.vstdate,
        nextdate: row.nextdate,
        nexttime: row.nexttime,
        endtime: row.endtime,
        timeRange: formatTimeRange(row.nexttime, row.endtime),
        clinicName: row.clinic_name || 'ไม่ระบุคลินิก',
        doctorName: row.doctor_name || 'ไม่ระบุแพทย์',
        note: row.note || '',
        appCause: row.app_cause || '',
        existingRequest: existingReq,
      };
    });

    res.json({
      patient: patientProfile,
      appointments,
    });
  } catch (err) {
    console.error('Error fetching patient appointments:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (connHos) connHos.release();
    if (connVhos) connVhos.release();
  }
});

// POST /api/request-telemed/register — Create a new telemed request from staff
router.post('/register', authenticateToken, async (req, res) => {
  const { oapp_id, hn, reason, symptoms, address, postcode, phone } = req.body;

  if (!oapp_id) {
    return res.status(400).json({ error: 'กรุณาระบุรหัสการนัดหมาย (oapp_id)' });
  }
  if (!hn) {
    return res.status(400).json({ error: 'กรุณาระบุเลข HN' });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุเหตุผลความจำเป็น' });
  }
  if (!symptoms || !symptoms.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุอาการปัจจุบัน' });
  }
  if (!address || !address.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุที่อยู่สำหรับจัดส่งยา' });
  }
  if (!postcode || !postcode.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุรหัสไปรษณีย์' });
  }
  if (!phone || !phone.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุหมายเลขโทรศัพท์' });
  }

  let connHos;
  let connVhos;
  try {
    connVhos = await pool_vhos.getConnection();

    // 1. Check if a request already exists for this oapp_id in virtualhos.req_telemed
    const checkSql = `SELECT id, status, approve, tracking_number FROM virtualhos.req_telemed WHERE oapp_id = ? LIMIT 1`;
    const existing = await connVhos.query(checkSql, [oapp_id]);
    if (existing && existing.length > 0) {
      return res.status(409).json({
        error: `มีการยื่นคำขอสำหรับนัดหมายนี้แล้ว (สถานะปัจจุบัน: ${existing[0].status})`,
        data: serializeRow(existing[0]),
      });
    }

    connHos = await pool_hos.getConnection();

    // 2. Fetch oapp details to verify appointment
    const oappSql = `
      SELECT o.oapp_id, o.nextdate, c.name AS clinic_name, d.name AS doctor_name
      FROM oapp o
      LEFT JOIN clinic c ON c.clinic = o.clinic
      LEFT JOIN doctor d ON d.code = o.doctor
      WHERE o.oapp_id = ? LIMIT 1
    `;
    let oappRows = [];
    try {
      oappRows = await connHos.query(oappSql, [oapp_id]);
    } catch {
      oappRows = await connHos.query(`SELECT oapp_id, nextdate FROM oapp WHERE oapp_id = ? LIMIT 1`, [oapp_id]);
    }

    if (!oappRows || oappRows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลการนัดหมายนี้ในระบบ HOSxP' });
    }
    const oapp = oappRows[0];

    // 3. Fetch patient name
    let patientName = null;
    try {
      const strippedHn = hn.replace(/^0+/, '') || hn;
      const ptSql = `SELECT pname, fname, lname FROM patient WHERE hn = ? OR TRIM(LEADING '0' FROM hn) = ? LIMIT 1`;
      const ptRows = await connHos.query(ptSql, [hn, strippedHn]);
      if (ptRows && ptRows.length > 0) {
        patientName = `${ptRows[0].pname || ''}${ptRows[0].fname || ''} ${ptRows[0].lname || ''}`.trim();
      }
    } catch (ptErr) {
      console.warn('[req_telemed] Error fetching patient name:', ptErr.message);
    }

    // 4. Check if patient has line_user_id in virtualhos.lineid
    let lineUserId = null;
    try {
      const strippedHn = hn.replace(/^0+/, '') || hn;
      const lineRows = await connVhos.query(
        `SELECT line_user_id FROM lineid WHERE hn = ? OR hn = ? LIMIT 1`,
        [hn, strippedHn]
      );
      if (lineRows && lineRows.length > 0 && lineRows[0].line_user_id) {
        lineUserId = lineRows[0].line_user_id;
      }
    } catch {
      // Ignore if lineid query fails
    }

    // 5. Staff recorder identifier
    const requestBy = req.user?.displayName || req.user?.name || req.user?.username || 'เจ้าหน้าที่';

    // 6. Insert into virtualhos.req_telemed (with defensive fallback if request_by column does not exist)
    try {
      const insertSql = `
        INSERT INTO virtualhos.req_telemed 
        (oapp_id, hn, line_user_id, patient_name, nextdate, clinic_name, doctor_name, reason, symptoms, address, postcode, phone, status, approve, request_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'รอตรวจสอบ', 'PENDING', ?, NOW())
      `;
      const insertRes = await connVhos.query(insertSql, [
        oapp_id,
        hn,
        lineUserId,
        patientName,
        oapp.nextdate,
        oapp.clinic_name || null,
        oapp.doctor_name || null,
        reason.trim(),
        symptoms.trim(),
        address.trim(),
        postcode.trim(),
        phone.trim(),
        requestBy,
      ]);

      return res.status(201).json({
        success: true,
        id: Number(insertRes.insertId),
        message: 'บันทึกคำขอรับยาไม่พบแพทย์เรียบร้อยแล้ว',
      });
    } catch (insertErr) {
      if (insertErr.message && insertErr.message.includes('request_by')) {
        console.warn('[req_telemed] Falling back to insert without request_by column:', insertErr.message);
        const fallbackSql = `
          INSERT INTO virtualhos.req_telemed 
          (oapp_id, hn, line_user_id, patient_name, nextdate, clinic_name, doctor_name, reason, symptoms, address, postcode, phone, status, approve, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'รอตรวจสอบ', 'PENDING', NOW())
        `;
        const insertRes = await connVhos.query(fallbackSql, [
          oapp_id,
          hn,
          lineUserId,
          patientName,
          oapp.nextdate,
          oapp.clinic_name || null,
          oapp.doctor_name || null,
          reason.trim(),
          symptoms.trim(),
          address.trim(),
          postcode.trim(),
          phone.trim(),
        ]);

        return res.status(201).json({
          success: true,
          id: Number(insertRes.insertId),
          message: 'บันทึกคำขอรับยาไม่พบแพทย์เรียบร้อยแล้ว',
        });
      }
      throw insertErr;
    }
  } catch (err) {
    console.error('Error registering req_telemed:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (connHos) connHos.release();
    if (connVhos) connVhos.release();
  }
});

module.exports = router;
