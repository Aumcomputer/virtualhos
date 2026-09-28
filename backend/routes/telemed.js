const express = require('express');
const crypto = require('crypto');
const { pool_vhos } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { logActivity, getClientIp } = require('../helpers/activityLog');

const router = express.Router();

// POST /api/create-link — create or reuse telemed session
router.post('/', authenticateToken, async (req, res) => {
  const { hn, cid, patient_name, channel } = req.body;
  let { vn } = req.body;

  if (!hn || !cid || !patient_name) {
    return res.status(400).json({ error: "ข้อมูลไม่ครบถ้วน (ต้องการ hn, cid, patient_name)" });
  }

  const doctor_name = req.user.displayName || req.user.name || 'แพทย์';
  if (!vn) {
    vn = channel === 'moph' ? '2222222222' : '1111111111'; // เคสทดสอบ: 1111111111 สำหรับ LINE, 2222222222 สำหรับ หมอพร้อม
  }

  let conn_vhos;
  try {
    conn_vhos = await pool_vhos.getConnection();
    let doctorHash, patientHash;
    let isExisting = false;

    // 1. เช็คห้องเดิมที่ยังไม่หมดอายุใน database dextor
    const existing = await conn_vhos.query(
      "SELECT doctor_hash, patient_hash FROM dextor.telemed_sessions WHERE hn = ? AND vn = ? AND expires_at > NOW() LIMIT 1",
      [hn, vn]
    );

    if (existing.length > 0) {
      // กรณีเจอห้องเดิม: อัปเดตข้อมูลและดึง Hash เดิมมาใช้
      await conn_vhos.query(
        "UPDATE dextor.telemed_sessions SET doctor_name = ?, active = 'Y' WHERE hn = ? AND vn = ?",
        [doctor_name, hn, vn]
      );
      doctorHash = existing[0].doctor_hash;
      patientHash = existing[0].patient_hash;
      isExisting = true;
    } else {
      // กรณีสร้างใหม่: สร้าง Hash และ Insert ลง DB
      doctorHash = crypto.randomBytes(16).toString('hex');
      patientHash = crypto.randomBytes(16).toString('hex');
      const exp = new Date();
      exp.setHours(exp.getHours() + 24);

      await conn_vhos.query(
        `INSERT INTO dextor.telemed_sessions (hn, vn, cid, doctor_name, patient_name, doctor_hash, patient_hash, expires_at, active) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Y')`,
        [hn, vn, cid, doctor_name, patient_name, doctorHash, patientHash, exp]
      );
    }

    // --- เริ่มขั้นตอนการส่งข้อความแจ้งเตือน ---
    const frontendUrl = process.env.RBH_TELEMED_URL || process.env.FRONTEND_ORIGIN || `${req.protocol}://${req.get('host')}`;
    const doctorLink = `${frontendUrl}/join/${doctorHash}`;
    const patientLink = `${frontendUrl}/join/${patientHash}`;

    let lineStatus = "Not Sent";
    let mophStatus = "Not Sent";

    if (channel === 'moph') {
      const mophResult = await sendMophAlert(cid, patientLink);
      mophStatus = mophResult.success ? "Sent" : "Failed";
    } else {
      // LINE OA
      const lineRows = await conn_vhos.query(
        "SELECT line_user_id FROM lineid WHERE hn = ? LIMIT 1",
        [hn]
      );

      lineStatus = "Not Linked"; // สถานะเริ่มต้น (ผู้ป่วยยังไม่เคยผูก LINE)

      if (lineRows && lineRows.length > 0 && lineRows[0].line_user_id) {
        const lineUserId = lineRows[0].line_user_id;

        if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
          lineStatus = "Token Missing";
          console.warn("WARNING: LINE_CHANNEL_ACCESS_TOKEN is not defined in .env. Skipping LINE push notification.");
        } else {
          const isSent = await sendLineTelemedLink(lineUserId, patient_name, doctor_name, patientLink);
          lineStatus = isSent ? "Sent" : "Failed";
        }
      }
    }

    res.json({
      message: isExisting ? "อัปเดตข้อมูลและใช้ห้องตรวจเดิม" : "สร้างห้องตรวจใหม่เรียบร้อย",
      line_status: lineStatus,
      moph_status: mophStatus,
      doctor_link: doctorLink,
      patient_link: patientLink,
      hn, vn, cid, doctor_name, patient_name
    });

    // Fire-and-forget: log the telemed call action
    const actionType = channel === 'moph' ? 'call_mohpromt' : 'call_line_oa';
    const sendStatus = channel === 'moph' ? mophStatus : lineStatus;
    logActivity({
      username: req.user.name || req.user.displayName,
      action: actionType,
      detail: `hn=${hn}, patient=${patient_name}, doctor=${doctor_name}, status=${sendStatus}`,
      ip_address: getClientIp(req),
    });

  } catch (err) {
    console.error("Internal Server Error in create-link:", err);
    res.status(500).json({ error: "Internal Server Error" });
  } finally {
    if (conn_vhos) conn_vhos.release();
  }
});

// ---------------------------------------------------------------------------
// LINE notification helper
// ---------------------------------------------------------------------------
async function sendLineTelemedLink(lineUserId, patientName, doctorName, link) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    console.warn("WARNING: LINE_CHANNEL_ACCESS_TOKEN is not defined in .env. Skipping LINE push notification.");
    return false;
  }

  try {
    // จัดการเพิ่ม openExternalBrowser=1 เสมอ
    const externalLink = link.includes('?') ? `${link}&target=%22_blank%22&openExternalBrowser=1` : `${link}?target=%22_blank%22&openExternalBrowser=1`;

    // โครงสร้าง Flex Message
    const flexMessage = {
      type: "flex",
      altText: `ห้องตรวจออนไลน์พร้อมแล้ว - คุณ ${patientName}`,
      contents: {
        type: "bubble",
        size: "mega",
        hero: {
          type: "image",
          url: "https://telemed.rajburi.org/line-img/telemed1.jpg",
          size: "full",
          aspectRatio: "20:8",
          aspectMode: "cover",
          action: {
            type: "uri",
            uri: externalLink
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
              text: "ห้องตรวจออนไลน์",
              weight: "bold",
              size: "xl",
              margin: "md",
              color: "#111111",
              wrap: true
            },
            {
              type: "separator",
              margin: "xxl"
            },
            {
              type: "box",
              layout: "vertical",
              margin: "lg",
              spacing: "sm",
              contents: [
                {
                  type: "text",
                  text: "นัดหมายออนไลน์ของคุณพร้อมแล้ว",
                  wrap: true,
                  color: "#333333",
                  size: "md",
                  weight: "bold"
                },
                {
                  type: "text",
                  text: "กรุณากดปุ่มด้านล่างเพื่อเข้าสู่ห้อง Video call และรอพบแพทย์",
                  wrap: true,
                  color: "#666666",
                  size: "sm",
                  margin: "sm"
                }
              ]
            },
            {
              type: "box",
              layout: "vertical",
              margin: "xl",
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
                    { type: "text", text: doctorName, wrap: true, color: "#333333", size: "sm", flex: 6, weight: "bold" }
                  ],
                  margin: "md"
                }
              ],
              backgroundColor: "#f4f6f8",
              paddingAll: "12px",
              cornerRadius: "8px"
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
                label: "เข้าร่วม Video Call",
                uri: externalLink
              },
              style: "primary",
              color: "#28a745",
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

    console.log(`ส่งลิงก์ห้องตรวจให้ผู้ป่วยผ่าน LINE สำเร็จ (User ID: ${lineUserId})`);
    return true;
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการส่ง LINE:", error.message);
    return false;
  }
}
// ---------------------------------------------------------------------------
// MOPH notification helper
// ---------------------------------------------------------------------------
async function sendMophAlert(cid, link) {
  const externalLink = link.includes('?') ? `${link}&openExternalBrowser=1` : `${link}?openExternalBrowser=1`;
  const fullText = "คลิก Link เพื่อพบแพทย์ออนไลน์";

  const fullHtml = `
        <div style="font-family: sans-serif; text-align: center; padding: 20px;">
            <h3 style="color: #2c3e50;">โรงพยาบาลราชบุรี</h3>
            <p>ขอเชิญท่านเข้าพบแพทย์ผ่านระบบออนไลน์</p>
            <a href="${externalLink}" target="_blank" 
               style="display: inline-block; padding: 12px 25px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 10px 0;">
               เข้าห้องตรวจออนไลน์
            </a>
            <p style="font-size: 0.8em; color: #7f8c8d;">* แนะนำให้ใช้งานผ่าน Google Chrome หรือ Safari</p>
        </div>
    `;

  const payload = {
    "cid": [cid],
    "messages": [
      {
        "text": `${fullText}: ${externalLink}`,
        "type": "text"
      }],
    "message_title": "นัดหมายพบแพทย์ออนไลน์",
    "message_html": fullHtml,
    "message_text": fullText,
    "message_type": "HPT"
  };

  try {
    if (!process.env.apiMOPHUrl) {
      console.warn("WARNING: apiMOPHUrl is not defined in .env. Skipping MOPH alert.");
      return { success: false, error: "apiMOPHUrl missing" };
    }
    const response = await fetch(process.env.apiMOPHUrl, {
      method: 'POST',
      headers: {
        'client-key': process.env.MOPH_CLIENT_KEY,
        'secret-key': process.env.MOPH_SECRET_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let data = {};
    try { if (responseText) data = JSON.parse(responseText); } catch (e) { data = { raw: responseText }; }

    if (response.ok) {
      console.log(`[MOPH] ${cid} | ✅ Success (Status: ${response.status})`);
      return { success: true, data };
    } else {
      console.error(`[MOPH] ${cid} | ❌ Failed (Status: ${response.status}) | Data:`, data);
      return { success: false, error: data, status: response.status };
    }
  } catch (error) {
    console.error(`[MOPH] ${cid} | Alert Failed (Network):`, error.message);
    return { success: false, error: { message: error.message } };
  }
}

module.exports = router;
