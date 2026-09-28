const express = require('express');
const { pool_vhos } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const scheduler = require('../cron/scheduler');

const router = express.Router();

// GET /api/cron-settings — ดึงการตั้งค่าเวลาของ Cron Job
router.get('/', authenticateToken, async (req, res) => {
  let conn;
  try {
    conn = await pool_vhos.getConnection();
    const query = `
      SELECT config_value FROM virtualhos.app_config 
      WHERE config_key = 'prescreening_cron_time' LIMIT 1
    `;
    const result = await conn.query(query);
    
    let time = '08:00';
    if (result.length > 0 && result[0].config_value) {
      time = result[0].config_value.trim();
    }
    
    res.json({ time });
  } catch (err) {
    console.error('Error fetching cron settings:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/cron-settings — อัปเดตเวลาของ Cron Job และ rescheduling ใหม่
router.put('/', authenticateToken, async (req, res) => {
  const { time } = req.body;

  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ error: 'ต้องการฟิลด์ time ในรูปแบบ HH:mm' });
  }

  const [hour, minute] = time.split(':').map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return res.status(400).json({ error: 'ค่าชั่วโมงหรือนาทีไม่ถูกต้อง' });
  }

  let conn;
  try {
    conn = await pool_vhos.getConnection();
    
    // บันทึกลงใน app_config
    const query = `
      INSERT INTO virtualhos.app_config (config_key, config_value, description)
      VALUES ('prescreening_cron_time', ?, 'เวลาที่ Cron Job ดึงนัด Telemed สำหรับ Pre-screening (HH:mm)')
      ON DUPLICATE KEY UPDATE config_value = ?
    `;
    await conn.query(query, [time, time]);

    // Reschedule in node-cron dynamically
    const rescheduleSuccess = scheduler.reschedule(time);

    if (rescheduleSuccess) {
      res.json({ success: true, message: 'บันทึกตั้งค่าเวลาและปรับปรุงตารางทำงานสำเร็จ' });
    } else {
      res.status(500).json({ error: 'ไม่สามารถปรับเปลี่ยนตารางเวลาทำงานแบบ real-time ได้' });
    }
  } catch (err) {
    console.error('Error updating cron settings:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
