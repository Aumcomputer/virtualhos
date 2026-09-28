const cron = require('node-cron');
const { pool_vhos } = require('../config/database');
const { runPrescreeningJob } = require('./prescreeningCron');

let activeCronTask = null;
let currentScheduledTime = null;

/**
 * Converts a time string (HH:mm) into a cron expression (m h * * *)
 */
function timeToCronExpression(timeStr) {
  const parts = timeStr.split(':');
  if (parts.length !== 2) {
    throw new Error('รูปแบบเวลาไม่ถูกต้อง ต้องเป็น HH:mm');
  }
  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);

  if (isNaN(hour) || hour < 0 || hour > 23 || isNaN(minute) || minute < 0 || minute > 59) {
    throw new Error('ค่าชั่วโมงหรือนาทีไม่ถูกต้อง');
  }

  return `${minute} ${hour} * * *`;
}

/**
 * Initializes and schedules the pre-screening cron job.
 */
async function initScheduler() {
  // ----------------------------------------------------------------------
  // 🛡️ เช็ค PM2 Instance: อนุญาตให้เฉพาะ Worker 0 เท่านั้นที่เป็นตัวตั้งเวลา
  // ----------------------------------------------------------------------
  const instanceId = process.env.NODE_APP_INSTANCE;

  if (typeof instanceId !== 'undefined' && instanceId !== '0') {
    console.log(`[PM2 Worker ${instanceId}] ข้ามการตั้งเวลา Cron Job (ทำงานเฉพาะ Worker 0)`);
    return; // หยุดการทำงานของฟังก์ชันนี้ทันที ไม่ตั้งเวลา
  }

  console.log(`[PM2 Worker ${instanceId || 'Dev'}] เริ่มต้นระบบตั้งเวลา Cron Job...`);
  // ----------------------------------------------------------------------

  let conn = null;
  let cronTime = '08:00'; // Default fallback

  try {
    conn = await pool_vhos.getConnection();
    const query = `
      SELECT config_value FROM virtualhos.app_config 
      WHERE config_key = 'prescreening_cron_time' LIMIT 1
    `;
    const result = await conn.query(query);
    if (result.length > 0 && result[0].config_value) {
      cronTime = result[0].config_value.trim();
    } else {
      const insertQuery = `
        INSERT IGNORE INTO virtualhos.app_config (config_key, config_value, description)
        VALUES ('prescreening_cron_time', '08:00', 'เวลาที่ Cron Job ดึงนัด Telemed สำหรับ Pre-screening (HH:mm)')
      `;
      await conn.query(insertQuery);
    }
  } catch (error) {
    console.error('ไม่สามารถอ่านเวลาตั้งค่า Cron จากฐานข้อมูลได้, ใช้ค่าเริ่มต้น 08:00:', error.message);
  } finally {
    if (conn) conn.release();
  }

  try {
    scheduleJob(cronTime);
  } catch (error) {
    console.error('ไม่สามารถเริ่มต้น Scheduler ได้:', error.message);
  }
}

/**
 * Schedules a cron job for a given time
 */
function scheduleJob(timeStr) {
  const cronExpression = timeToCronExpression(timeStr);

  if (activeCronTask) {
    activeCronTask.stop();
    console.log(`หยุดการทำงานของ Cron Job เดิม (เวลา: ${currentScheduledTime})`);
  }

  activeCronTask = cron.schedule(cronExpression, async () => {
    console.log(`[${new Date().toISOString()}] เริ่มทำงาน Pre-screening Cron Job อัตโนมัติ (ตั้งไว้เวลา: ${timeStr})...`);
    try {
      const summary = await runPrescreeningJob();
      console.log(`[${new Date().toISOString()}] Pre-screening Cron Job อัตโนมัติเสร็จสิ้น:`, summary);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Pre-screening Cron Job อัตโนมัติล้มเหลว:`, err.message);
    }
  });

  currentScheduledTime = timeStr;
  console.log(`ตั้งตารางการทำงาน Pre-screening Cron Job สำเร็จสำหรับเวลา: ${timeStr} (Cron: '${cronExpression}')`);
}

/**
 * Reschedules the cron job to a new time
 */
function reschedule(newTimeStr) {
  // บล็อคไม่ให้ Worker ตัวอื่นมารับคำสั่งเปลี่ยนเวลา
  const instanceId = process.env.NODE_APP_INSTANCE;
  if (typeof instanceId !== 'undefined' && instanceId !== '0') {
    return false;
  }

  try {
    scheduleJob(newTimeStr);
    return true;
  } catch (error) {
    console.error(`ไม่สามารถเปลี่ยนตารางเวลาเป็น ${newTimeStr} ได้:`, error.message);
    return false;
  }
}

// Start scheduler when server starts
initScheduler();

module.exports = {
  reschedule,
  getCurrentScheduledTime: () => currentScheduledTime
};