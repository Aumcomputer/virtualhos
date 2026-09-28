const express = require('express');
const { pool_vhos } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { runPrescreeningJob } = require('../cron/prescreeningCron');
BigInt.prototype.toJSON = function () { return this.toString() };
const router = express.Router();

// GET /api/prescreening — ดึงรายการ Pre-screening ตามฟิลเตอร์ต่างๆ
router.get('/', authenticateToken, async (req, res) => {
  const { date, search, status } = req.query;

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (date) {
      whereClause += ' AND appointment_date = ?';
      params.push(date);
    }

    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    if (search && search.trim() !== '') {
      const searchPattern = `%${search.trim()}%`;
      whereClause += ' AND (patient_name LIKE ? OR hn LIKE ? OR doctor_name LIKE ? OR clinic LIKE ? OR address LIKE ?)';
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    const query = `
      SELECT 
        p.id, p.token, p.oapp_id, p.hn, p.patient_name, p.appointment_date, 
        p.doctor_code, p.doctor_name, p.note, p.clinic, p.address, 
        p.phone, p.postal_code, p.smoking, p.smoking_detail, p.alcohol, p.alcohol_detail,
        p.sbp, p.dbp, p.pulse, p.temperature, p.rr, p.weight, p.height, p.spo2, 
        p.chief_complaint, p.current_medications, p.additional_notes, 
        p.status, p.line_sent, p.line_sent_timestamp, p.consent_given, 
        p.sent_at, p.completed_at, p.confirmed_at, p.confirmed_by, p.confirmed_vn, 
        p.expires_at, p.created_at, p.updated_at,
        (SELECT COUNT(*) FROM dextor.tele_prescreening_images img WHERE img.prescreening_id = p.id) AS image_count
      FROM dextor.tele_prescreening p
      ${whereClause}
      ORDER BY p.appointment_date ASC, p.created_at DESC
    `;

    const results = await conn.query(query, params);

    // Convert BigInt or decimal values to normal types to prevent JSON serialization crash (TypeError: Do not know how to serialize a BigInt)
    const serializedResults = results.map(row => {
      const newRow = {};
      for (const key in row) {
        if (typeof row[key] === 'bigint') {
          newRow[key] = Number(row[key]);
        } else {
          newRow[key] = row[key];
        }
      }
      return newRow;
    });

    res.json(serializedResults);
  } catch (err) {
    console.error('Error fetching prescreening list:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/prescreening/logs — ดึง log การทำงานของ Cron Job ย้อนหลัง 30 รายการ
router.get('/logs', authenticateToken, async (req, res) => {
  let conn;
  try {
    conn = await pool_vhos.getConnection();
    const query = `
      SELECT * FROM virtualhos.cron_job_logs
      ORDER BY created_at DESC
      LIMIT 30
    `;
    const results = await conn.query(query);

    // Convert BigInt values to Number to prevent JSON serialization crash
    const serializedResults = results.map(row => {
      const newRow = {};
      for (const key in row) {
        if (typeof row[key] === 'bigint') {
          newRow[key] = Number(row[key]);
        } else {
          newRow[key] = row[key];
        }
      }
      return newRow;
    });

    res.json(serializedResults);
  } catch (err) {
    console.error('Error fetching cron job logs:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/prescreening/run-now — สั่งรัน Cron Job ทันทีแบบ Manual (ผู้ดูแลระบบ)
router.post('/run-now', authenticateToken, async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] ได้รับคำสั่งสั่งรัน Pre-screening Cron Job ทันทีจาก API (User: ${req.user ? req.user.username : 'Unknown'})`);
    const summary = await runPrescreeningJob();
    res.json({
      success: true,
      message: 'รันระบบดึงข้อมูลนัดหมายและส่งข้อความแจ้งเตือนทาง LINE เรียบร้อยแล้ว',
      summary
    });
  } catch (err) {
    console.error('Error manually triggering prescreening job:', err.message);
    res.status(500).json({
      error: 'การทำงานของระบบประมวลผลดึงข้อมูลขัดข้อง',
      message: err.message
    });
  }
});

// GET /api/prescreening/:id/images — ดึงลิสต์รหัสรูปภาพของเคสคัดกรอง
router.get('/:id/images', authenticateToken, async (req, res) => {
  const { id } = req.params;
  let conn;
  try {
    conn = await pool_vhos.getConnection();
    const query = `
      SELECT id, mime_type FROM dextor.tele_prescreening_images
      WHERE prescreening_id = ?
      ORDER BY id ASC
    `;
    const results = await conn.query(query, [id]);
    res.json(results);
  } catch (err) {
    console.error('Error fetching images metadata:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/prescreening/images/:imageId — ดึงไฟล์รูปภาพดิบ (Binary data)
router.get('/images/:imageId', authenticateToken, async (req, res) => {
  const { imageId } = req.params;
  let conn;
  try {
    conn = await pool_vhos.getConnection();
    const query = `
      SELECT image_data, mime_type FROM dextor.tele_prescreening_images
      WHERE id = ? LIMIT 1
    `;
    const results = await conn.query(query, [imageId]);
    if (results.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }
    const record = results[0];
    res.setHeader('Content-Type', record.mime_type);
    res.send(record.image_data);
  } catch (err) {
    console.error('Error fetching raw image:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
