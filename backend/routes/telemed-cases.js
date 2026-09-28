const express = require('express');
const { pool_hos, pool_vhos } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/telemed-cases/visit-with-doctor (พบแพทย์)
// Query: where nextdate = ? and note like '%Telemed พบแพทย์%' and note like '%telemed%' and note not like '%Telemed ไม่พบแพทย์%'
router.get('/visit-with-doctor', authenticateToken, async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'ต้องการพารามิเตอร์ date' });
  }

  let conn;
  try {
    conn = await pool_hos.getConnection();
    const query = `
      SELECT 
        o.hn,
        CONCAT(p.pname, p.fname, ' ', p.lname) AS patient_name,
        d.name AS doctor_name,
        c.name AS clinic_name,
        o.note,
        o.nextdate,
        o.vstdate
      FROM oapp o
      LEFT JOIN patient p ON o.hn = p.hn
      LEFT JOIN doctor d ON o.doctor = d.code
      LEFT JOIN clinic c ON o.clinic = c.clinic
      WHERE o.nextdate = ?
        AND (o.note LIKE '%Telemed พบแพทย์%'
        OR o.note LIKE '%telemed%')
        AND o.note NOT LIKE '%Telemed ไม่พบแพทย์%'
      ORDER BY o.nexttime ASC;
    `;
    const results = await conn.query(query, [date]);
    res.json(results);
  } catch (err) {
    console.error('Error fetching telemed cases (with doctor):', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/telemed-cases/visit-no-doctor (ไม่พบแพทย์)
// Query: where nextdate = ? and note like '%Telemed ไม่พบแพทย์%'
router.get('/visit-no-doctor', authenticateToken, async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'ต้องการพารามิเตอร์ date' });
  }

  let conn;
  try {
    conn = await pool_hos.getConnection();
    const query = `
      SELECT 
        o.hn,
        CONCAT(p.pname, p.fname, ' ', p.lname) AS patient_name,
        d.name AS doctor_name,
        c.name AS clinic_name,
        o.note,
        o.nextdate,
        o.vstdate
      FROM oapp o
      LEFT JOIN patient p ON o.hn = p.hn
      LEFT JOIN doctor d ON o.doctor = d.code
      LEFT JOIN clinic c ON o.clinic = c.clinic
      WHERE o.nextdate = ?
        AND o.note LIKE '%Telemed ไม่พบแพทย์%'
      ORDER BY o.nexttime ASC;
    `;
    const results = await conn.query(query, [date]);
    res.json(results);
  } catch (err) {
    console.error('Error fetching telemed cases (no doctor):', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/telemed-cases/appointments (นัด Telemed)
// Query: where vstdate = ? and note like '%telemed%'
router.get('/appointments', authenticateToken, async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'ต้องการพารามิเตอร์ date' });
  }

  let connHos;
  let connVhos;
  try {
    connHos = await pool_hos.getConnection();
    const query = `
      SELECT 
        o.hn,
        CONCAT(p.pname, p.fname, ' ', p.lname) AS patient_name,
        d.name AS doctor_name,
        c.name AS clinic_name,
        o.note,
        o.nextdate,
        o.vstdate
      FROM oapp o
      LEFT JOIN patient p ON o.hn = p.hn
      LEFT JOIN doctor d ON o.doctor = d.code
      LEFT JOIN clinic c ON o.clinic = c.clinic
      WHERE o.vstdate = ?
        AND o.note LIKE '%telemed%'
      ORDER BY o.nexttime ASC;
    `;
    const results = await connHos.query(query, [date]);

    // Check lineid table status from pool_vhos
    if (results.length > 0) {
      const hns = results.map(row => row.hn).filter(Boolean);
      if (hns.length > 0) {
        connVhos = await pool_vhos.getConnection();
        const placeholders = hns.map(() => '?').join(',');
        const lineRows = await connVhos.query(
          `SELECT DISTINCT hn FROM lineid WHERE hn IN (${placeholders})`,
          hns
        );
        const linkedHns = new Set(lineRows.map(r => r.hn));

        results.forEach(row => {
          row.line_connected = linkedHns.has(row.hn);
        });
      } else {
        results.forEach(row => {
          row.line_connected = false;
        });
      }
    }

    res.json(results);
  } catch (err) {
    console.error('Error fetching telemed appointments:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connHos) connHos.release();
    if (connVhos) connVhos.release();
  }
});

// GET /api/telemed-cases/combined (พบแพทย์ + ไม่พบแพทย์ รวมกัน)
// Query: ดึงทั้งสองประเภทพร้อมกัน แล้วแปะ visit_type
router.get('/combined', authenticateToken, async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'ต้องการพารามิเตอร์ date' });
  }

  let conn;
  try {
    conn = await pool_hos.getConnection();

    const queryWithDoctor = `
      SELECT 
        o.hn,
        CONCAT(p.pname, p.fname, ' ', p.lname) AS patient_name,
        d.name AS doctor_name,
        c.name AS clinic_name,
        o.note,
        o.nextdate,
        o.vstdate,
        'with-doctor' AS visit_type
      FROM oapp o
      LEFT JOIN patient p ON o.hn = p.hn
      LEFT JOIN doctor d ON o.doctor = d.code
      LEFT JOIN clinic c ON o.clinic = c.clinic
      WHERE o.nextdate = ?
        AND (o.note LIKE '%Telemed พบแพทย์%'
        OR o.note LIKE '%telemed%')
        AND o.note NOT LIKE '%Telemed ไม่พบแพทย์%'
      ORDER BY o.nexttime ASC;
    `;

    const queryNoDoctor = `
      SELECT 
        o.hn,
        CONCAT(p.pname, p.fname, ' ', p.lname) AS patient_name,
        d.name AS doctor_name,
        c.name AS clinic_name,
        o.note,
        o.nextdate,
        o.vstdate,
        'no-doctor' AS visit_type
      FROM oapp o
      LEFT JOIN patient p ON o.hn = p.hn
      LEFT JOIN doctor d ON o.doctor = d.code
      LEFT JOIN clinic c ON o.clinic = c.clinic
      WHERE o.nextdate = ?
        AND o.note LIKE '%Telemed ไม่พบแพทย์%'
      ORDER BY o.nexttime ASC;
    `;

    const [withDoctorResults, noDoctorResults] = await Promise.all([
      conn.query(queryWithDoctor, [date]),
      conn.query(queryNoDoctor, [date]),
    ]);

    const combined = [...withDoctorResults, ...noDoctorResults];
    res.json(combined);
  } catch (err) {
    console.error('Error fetching combined telemed cases:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/telemed-cases/dashboard
// Query: ovst.ovstist = '09' (Telemed visit) พร้อม join ชื่อแพทย์/แผนก/ICD หลัก
// Params: startDate, endDate (YYYY-MM-DD)
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


