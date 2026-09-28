const { pool_hos, pool_vhos } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Sends a LINE Flex Message to a patient asking them to fill out the pre-screening form.
 * * @param {string} lineUserId - Patient's LINE user ID
 * @param {string} patientName - Patient's full name
 * @param {string} doctorName - Doctor's name
 * @param {string} appointmentDateThai - Thai formatted appointment date
 * @param {string} screeningLink - Link to pre-screening form (containing token)
 * @returns {Promise<boolean>} Resolves to true if sent successfully, otherwise false
 */
async function sendPrescreeningLineMessage(lineUserId, patientName, doctorName, appointmentDateThai, screeningLink) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    console.warn("WARNING: LINE_CHANNEL_ACCESS_TOKEN is not defined in .env. Skipping LINE pre-screening push.");
    return false;
  }

  try {
    const flexMessage = {
      type: "flex",
      altText: `กรุณากรอกข้อมูลคัดกรองก่อนพบแพทย์ - คุณ ${patientName}`,
      contents: {
        type: "bubble",
        size: "mega",
        hero: {
          type: "image",
          url: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?q=80&w=1000&auto=format&fit=crop",
          size: "full",
          aspectRatio: "20:9",
          aspectMode: "cover",
          action: {
            type: "uri",
            uri: screeningLink
          }
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "โรงพยาบาลราชบุรี",
              weight: "bold",
              color: "#0056b3",
              size: "sm"
            },
            {
              type: "text",
              text: "นัดพบแพทย์ออนไลน์",
              weight: "bold",
              size: "xl",
              margin: "md",
              color: "#111111"
            },
            {
              type: "separator",
              margin: "xxl"
            },
            {
              type: "box",
              layout: "vertical",
              margin: "xxl",
              spacing: "sm",
              contents: [
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    { type: "text", text: "👤", size: "sm", flex: 1, align: "center" },
                    { type: "text", text: "ชื่อผู้ป่วย:", color: "#aaaaaa", size: "sm", flex: 3 },
                    { type: "text", text: patientName, wrap: true, color: "#333333", size: "sm", flex: 6, weight: "bold" }
                  ]
                },
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    { type: "text", text: "🩺", size: "sm", flex: 1, align: "center" },
                    { type: "text", text: "แพทย์:", color: "#aaaaaa", size: "sm", flex: 3 },
                    { type: "text", text: doctorName || "ไม่ระบุแพทย์", wrap: true, color: "#333333", size: "sm", flex: 6, weight: "bold" }
                  ],
                  margin: "md"
                },
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    { type: "text", text: "📅", size: "sm", flex: 1, align: "center" },
                    { type: "text", text: "วันที่นัด:", color: "#aaaaaa", size: "sm", flex: 3 },
                    { type: "text", text: appointmentDateThai, wrap: true, color: "#333333", size: "sm", flex: 6, weight: "bold" }
                  ],
                  margin: "md"
                }
              ]
            },
            {
              type: "separator",
              margin: "xxl"
            },
            {
              type: "box",
              layout: "vertical",
              margin: "xxl",
              contents: [
                {
                  type: "text",
                  text: "⚠️ ข้อปฏิบัติก่อนพบแพทย์:",
                  color: "#ff4d4f",
                  size: "sm",
                  weight: "bold",
                  margin: "md"
                },
                {
                  type: "text",
                  text: "กรุณากดปุ่มด้านล่างเพื่อทำแบบคัดกรองอาการเบื้องต้น เพื่อความรวดเร็วในการเข้ารับบริการ",
                  wrap: true,
                  color: "#8c8c8c",
                  size: "xs",
                  margin: "sm",
                  align: "start"
                }
              ]
            }
          ],
          paddingAll: "20px"
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "button",
              action: {
                type: "uri",
                label: "กรอกข้อมูลเบื้องต้น",
                uri: screeningLink
              },
              style: "primary",
              color: "#0056b3",
              height: "sm"
            }
          ],
          paddingAll: "20px",
          paddingTop: "0px"
        }
      }
    };

    const messagePayload = {
      to: lineUserId,
      messages: [flexMessage]
    };

    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify(messagePayload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LINE Push Error: ${errText}`);
    }

    console.log(`ส่ง Flex Message คัดกรองผ่าน LINE สำเร็จ (User ID: ${lineUserId})`);
    return true;
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการส่ง LINE คัดกรอง:", error.message);
    return false;
  }
}

/**
 * Runs the pre-screening cron job.
 * Fetches tomorrow's Telemed appointments from HOSxP and stores them in dextor.tele_prescreening.
 * Then sends LINE notifications where line accounts exist.
 * * @returns {Promise<object>} Result summary of the run
 */
async function runPrescreeningJob() {
  const startedAt = new Date();
  let connVhos = null;
  let connHos = null;
  let logId = null;

  try {
    connVhos = await pool_vhos.getConnection();

    // 1. Write started log to virtualhos.cron_job_logs 
    // (นำ Guard เดิมออก เพราะ Scheduler จัดการเรื่อง Instance 0 ให้แล้ว)
    const startLogQuery = `
      INSERT INTO virtualhos.cron_job_logs (job_name, status, started_at)
      VALUES (?, ?, ?)
    `;
    const logResult = await connVhos.query(startLogQuery, ['prescreening_fetch', 'started', startedAt]);
    logId = Number(logResult.insertId);

    // 2. Fetch tomorrow's appointments from HOSxP oapp
    connHos = await pool_hos.getConnection();
    const fetchQuery = `
      SELECT 
        o.oapp_id,
        o.hn,
        CONCAT(p.pname, p.fname, ' ', p.lname) AS patient_name,
        d.code AS doctor_code,
        d.name AS doctor_name,
        o.note,
        c.name AS clinic_name,
        o.nextdate AS appointment_date
      FROM oapp o
      LEFT JOIN patient p ON o.hn = p.hn
      LEFT JOIN doctor d ON o.doctor = d.code
      LEFT JOIN clinic c ON o.clinic = c.clinic
      WHERE o.nextdate = CURDATE() + INTERVAL 1 DAY
        AND (o.note LIKE '%Telemed พบแพทย์%' OR o.note LIKE '%Telemed ไม่พบแพทย์%')
    `;
    const appointments = await connHos.query(fetchQuery);
    const recordsFound = appointments.length;

    let recordsInserted = 0;
    let lineSentCount = 0;
    let lineFailedCount = 0;

    // 3. Process each appointment
    for (const app of appointments) {
      // Check for duplicate in dextor.tele_prescreening
      const dupQuery = `
        SELECT COUNT(*) AS cnt FROM dextor.tele_prescreening
        WHERE oapp_id = ? AND appointment_date = ?
      `;
      const dupResult = await connVhos.query(dupQuery, [app.oapp_id, app.appointment_date]);
      const isDuplicate = Number(dupResult[0].cnt) > 0;

      let token = null;
      if (isDuplicate) {
        console.log(`ข้าม oapp_id ${app.oapp_id} เนื่องจากมีข้อมูลใน dextor.tele_prescreening อยู่แล้ว`);
        continue;
      }

      // Generate UUID token and calculate expires_at
      token = uuidv4();
      const expiresAt = `${app.appointment_date} 23:59:59`;

      // Insert into dextor.tele_prescreening
      const insertQuery = `
        INSERT INTO dextor.tele_prescreening (
          token, oapp_id, hn, patient_name, appointment_date, 
          doctor_code, doctor_name, note, clinic, 
          status, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW())
      `;
      await connVhos.query(insertQuery, [
        token,
        app.oapp_id,
        app.hn,
        app.patient_name,
        app.appointment_date,
        app.doctor_code,
        app.doctor_name,
        app.note,
        app.clinic_name,
        expiresAt
      ]);
      recordsInserted++;

      // 4. Try to find LINE account for the patient
      const lineQuery = `
        SELECT line_user_id FROM virtualhos.lineid
        WHERE hn = ? LIMIT 1
      `;
      const lineResult = await connVhos.query(lineQuery, [app.hn]);

      if (lineResult.length > 0) {
        const lineUserId = lineResult[0].line_user_id;
        let appDateThai = '';

        if (app.appointment_date instanceof Date) {
          const y = app.appointment_date.getUTCFullYear();
          const m = app.appointment_date.getUTCMonth();
          const d = app.appointment_date.getUTCDate();
          const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
          appDateThai = `${d} ${months[m]} ${y + 543}`;
        } else {
          const parts = String(app.appointment_date).split('-');
          if (parts.length === 3) {
            const y = parseInt(parts[0], 10) + 543;
            const m = parseInt(parts[1], 10) - 1;
            const d = parseInt(parts[2], 10);
            const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
            appDateThai = `${d} ${months[m]} ${y}`;
          } else {
            appDateThai = String(app.appointment_date);
          }
        }

        const docAndClinic = app.clinic_name ? `${app.clinic_name}${app.doctor_name ? ` (${app.doctor_name})` : ''}` : app.doctor_name;

        // Construct screening link
        const baseUrl = process.env.RBH_TELEMED_URL || 'https://telemed.rajburi.org';
        const screeningLink = `${baseUrl}/screening?token=${token}&openExternalBrowser=1`;

        // Send LINE notification
        const sent = await sendPrescreeningLineMessage(lineUserId, app.patient_name, docAndClinic, appDateThai, screeningLink);

        if (sent) {
          lineSentCount++;
          const updateSentQuery = `
            UPDATE dextor.tele_prescreening
            SET line_sent = 'Y', line_sent_timestamp = NOW(), sent_at = NOW()
            WHERE token = ?
          `;
          await connVhos.query(updateSentQuery, [token]);
        } else {
          lineFailedCount++;
        }
      } else {
        // No LINE account registered
        const updateNoLineQuery = `
          UPDATE dextor.tele_prescreening
          SET line_sent = 'NO_LINE'
          WHERE token = ?
        `;
        await connVhos.query(updateNoLineQuery, [token]);
      }
    }

    // 5. Update log to success
    const completedAt = new Date();
    const updateLogQuery = `
      UPDATE virtualhos.cron_job_logs
      SET status = 'success',
          records_found = ?,
          records_inserted = ?,
          line_sent_count = ?,
          line_failed_count = ?,
          completed_at = ?
      WHERE id = ?
    `;
    await connVhos.query(updateLogQuery, [
      recordsFound,
      recordsInserted,
      lineSentCount,
      lineFailedCount,
      completedAt,
      logId
    ]);

    return {
      success: true,
      recordsFound,
      recordsInserted,
      lineSentCount,
      lineFailedCount
    };

  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการรัน Pre-screening Cron Job:", error.message);

    // Update log to failed if logId is created
    if (logId && connVhos) {
      try {
        const completedAt = new Date();
        const updateFailedLogQuery = `
          UPDATE virtualhos.cron_job_logs
          SET status = 'failed',
              error_message = ?,
              completed_at = ?
          WHERE id = ?
        `;
        await connVhos.query(updateFailedLogQuery, [error.message, completedAt, logId]);
      } catch (logErr) {
        console.error("ไม่สามารถบันทึก error log ลงฐานข้อมูลได้:", logErr.message);
      }
    }

    throw error;
  } finally {
    if (connHos) connHos.release();
    if (connVhos) connVhos.release();
  }
}

module.exports = {
  runPrescreeningJob,
  sendPrescreeningLineMessage
};