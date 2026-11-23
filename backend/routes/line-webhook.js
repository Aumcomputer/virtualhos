const express = require('express');
const { pool_vhos } = require('../config/database');
const {
  isSeaweedConfigured,
  uploadMediaBuffer,
  getMediaObject,
  verifyOutboundMediaSig,
  pipeMediaObjectToResponse,
} = require('../helpers/seaweedStorage');
const {
  verifyLineSignature,
  getLineUserProfile,
  downloadLineMessageContent,
} = require('../helpers/lineMessaging');
const { broadcastChatEvent } = require('../helpers/lineChatEvents');

const router = express.Router();

const PROFILE_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

function serializeMessage(row) {
  if (!row) return null;
  return {
    ...row,
    id: row.id != null ? Number(row.id) : null,
    room_id: row.room_id != null ? Number(row.room_id) : null,
    media_size: row.media_size != null ? Number(row.media_size) : null,
  };
}

function serializeRoom(row) {
  if (!row) return null;
  return {
    ...row,
    id: row.id != null ? Number(row.id) : null,
    unread_count: Number(row.unread_count || 0),
  };
}

async function findOrCreateRoom(connVhos, lineUserId) {
  await connVhos.query(
    'INSERT IGNORE INTO line_chat_rooms (line_user_id) VALUES (?)',
    [lineUserId]
  );
  const rows = await connVhos.query(
    'SELECT * FROM line_chat_rooms WHERE line_user_id = ? LIMIT 1',
    [lineUserId]
  );
  let room = rows[0];

  const needsProfileRefresh =
    !room.display_name ||
    !room.profile_updated_at ||
    Date.now() - new Date(room.profile_updated_at).getTime() > PROFILE_REFRESH_INTERVAL_MS;

  let nextDisplayName = room.display_name;
  let nextPictureUrl = room.picture_url;
  let nextProfileUpdatedAt = room.profile_updated_at;
  let nextHn = room.hn;
  let dirty = false;

  if (needsProfileRefresh) {
    const profile = await getLineUserProfile(lineUserId);
    if (profile) {
      nextDisplayName = profile.displayName || nextDisplayName;
      nextPictureUrl = profile.pictureUrl || nextPictureUrl;
      nextProfileUpdatedAt = new Date();
      dirty = true;
    }
  }

  // Match HN and fallback profile from lineid / caregiver_dependents
  if (!nextHn || !nextDisplayName) {
    const lineRows = await connVhos.query(
      'SELECT hn, active_hn, line_display_name, line_picture_url FROM lineid WHERE line_user_id = ? LIMIT 1',
      [lineUserId]
    );
    if (lineRows && lineRows.length > 0) {
      const l = lineRows[0];
      const matchedHn = (l.hn || l.active_hn || '').trim();
      if (!nextHn && matchedHn) {
        nextHn = matchedHn;
        dirty = true;
      }
      if (!nextDisplayName && l.line_display_name) {
        nextDisplayName = l.line_display_name;
        dirty = true;
      }
      if (!nextPictureUrl && l.line_picture_url) {
        nextPictureUrl = l.line_picture_url;
        dirty = true;
      }
    }
  }

  if (!nextHn) {
    const cgRows = await connVhos.query(
      "SELECT hn FROM caregiver_dependents WHERE line_user_id = ? AND status = 'ACTIVE' ORDER BY updated_at DESC LIMIT 1",
      [lineUserId]
    );
    if (cgRows && cgRows.length > 0 && cgRows[0].hn) {
      nextHn = String(cgRows[0].hn).trim();
      dirty = true;
    }
  }

  if (dirty) {
    await connVhos.query(
      `UPDATE line_chat_rooms
       SET display_name = ?, picture_url = ?, hn = ?, profile_updated_at = ?
       WHERE id = ?`,
      [nextDisplayName, nextPictureUrl, nextHn, nextProfileUpdatedAt, room.id]
    );
    const refreshed = await connVhos.query(
      'SELECT * FROM line_chat_rooms WHERE id = ? LIMIT 1',
      [room.id]
    );
    room = refreshed[0];
  }

  return room;
}

async function handleMessageEvent(connVhos, event) {
  const lineUserId = event.source.userId;
  const lineMsg = event.message || {};
  const lineMsgId = lineMsg.id ? String(lineMsg.id) : null;

  // Deduplicate LINE webhook retries
  if (lineMsgId) {
    const dup = await connVhos.query(
      'SELECT id FROM line_chat_messages WHERE line_message_id = ? LIMIT 1',
      [lineMsgId]
    );
    if (dup && dup.length > 0) {
      return;
    }
  }

  const room = await findOrCreateRoom(connVhos, lineUserId);
  const msgType = lineMsg.type || 'text';

  let content = null;
  let previewText = '';
  let mediaFilename = lineMsg.fileName || null;
  let stickerPackageId = null;
  let stickerId = null;

  switch (msgType) {
    case 'text':
      content = lineMsg.text || '';
      previewText = content.slice(0, 200);
      break;
    case 'image':
      previewText = '[รูปภาพ]';
      break;
    case 'sticker':
      stickerPackageId = lineMsg.packageId ? String(lineMsg.packageId) : null;
      stickerId = lineMsg.stickerId ? String(lineMsg.stickerId) : null;
      previewText = '[สติ๊กเกอร์]';
      break;
    case 'file':
      content = mediaFilename || 'ไฟล์แนบ';
      previewText = `[ไฟล์] ${mediaFilename || ''}`.trim();
      break;
    case 'video':
      previewText = '[วิดีโอ]';
      break;
    case 'audio':
      previewText = '[ข้อความเสียง]';
      break;
    case 'location': {
      const parts = [
        lineMsg.title,
        lineMsg.address,
        lineMsg.latitude != null ? `${lineMsg.latitude},${lineMsg.longitude}` : null,
      ].filter(Boolean);
      content = parts.join(' ');
      previewText = `[ตำแหน่งที่ตั้ง] ${lineMsg.title || ''}`.trim();
      break;
    }
    default:
      previewText = `[${msgType}]`;
      break;
  }

  let mediaKey = null;
  let mediaMime = null;
  let mediaSize = lineMsg.fileSize != null ? Number(lineMsg.fileSize) : null;
  let errorMessage = null;

  if (['image', 'file', 'video', 'audio'].includes(msgType) && lineMsgId) {
    try {
      const downloaded = await downloadLineMessageContent(lineMsgId);
      mediaMime = downloaded.contentType;
      mediaSize = downloaded.buffer.length;

      if (isSeaweedConfigured()) {
        const uploaded = await uploadMediaBuffer(downloaded.buffer, {
          direction: 'inbound',
          contentType: downloaded.contentType,
          filename: mediaFilename || '',
        });
        mediaKey = uploaded.key;
      } else {
        errorMessage = 'SEAWEEDFS_S3 ยังไม่ได้ตั้งค่าในระบบ';
      }
    } catch (mediaErr) {
      console.warn('[line-webhook] Failed to fetch/store inbound media:', mediaErr.message);
      errorMessage = mediaErr.message;
    }
  }

  let rawEventJson = null;
  try {
    rawEventJson = JSON.stringify(event);
  } catch (_e) {
    rawEventJson = null;
  }

  const insertRes = await connVhos.query(
    `INSERT INTO line_chat_messages (
      room_id, line_user_id, line_message_id, direction, message_type,
      content, media_key, media_mime, media_size, media_filename,
      sticker_package_id, sticker_id,
      delivery_method, delivery_status, error_message, raw_event
    ) VALUES (?, ?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?, ?, 'webhook', 'received', ?, ?)`,
    [
      room.id,
      lineUserId,
      lineMsgId,
      msgType,
      content,
      mediaKey,
      mediaMime,
      mediaSize,
      mediaFilename,
      stickerPackageId,
      stickerId,
      errorMessage,
      rawEventJson,
    ]
  );

  const replyToken = event.replyToken ? String(event.replyToken) : null;

  await connVhos.query(
    `UPDATE line_chat_rooms
     SET last_message_text = ?,
         last_message_type = ?,
         last_message_at = NOW(),
         last_direction = 'inbound',
         unread_count = unread_count + 1,
         last_reply_token = COALESCE(?, last_reply_token),
         last_reply_token_at = IF(? IS NOT NULL, NOW(), last_reply_token_at),
         status = 'open'
     WHERE id = ?`,
    [
      previewText.slice(0, 500),
      msgType,
      replyToken,
      replyToken,
      room.id,
    ]
  );

  const [msgRows, roomRows] = await Promise.all([
    connVhos.query('SELECT * FROM line_chat_messages WHERE id = ? LIMIT 1', [Number(insertRes.insertId)]),
    connVhos.query('SELECT * FROM line_chat_rooms WHERE id = ? LIMIT 1', [room.id]),
  ]);

  const savedMessage = serializeMessage(msgRows[0]);
  const updatedRoom = serializeRoom(roomRows[0]);

  broadcastChatEvent('new_message', {
    roomId: Number(room.id),
    message: savedMessage,
    room: updatedRoom,
  });
  broadcastChatEvent('room_updated', {
    room: updatedRoom,
  });
}

async function handleFollowEvent(connVhos, event) {
  const lineUserId = event.source.userId;
  const room = await findOrCreateRoom(connVhos, lineUserId);
  const replyToken = event.replyToken ? String(event.replyToken) : null;

  let rawEventJson = null;
  try {
    rawEventJson = JSON.stringify(event);
  } catch (_e) {
    rawEventJson = null;
  }

  const insertRes = await connVhos.query(
    `INSERT INTO line_chat_messages (
      room_id, line_user_id, direction, message_type,
      content, delivery_method, delivery_status, raw_event
    ) VALUES (?, ?, 'inbound', 'system', 'ผู้ใช้เพิ่มเพื่อน LINE OA', 'webhook', 'received', ?)`,
    [room.id, lineUserId, rawEventJson]
  );

  await connVhos.query(
    `UPDATE line_chat_rooms
     SET last_message_text = COALESCE(last_message_text, 'ผู้ใช้เพิ่มเพื่อน LINE OA'),
         last_message_at = COALESCE(last_message_at, NOW()),
         last_reply_token = COALESCE(?, last_reply_token),
         last_reply_token_at = IF(? IS NOT NULL, NOW(), last_reply_token_at)
     WHERE id = ?`,
    [replyToken, replyToken, room.id]
  );

  const [msgRows, roomRows] = await Promise.all([
    connVhos.query('SELECT * FROM line_chat_messages WHERE id = ? LIMIT 1', [Number(insertRes.insertId)]),
    connVhos.query('SELECT * FROM line_chat_rooms WHERE id = ? LIMIT 1', [room.id]),
  ]);

  const savedMessage = serializeMessage(msgRows[0]);
  const updatedRoom = serializeRoom(roomRows[0]);

  broadcastChatEvent('new_message', {
    roomId: Number(room.id),
    message: savedMessage,
    room: updatedRoom,
  });
  broadcastChatEvent('room_updated', {
    room: updatedRoom,
  });
}

async function processWebhookEvents(events) {
  let connVhos;
  try {
    connVhos = await pool_vhos.getConnection();
    for (const event of events) {
      if (!event?.source?.userId) continue;
      if (event.type === 'message') {
        await handleMessageEvent(connVhos, event);
      } else if (event.type === 'follow') {
        await handleFollowEvent(connVhos, event);
      }
    }
  } catch (err) {
    console.error('[line-webhook] Async processing error:', err);
  } finally {
    if (connVhos) connVhos.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/webhook — Health check
// ---------------------------------------------------------------------------
router.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'rbh-line-webhook' });
});

// ---------------------------------------------------------------------------
// POST /api/webhook — LINE Messaging API Webhook receiver
// ---------------------------------------------------------------------------
router.post('/', (req, res) => {
  if (!process.env.LINE_CHANNEL_SECRET) {
    console.error('[line-webhook] LINE_CHANNEL_SECRET is not configured');
    return res.status(500).json({ error: 'LINE_CHANNEL_SECRET is not configured' });
  }

  const signature = req.headers['x-line-signature'];
  const rawBody = req.rawBody;

  if (!verifyLineSignature(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid LINE signature' });
  }

  // Acknowledge immediately to satisfy LINE 1-2s webhook timeout
  res.status(200).json({ ok: true });

  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  if (events.length > 0) {
    setImmediate(() => {
      processWebhookEvents(events).catch((err) => {
        console.error('[line-webhook] Event batch failed:', err);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// GET & HEAD /api/webhook/media/:messageId — HMAC-signed outbound image stream
// ---------------------------------------------------------------------------
router.get('/media/:messageId', async (req, res) => {
  const { messageId } = req.params;
  const sig = req.query.sig;

  if (!verifyOutboundMediaSig(messageId, sig)) {
    return res.status(403).json({ error: 'Invalid or missing media signature' });
  }

  let connVhos;
  try {
    connVhos = await pool_vhos.getConnection();
    const rows = await connVhos.query(
      `SELECT id, media_key, media_mime, media_size
       FROM line_chat_messages
       WHERE id = ? AND direction = 'outbound' AND media_key IS NOT NULL
       LIMIT 1`,
      [messageId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const msg = rows[0];
    const obj = await getMediaObject(msg.media_key);

    res.setHeader('Content-Type', msg.media_mime || obj.contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    return await pipeMediaObjectToResponse(res, obj, {
      fallbackSize: msg.media_size,
      isHead: req.method === 'HEAD',
    });
  } catch (err) {
    console.error('[line-webhook] Error streaming outbound media:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to retrieve media' });
    }
    return res.end();
  } finally {
    if (connVhos) connVhos.release();
  }
});

module.exports = router;
