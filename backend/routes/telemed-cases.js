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
 * ตรวจสอบสถานะการลงทะเบียนใน virtualhos.lineid และ virtualhos.caregiver_dependents
 * สำหรับ HN หรือ CID ที่กำหนด
 */
async function enrichLineRegistration(connVhos, rows) {
  if (!rows || rows.length === 0) return rows;
  const hns = Array.from(new Set(rows.map(r => r.hn).filter(Boolean)));
  const cids = Array.from(new Set(rows.map(r => r.cid).filter(Boolean)));
  if (hns.length === 0 && cids.length === 0) {
    rows.forEach(r => {
      r.is_line_registered = false;
      r.line_type = null;
      r.line_connected = false;
    });
    return rows;
  }

  // 1. ตรวจสอบใน virtualhos.lineid
  const lineHnSet = new Set();
  const lineCidSet = new Set();
  const conditions = [];
  const params = [];
  if (hns.length > 0) {
    const plHn = hns.map(() => '?').join(',');
    conditions.push(`hn IN (${plHn})`, `active_hn IN (${plHn})`);
    params.push(...hns, ...hns);
  }
  if (cids.length > 0) {
    const plCid = cids.map(() => '?').join(',');
    conditions.push(`cid IN (${plCid})`);
    params.push(...cids);
  }

  if (conditions.length > 0) {
    const lineRows = await connVhos.query(
      `SELECT hn, active_hn, cid FROM virtualhos.lineid WHERE ${conditions.join(' OR ')}`,
      params
    );
    for (const r of (lineRows || [])) {
      if (r.hn) lineHnSet.add(String(r.hn));
      if (r.active_hn) lineHnSet.add(String(r.active_hn));
      if (r.cid) lineCidSet.add(String(r.cid));
    }
  }

  // 2. ตรวจสอบใน virtualhos.caregiver_dependents
  const cgHnSet = new Set();
  const cgCidSet = new Set();
  const cgConditions = [];
  const cgParams = [];
  if (hns.length > 0) {
    const plHn = hns.map(() => '?').join(',');
    cgConditions.push(`hn IN (${plHn})`);
    cgParams.push(...hns);
  }
  if (cids.length > 0) {
    const plCid = cids.map(() => '?').join(',');
    cgConditions.push(`cid IN (${plCid})`);
    cgParams.push(...cids);
  }

  if (cgConditions.length > 0) {
    const cgRows = await connVhos.query(
      `SELECT hn, cid FROM virtualhos.caregiver_dependents WHERE (${cgConditions.join(' OR ')}) AND status = 'ACTIVE'`,
      cgParams
    );
    for (const r of (cgRows || [])) {
      if (r.hn) cgHnSet.add(String(r.hn));
      if (r.cid) cgCidSet.add(String(r.cid));
    }
  }

  // กำหนดสถานะลงบนแถวข้อมูล
  rows.forEach(r => {
    const isLine = (r.hn && lineHnSet.has(String(r.hn))) || (r.cid && lineCidSet.has(String(r.cid)));
    const isCaregiver = (r.hn && cgHnSet.has(String(r.hn))) || (r.cid && cgCidSet.has(String(r.cid)));
    r.is_line_registered = Boolean(isLine || isCaregiver);
    r.line_type = isLine ? 'DIRECT' : (isCaregiver ? 'CAREGIVER' : null);
    r.line_connected = r.is_line_registered;
  });

  return rows;
}

// GET /api/telemed-cases/visit-with-doctor (พบแพทย์)
router.get('/visit-with-doctor', authenticateToken, async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'ต้องการพารามิเตอร์ date' });
  }

  let connHos;
  let connVhos;
  try {
    connHos = await pool_hos.getConnection();
    connVhos = await pool_vhos.getConnection();

    const query = `
      SELECT 
        o.oapp_id,
        o.hn,
        o.vn AS vn_oapp,
        COALESCE(
          NULLIF(TRIM(o.visit_vn), ''),
          (SELECT ov2.vn 
           FROM ovst ov2 
           WHERE ov2.hn = o.hn AND ov2.vstdate = o.nextdate 
           ORDER BY ov2.vsttime DESC 
           LIMIT 1)
        ) AS vn,
        p.cid,
        CONCAT(p.pname, p.fname, ' ', p.lname) AS patient_name,
        d.name AS doctor_name,
        c.name AS clinic_name,
        COALESCE(
          (SELECT ov1.pttype FROM ovst ov1 WHERE ov1.hn = o.hn AND ov1.vstdate = o.nextdate ORDER BY ov1.vsttime DESC LIMIT 1),
          ov.pttype,
          p.pttype
        ) AS pttype,
        COALESCE(
          (SELECT pt1.name FROM ovst ov1 LEFT JOIN pttype pt1 ON ov1.pttype = pt1.pttype WHERE ov1.hn = o.hn AND ov1.vstdate = o.nextdate ORDER BY ov1.vsttime DESC LIMIT 1),
          pt.name, 
          pt_pt.name
        ) AS pttype_name,
        o.note,
        o.nextdate,
        o.vstdate
      FROM oapp o
      LEFT JOIN patient p ON o.hn = p.hn
      LEFT JOIN doctor d ON o.doctor = d.code
      LEFT JOIN clinic c ON o.clinic = c.clinic
      LEFT JOIN ovst ov ON o.vn = ov.vn
      LEFT JOIN pttype pt ON ov.pttype = pt.pttype
      LEFT JOIN pttype pt_pt ON p.pttype = pt_pt.pttype
      WHERE o.nextdate = ?
        AND (o.note LIKE '%Telemed พบแพทย์%'
        OR o.note LIKE '%telemed%')
        AND o.note NOT LIKE '%Telemed ไม่พบแพทย์%'
      ORDER BY o.nexttime ASC;
    `;
    const results = (await connHos.query(query, [date]) || []).map(serializeRow);
    await enrichLineRegistration(connVhos, results);
    res.json(results);
  } catch (err) {
    console.error('Error fetching telemed cases (with doctor):', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connHos) connHos.release();
    if (connVhos) connVhos.release();
  }
});

// GET /api/telemed-cases/visit-no-doctor (ไม่พบแพทย์)
router.get('/visit-no-doctor', authenticateToken, async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'ต้องการพารามิเตอร์ date' });
  }

  let connHos;
  let connVhos;
  try {
    connHos = await pool_hos.getConnection();
    connVhos = await pool_vhos.getConnection();

    const query = `
      SELECT 
        o.oapp_id,
        o.hn,
        o.vn AS vn_oapp,
        COALESCE(
          NULLIF(TRIM(o.visit_vn), ''),
          (SELECT ov2.vn 
           FROM ovst ov2 
           WHERE ov2.hn = o.hn AND ov2.vstdate = o.nextdate 
           ORDER BY ov2.vsttime DESC 
           LIMIT 1)
        ) AS vn,
        p.cid,
        CONCAT(p.pname, p.fname, ' ', p.lname) AS patient_name,
        d.name AS doctor_name,
        c.name AS clinic_name,
        COALESCE(
          (SELECT ov1.pttype FROM ovst ov1 WHERE ov1.hn = o.hn AND ov1.vstdate = o.nextdate ORDER BY ov1.vsttime DESC LIMIT 1),
          ov.pttype,
          p.pttype
        ) AS pttype,
        COALESCE(
          (SELECT pt1.name FROM ovst ov1 LEFT JOIN pttype pt1 ON ov1.pttype = pt1.pttype WHERE ov1.hn = o.hn AND ov1.vstdate = o.nextdate ORDER BY ov1.vsttime DESC LIMIT 1),
          pt.name, 
          pt_pt.name
        ) AS pttype_name,
        o.note,
        o.nextdate,
        o.vstdate
      FROM oapp o
      LEFT JOIN patient p ON o.hn = p.hn
      LEFT JOIN doctor d ON o.doctor = d.code
      LEFT JOIN clinic c ON o.clinic = c.clinic
      LEFT JOIN ovst ov ON o.vn = ov.vn
      LEFT JOIN pttype pt ON ov.pttype = pt.pttype
      LEFT JOIN pttype pt_pt ON p.pttype = pt_pt.pttype
      WHERE o.nextdate = ?
        AND o.note LIKE '%Telemed ไม่พบแพทย์%'
      ORDER BY o.nexttime ASC;
    `;
    const results = (await connHos.query(query, [date]) || []).map(serializeRow);
    await enrichLineRegistration(connVhos, results);
    res.json(results);
  } catch (err) {
    console.error('Error fetching telemed cases (no doctor):', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connHos) connHos.release();
    if (connVhos) connVhos.release();
  }
});

// GET /api/telemed-cases/appointments (นัด Telemed)
router.get('/appointments', authenticateToken, async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'ต้องการพารามิเตอร์ date' });
  }

  let connHos;
  let connVhos;
  try {
    connHos = await pool_hos.getConnection();
    connVhos = await pool_vhos.getConnection();

    const query = `
      SELECT 
        o.oapp_id,
        o.hn,
        o.vn,
        p.cid,
        CONCAT(p.pname, p.fname, ' ', p.lname) AS patient_name,
        d.name AS doctor_name,
        c.name AS clinic_name,
        ov.pttype,
        COALESCE(pt.name, pt_pt.name) AS pttype_name,
        o.note,
        o.nextdate,
        o.vstdate
      FROM oapp o
      LEFT JOIN patient p ON o.hn = p.hn
      LEFT JOIN doctor d ON o.doctor = d.code
      LEFT JOIN clinic c ON o.clinic = c.clinic
      LEFT JOIN ovst ov ON o.vn = ov.vn
      LEFT JOIN pttype pt ON ov.pttype = pt.pttype
      LEFT JOIN pttype pt_pt ON p.pttype = pt_pt.pttype
      WHERE o.vstdate = ?
        AND o.note LIKE '%telemed%'
      ORDER BY o.nexttime ASC;
    `;
    const results = (await connHos.query(query, [date]) || []).map(serializeRow);
    await enrichLineRegistration(connVhos, results);
    res.json(results);
  } catch (err) {
    console.error('Error fetching telemed appointments:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connHos) connHos.release();
    if (connVhos) connVhos.release();
  }
});

// GET /api/telemed-cases/combined (คัดกรองแล้ว + พบแพทย์ + ไม่พบแพทย์ รวมกัน)
router.get('/combined', authenticateToken, async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'ต้องการพารามิเตอร์ date' });
  }

  let connHos;
  let connVhos;
  try {
    connHos = await pool_hos.getConnection();
    connVhos = await pool_vhos.getConnection();

    const queryWithDoctor = `
      SELECT 
        o.oapp_id,
        o.hn,
        o.vn AS vn_oapp,
        COALESCE(
          NULLIF(TRIM(o.visit_vn), ''),
          (SELECT ov2.vn 
           FROM ovst ov2 
           WHERE ov2.hn = o.hn AND ov2.vstdate = o.nextdate 
           ORDER BY ov2.vsttime DESC 
           LIMIT 1)
        ) AS vn,
        p.cid,
        CONCAT(p.pname, p.fname, ' ', p.lname) AS patient_name,
        d.name AS doctor_name,
        c.name AS clinic_name,
        COALESCE(
          (SELECT ov1.pttype FROM ovst ov1 WHERE ov1.hn = o.hn AND ov1.vstdate = o.nextdate ORDER BY ov1.vsttime DESC LIMIT 1),
          ov.pttype,
          p.pttype
        ) AS pttype,
        COALESCE(
          (SELECT pt1.name FROM ovst ov1 LEFT JOIN pttype pt1 ON ov1.pttype = pt1.pttype WHERE ov1.hn = o.hn AND ov1.vstdate = o.nextdate ORDER BY ov1.vsttime DESC LIMIT 1),
          pt.name, 
          pt_pt.name
        ) AS pttype_name,
        o.note,
        o.nextdate,
        o.vstdate,
        'with-doctor' AS visit_type
      FROM oapp o
      LEFT JOIN patient p ON o.hn = p.hn
      LEFT JOIN doctor d ON o.doctor = d.code
      LEFT JOIN clinic c ON o.clinic = c.clinic
      LEFT JOIN ovst ov ON o.vn = ov.vn
      LEFT JOIN pttype pt ON ov.pttype = pt.pttype
      LEFT JOIN pttype pt_pt ON p.pttype = pt_pt.pttype
      WHERE o.nextdate = ?
        AND (o.note LIKE '%Telemed พบแพทย์%'
        OR o.note LIKE '%telemed%')
        AND o.note NOT LIKE '%Telemed ไม่พบแพทย์%'
      ORDER BY o.nexttime ASC;
    `;

    const queryNoDoctor = `
      SELECT 
        o.oapp_id,
        o.hn,
        o.vn AS vn_oapp,
        COALESCE(
          NULLIF(TRIM(o.visit_vn), ''),
          (SELECT ov2.vn 
           FROM ovst ov2 
           WHERE ov2.hn = o.hn AND ov2.vstdate = o.nextdate 
           ORDER BY ov2.vsttime DESC 
           LIMIT 1)
        ) AS vn,
        p.cid,
        CONCAT(p.pname, p.fname, ' ', p.lname) AS patient_name,
        d.name AS doctor_name,
        c.name AS clinic_name,
        COALESCE(
          (SELECT ov1.pttype FROM ovst ov1 WHERE ov1.hn = o.hn AND ov1.vstdate = o.nextdate ORDER BY ov1.vsttime DESC LIMIT 1),
          ov.pttype,
          p.pttype
        ) AS pttype,
        COALESCE(
          (SELECT pt1.name FROM ovst ov1 LEFT JOIN pttype pt1 ON ov1.pttype = pt1.pttype WHERE ov1.hn = o.hn AND ov1.vstdate = o.nextdate ORDER BY ov1.vsttime DESC LIMIT 1),
          pt.name, 
          pt_pt.name
        ) AS pttype_name,
        o.note,
        o.nextdate,
        o.vstdate,
        'no-doctor' AS visit_type
      FROM oapp o
      LEFT JOIN patient p ON o.hn = p.hn
      LEFT JOIN doctor d ON o.doctor = d.code
      LEFT JOIN clinic c ON o.clinic = c.clinic
      LEFT JOIN ovst ov ON o.vn = ov.vn
      LEFT JOIN pttype pt ON ov.pttype = pt.pttype
      LEFT JOIN pttype pt_pt ON p.pttype = pt_pt.pttype
      WHERE o.nextdate = ?
        AND o.note LIKE '%Telemed ไม่พบแพทย์%'
      ORDER BY o.nexttime ASC;
    `;

    const queryScreening = `
      SELECT 
        p.id,
        p.token,
        p.oapp_id,
        p.hn,
        p.patient_name,
        p.appointment_date,
        p.appointment_date AS nextdate,
        p.created_at AS vstdate,
        p.doctor_code,
        p.doctor_name,
        p.clinic,
        p.clinic AS clinic_name,
        p.note,
        p.phone,
        p.address,
        p.postal_code,
        p.smoking,
        p.smoking_detail,
        p.alcohol,
        p.alcohol_detail,
        p.sbp,
        p.dbp,
        p.pulse,
        p.temperature,
        p.rr,
        p.weight,
        p.height,
        p.spo2,
        p.chief_complaint,
        p.current_medications,
        p.additional_notes,
        p.status,
        p.confirmed_vn,
        p.completed_at,
        'screening' AS visit_type
      FROM dextor.tele_prescreening p
      WHERE p.appointment_date = ?
        AND p.status IN ('completed', 'confirmed')
      ORDER BY p.completed_at DESC, p.id DESC;
    `;

    const [withDoctorResultsRaw, noDoctorResultsRaw, screeningResultsRaw] = await Promise.all([
      connHos.query(queryWithDoctor, [date]),
      connHos.query(queryNoDoctor, [date]),
      connVhos.query(queryScreening, [date]),
    ]);

    const withDoctorResults = (withDoctorResultsRaw || []).map(serializeRow);
    const noDoctorResults = (noDoctorResultsRaw || []).map(serializeRow);
    const screeningResults = (screeningResultsRaw || []).map(serializeRow);

    // ดึง CID และสิทธิ์การรักษา (จาก oapp.vn -> ovst.pttype และ patient) สำหรับ Screening
    if (screeningResults.length > 0) {
      const scrHns = Array.from(new Set(screeningResults.map(r => r.hn).filter(Boolean)));
      if (scrHns.length > 0) {
        const plHn = scrHns.map(() => '?').join(',');
        const ptRows = await connHos.query(
          `SELECT p.hn, p.cid, p.pttype, pt.name AS pttype_name 
           FROM patient p 
           LEFT JOIN pttype pt ON p.pttype = pt.pttype 
           WHERE p.hn IN (${plHn})`,
          scrHns
        );
        const ptMap = new Map((ptRows || []).map(r => [r.hn, r]));
        screeningResults.forEach(r => {
          const pt = ptMap.get(r.hn);
          if (pt) {
            r.cid = pt.cid || null;
            r.pttype = pt.pttype || null;
            r.pttype_name = pt.pttype_name || null;
          }
        });
      }

      // ดึงสิทธิ์จาก ovst.pttype ของ vn ที่ออกใบนัด (oapp) และดึง VN ปัจจุบัน
      const scrOappIds = Array.from(new Set(screeningResults.map(r => r.oapp_id).filter(Boolean)));
      if (scrOappIds.length > 0) {
        const plOapp = scrOappIds.map(() => '?').join(',');
        const oappRows = await connHos.query(
          `SELECT o.oapp_id, o.vn, o.visit_vn, ov.pttype, pt.name AS pttype_name
           FROM oapp o
           LEFT JOIN ovst ov ON o.vn = ov.vn
           LEFT JOIN pttype pt ON ov.pttype = pt.pttype
           WHERE o.oapp_id IN (${plOapp})`,
          scrOappIds
        );
        const oappMap = new Map((oappRows || []).map(r => [r.oapp_id, r]));
        screeningResults.forEach(r => {
          if (r.oapp_id && oappMap.has(r.oapp_id)) {
            const op = oappMap.get(r.oapp_id);
            if (op.pttype) r.pttype = op.pttype;
            if (op.pttype_name) r.pttype_name = op.pttype_name;
            r.vn_oapp = op.vn || null;
            r.visit_vn = (op.visit_vn && String(op.visit_vn).trim()) || null;
            r.vn = r.confirmed_vn || r.visit_vn || null;
          } else {
            r.vn = r.confirmed_vn || null;
          }
        });
      }

      // สำหรับเคสที่ยังไม่มี VN ลองค้นหาจาก ovst ในวันที่นัดหมาย (date)
      const missingVnHns = screeningResults.filter(r => !r.vn && r.hn).map(r => r.hn);
      if (missingVnHns.length > 0) {
        const plMiss = missingVnHns.map(() => '?').join(',');
        const ovstRows = await connHos.query(
          `SELECT hn, vn, pttype FROM ovst WHERE hn IN (${plMiss}) AND vstdate = ? ORDER BY vsttime DESC`,
          [...missingVnHns, date]
        );
        const ovstMap = new Map();
        for (const ov of (ovstRows || [])) {
          if (!ovstMap.has(ov.hn)) ovstMap.set(ov.hn, ov);
        }
        screeningResults.forEach(r => {
          if (!r.vn && ovstMap.has(r.hn)) {
            const ov = ovstMap.get(r.hn);
            r.vn = ov.vn;
            if (ov.pttype) r.pttype = ov.pttype;
          }
        });
      }
    }

    const combined = [...screeningResults, ...withDoctorResults, ...noDoctorResults];

    // ตรวจสอบสถานะการลงทะเบียนใน virtualhos.lineid และ virtualhos.caregiver_dependents
    await enrichLineRegistration(connVhos, combined);

    res.json(combined);
  } catch (err) {
    console.error('Error fetching combined telemed cases:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connHos) connHos.release();
    if (connVhos) connVhos.release();
  }
});

// GET /api/telemed-cases/prescreening/:hn (ค้นหาข้อมูลคัดกรอง tele_prescreening ของ HN)
router.get('/prescreening/:hn', authenticateToken, async (req, res) => {
  const { hn } = req.params;
  const { date } = req.query;
  let connVhos;
  try {
    connVhos = await pool_vhos.getConnection();
    let query = `
      SELECT 
        p.*,
        p.appointment_date AS nextdate,
        p.created_at AS vstdate,
        p.clinic AS clinic_name,
        'screening' AS visit_type
      FROM dextor.tele_prescreening p
      WHERE p.hn = ?
    `;
    const params = [hn];
    if (date) {
      query += ` AND p.appointment_date = ?`;
      params.push(date);
    }
    query += ` ORDER BY p.completed_at DESC, p.id DESC LIMIT 1`;
    let rows = await connVhos.query(query, params);
    if (!rows || rows.length === 0) {
      // Fallback: หากระบุ date แล้วไม่เจอ ให้ค้นหาประวัติคัดกรองล่าสุดของ HN นี้
      if (date) {
        rows = await connVhos.query(
          `SELECT p.*, p.appointment_date AS nextdate, p.created_at AS vstdate, p.clinic AS clinic_name, 'screening' AS visit_type 
           FROM dextor.tele_prescreening p 
           WHERE p.hn = ? 
           ORDER BY p.completed_at DESC, p.id DESC LIMIT 1`,
          [hn]
        );
      }
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลการคัดกรอง (Prescreening) สำหรับผู้ป่วยรายนี้' });
    }

    const row = serializeRow(rows[0]);

    // ดึง pttype และ pttype_name จาก patient ใน HOSxP หากยังไม่มี
    if (!row.pttype_name) {
      let connHos;
      try {
        connHos = await pool_hos.getConnection();
        const ptRows = await connHos.query(
          `SELECT p.pttype, pt.name AS pttype_name 
           FROM patient p 
           LEFT JOIN pttype pt ON p.pttype = pt.pttype 
           WHERE p.hn = ? LIMIT 1`,
          [hn]
        );
        if (ptRows && ptRows.length > 0) {
          row.pttype = row.pttype || ptRows[0].pttype;
          row.pttype_name = ptRows[0].pttype_name;
        }
      } catch (ptErr) {
        console.warn('Error fetching patient pttype for prescreening:', ptErr.message);
      } finally {
        if (connHos) connHos.release();
      }
    }

    res.json(row);
  } catch (err) {
    console.error('Error fetching prescreening by hn:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connVhos) connVhos.release();
  }
});

// GET /api/telemed-cases/dashboard
router.get('/dashboard', authenticateToken, async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'ต้องการพารามิเตอร์ startDate และ endDate' });
  }

  let conn;
  try {
    conn = await pool_hos.getConnection();
    const query = `
      SELECT
        v.vn,
        v.hn,
        CONCAT(p.pname, p.fname, ' ', p.lname) AS patient_name,
        v.vstdate,
        v.doctor AS doctor_code,
        d.name AS doctor_name,
        s.name AS spclty_name,
        od.icd10,
        i.name AS icd10_name
      FROM ovst v
      LEFT JOIN patient p ON v.hn = p.hn
      LEFT JOIN doctor d ON v.doctor = d.code
      LEFT JOIN spclty s ON v.spclty = s.spclty
      LEFT JOIN ovstdiag od ON v.vn = od.vn AND od.diagtype = '1'
      LEFT JOIN icd101 i ON od.icd10 = i.code
      WHERE v.vstdate BETWEEN ? AND ?
        AND v.ovstist = '09'
      ORDER BY v.vstdate DESC, v.hn;
    `;
    const results = await conn.query(query, [startDate, endDate]);
    res.json(results);
  } catch (err) {
    console.error('Error fetching telemed dashboard:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
