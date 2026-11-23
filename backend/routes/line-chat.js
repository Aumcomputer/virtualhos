const express = require('express');
const multer = require('multer');
const { pool_vhos, pool_hos } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const {
  isSeaweedConfigured,
  uploadMediaBuffer,
  getMediaObject,
  buildPublicOutboundMediaUrl,
  pipeMediaObjectToResponse,
} = require('../helpers/seaweedStorage');
const { sendLineMessageSmart } = require('../helpers/lineMessaging');
const { addSseClient, broadcastChatEvent } = require('../helpers/lineChatEvents');
const { getPatientNamesByHns } = require('../helpers/patient');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function serializeMessage(row) {
  if (!row) return null;
  return {
    id: row.id != null ? Number(row.id) : null,
    room_id: row.room_id != null ? Number(row.room_id) : null,
    line_user_id: row.line_user_id,
    line_message_id: row.line_message_id || null,
    direction: row.direction,
    message_type: row.message_type,
    content: row.content || null,
    media_key: row.media_key || null,
    media_mime: row.media_mime || null,
    media_size: row.media_size != null ? Number(row.media_size) : null,
    media_filename: row.media_filename || null,
    sticker_package_id: row.sticker_package_id || null,
    sticker_id: row.sticker_id || null,
    sent_by_username: row.sent_by_username || null,
    sent_by_name: row.sent_by_name || null,
    delivery_method: row.delivery_method,
    delivery_status: row.delivery_status,
    error_message: row.error_message || null,
    created_at: row.created_at,
  };
}

function serializeRoom(row) {
  if (!row) return null;
  return {
    id: row.id != null ? Number(row.id) : null,
    line_user_id: row.line_user_id,
    display_name: row.display_name || row.line_user_id,
    picture_url: row.picture_url || null,
    hn: row.effective_hn || row.hn || null,
    patient_name: row.patient_name || null,
    mobile_no: row.mobile_no || null,
    last_message_text: row.last_message_text || '',
    last_message_type: row.last_message_type || 'text',
    last_message_at: row.last_message_at || row.created_at,
    last_direction: row.last_direction || 'inbound',
    unread_count: Number(row.unread_count || 0),
    status: row.status || 'open',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeHnCandidates(rawHn) {
  if (!rawHn) return [];
  const clean = String(rawHn).trim();
  if (!clean) return [];
  const candidates = new Set([clean]);
  if (/^\d+$/.test(clean)) {
    if (clean.length < 7) candidates.add(clean.padStart(7, '0'));
    const stripped = clean.replace(/^0+/, '');
    if (stripped) candidates.add(stripped);
  }
  return Array.from(candidates);
}

function normalizeHnForStorage(rawHn) {
  if (!rawHn) return null;
  const clean = String(rawHn).trim();
  if (!clean) return null;
  if (/^\d+$/.test(clean) && clean.length < 7) {
    return clean.padStart(7, '0');
  }
  return clean;
}

const ROOM_SELECT_SQL = `
  SELECT
    r.*,
    l.hn AS lineid_hn,
    COALESCE(NULLIF(r.hn, ''), NULLIF(l.hn, ''), NULLIF(l.active_hn, '')) AS effective_hn,
    CASE
      WHEN NULLIF(r.hn, '') IS NULL OR r.hn = l.hn THEN
        COALESCE(
          NULLIF(l.ptname_hos, ''),
          NULLIF(TRIM(CONCAT(COALESCE(l.first_name, ''), ' ', COALESCE(l.last_name, ''))), '')
        )
      ELSE NULL
    END AS patient_name,
    COALESCE(NULLIF(r.display_name, ''), NULLIF(l.line_display_name, ''), r.line_user_id) AS resolved_display_name,
    COALESCE(NULLIF(r.picture_url, ''), NULLIF(l.line_picture_url, '')) AS resolved_picture_url,
    l.mobile_no
  FROM line_chat_rooms r
  LEFT JOIN (
    SELECT
      line_user_id,
      MAX(NULLIF(active_hn, '')) AS active_hn,
      MAX(NULLIF(hn, '')) AS hn,
      MAX(NULLIF(ptname_hos, '')) AS ptname_hos,
      MAX(NULLIF(first_name, '')) AS first_name,
      MAX(NULLIF(last_name, '')) AS last_name,
      MAX(NULLIF(mobile_no, '')) AS mobile_no,
      MAX(NULLIF(line_display_name, '')) AS line_display_name,
      MAX(NULLIF(line_picture_url, '')) AS line_picture_url
    FROM lineid
    GROUP BY line_user_id
  ) l ON l.line_user_id = r.line_user_id
`;

function mapRoomRow(row) {
  if (!row) return null;
  return serializeRoom({
    ...row,
    display_name: row.resolved_display_name || row.display_name,
    picture_url: row.resolved_picture_url || row.picture_url,
  });
}

async function enrichRoomsWithHosNames(rooms) {
  if (!rooms || rooms.length === 0) return rooms;
  const candidateSet = new Set();
  for (const room of rooms) {
    if (room.hn) {
      for (const cand of normalizeHnCandidates(room.hn)) {
        candidateSet.add(cand);
      }
    }
  }
  const allCandidates = Array.from(candidateSet);
  if (allCandidates.length === 0) return rooms;

  const nameMap = await getPatientNamesByHns(allCandidates);
  return rooms.map((room) => {
    if (!room.hn) return room;
    let hosName = null;
    for (const cand of normalizeHnCandidates(room.hn)) {
      if (nameMap[cand]) {
        hosName = nameMap[cand];
        break;
      }
    }
    return {
      ...room,
      patient_name: hosName || room.patient_name || null,
    };
  });
}

async function fetchEnrichedRoomById(connVhos, roomId) {
  const rows = await connVhos.query(
    `${ROOM_SELECT_SQL} WHERE r.id = ? LIMIT 1`,
    [roomId]
  );
  if (!rows || rows.length === 0) return null;
  const [enriched] = await enrichRoomsWithHosNames([mapRoomRow(rows[0])]);
  return enriched;
}

// ---------------------------------------------------------------------------
// 1. GET /api/line-chat/stream — Server-Sent Events (Real-time updates)
// ---------------------------------------------------------------------------
router.get('/stream', authenticateToken, (req, res) => {
  addSseClient(req, res);
});

// ---------------------------------------------------------------------------
// 2. GET /api/line-chat/unread-total — Total unread count for Sidebar badge
// ---------------------------------------------------------------------------
router.get('/unread-total', authenticateToken, async (_req, res) => {
  let connVhos;
  try {
    connVhos = await pool_vhos.getConnection();
    const rows = await connVhos.query(
      'SELECT COALESCE(SUM(unread_count), 0) AS total FROM line_chat_rooms'
    );
    res.json({ total: Number(rows[0]?.total || 0) });
  } catch (err) {
    console.error('[line-chat] unread-total error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connVhos) connVhos.release();
  }
});

// ---------------------------------------------------------------------------
// 3. GET /api/line-chat/rooms — Chat rooms list with search & filters
// ---------------------------------------------------------------------------
router.get('/rooms', authenticateToken, async (req, res) => {
  const search = (req.query.search || '').trim();
  const filter = (req.query.filter || 'all').toLowerCase(); // 'all' | 'unread' | 'linked'
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = (page - 1) * limit;

  let connVhos;
  try {
    connVhos = await pool_vhos.getConnection();

    const conditions = [];
    const params = [];

    if (filter === 'unread') {
      conditions.push('r.unread_count > 0');
    } else if (filter === 'linked') {
      conditions.push("COALESCE(NULLIF(r.hn, ''), NULLIF(l.hn, ''), NULLIF(l.active_hn, '')) IS NOT NULL");
    }

    if (search) {
      conditions.push(`(
        r.display_name LIKE ?
        OR r.hn LIKE ?
        OR r.line_user_id LIKE ?
        OR l.hn LIKE ?
        OR l.active_hn LIKE ?
        OR l.ptname_hos LIKE ?
        OR l.first_name LIKE ?
        OR l.last_name LIKE ?
        OR l.mobile_no LIKE ?
      )`);
      const s = `%${search}%`;
      params.push(s, s, s, s, s, s, s, s, s);
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await connVhos.query(
      `SELECT COUNT(*) AS total
       FROM line_chat_rooms r
       LEFT JOIN (
         SELECT line_user_id,
                MAX(NULLIF(active_hn, '')) AS active_hn,
                MAX(NULLIF(hn, '')) AS hn,
                MAX(NULLIF(ptname_hos, '')) AS ptname_hos,
                MAX(NULLIF(first_name, '')) AS first_name,
                MAX(NULLIF(last_name, '')) AS last_name,
                MAX(NULLIF(mobile_no, '')) AS mobile_no
         FROM lineid
         GROUP BY line_user_id
       ) l ON l.line_user_id = r.line_user_id
       ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const rows = await connVhos.query(
      `${ROOM_SELECT_SQL}
       ${whereSql}
       ORDER BY COALESCE(r.last_message_at, r.created_at) DESC, r.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const unreadRows = await connVhos.query(
      'SELECT COALESCE(SUM(unread_count), 0) AS total FROM line_chat_rooms'
    );
    const totalUnread = Number(unreadRows[0]?.total || 0);
    const enrichedRooms = await enrichRoomsWithHosNames(rows.map(mapRoomRow));

    res.json({
      data: enrichedRooms,
      totalUnread,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    console.error('[line-chat] rooms error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connVhos) connVhos.release();
  }
});

// ---------------------------------------------------------------------------
// 4. GET /api/line-chat/rooms/:roomId/messages — Paginated chat history
// ---------------------------------------------------------------------------
router.get('/rooms/:roomId/messages', authenticateToken, async (req, res) => {
  const roomId = parseInt(req.params.roomId, 10);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const beforeId = req.query.beforeId ? parseInt(req.query.beforeId, 10) : null;

  if (!roomId) {
    return res.status(400).json({ error: 'Invalid roomId' });
  }

  let connVhos;
  try {
    connVhos = await pool_vhos.getConnection();

    const roomRows = await connVhos.query(
      'SELECT id, unread_count FROM line_chat_rooms WHERE id = ? LIMIT 1',
      [roomId]
    );
    if (!roomRows || roomRows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบห้องแชทนี้' });
    }

    let sql = 'SELECT * FROM line_chat_messages WHERE room_id = ?';
    const params = [roomId];
    if (beforeId) {
      sql += ' AND id < ?';
      params.push(beforeId);
    }
    sql += ' ORDER BY id DESC LIMIT ?';
    params.push(limit + 1);

    const rawRows = await connVhos.query(sql, params);
    const hasMore = rawRows.length > limit;
    const sliced = hasMore ? rawRows.slice(0, limit) : rawRows;
    const messages = sliced.reverse().map(serializeMessage);

    if (!beforeId && Number(roomRows[0].unread_count || 0) > 0) {
      await connVhos.query(
        'UPDATE line_chat_rooms SET unread_count = 0 WHERE id = ?',
        [roomId]
      );
      broadcastChatEvent('room_read', { roomId });
    }

    res.json({ data: messages, hasMore });
  } catch (err) {
    console.error('[line-chat] messages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connVhos) connVhos.release();
  }
});

// ---------------------------------------------------------------------------
// 5. POST /api/line-chat/rooms/:roomId/read — Mark room as read
// ---------------------------------------------------------------------------
router.post('/rooms/:roomId/read', authenticateToken, async (req, res) => {
  const roomId = parseInt(req.params.roomId, 10);
  if (!roomId) return res.status(400).json({ error: 'Invalid roomId' });

  let connVhos;
  try {
    connVhos = await pool_vhos.getConnection();
    await connVhos.query('UPDATE line_chat_rooms SET unread_count = 0 WHERE id = ?', [roomId]);
    broadcastChatEvent('room_read', { roomId });
    res.json({ ok: true });
  } catch (err) {
    console.error('[line-chat] read error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connVhos) connVhos.release();
  }
});

// ---------------------------------------------------------------------------
// 6. GET /api/line-chat/rooms/:roomId/patient-info — HOSxP + Telemed context
// ---------------------------------------------------------------------------
router.get('/rooms/:roomId/patient-info', authenticateToken, async (req, res) => {
  const roomId = parseInt(req.params.roomId, 10);
  if (!roomId) return res.status(400).json({ error: 'Invalid roomId' });

  let connVhos;
  let connHos;
  try {
    connVhos = await pool_vhos.getConnection();
    const room = await fetchEnrichedRoomById(connVhos, roomId);
    if (!room) {
      return res.status(404).json({ error: 'ไม่พบห้องแชทนี้' });
    }

    const lineProfiles = await connVhos.query(
      `SELECT id, hn, active_hn, cid, line_user_id, line_display_name, line_picture_url,
              name_prefix, first_name, last_name, mobile_no, ptname_hos, ial, created_at
       FROM lineid
       WHERE line_user_id = ?
       ORDER BY id DESC`,
      [room.line_user_id]
    );

    const caregivers = await connVhos.query(
      `SELECT id, hn, cid, patient_name, relationship, ial, verify_type, status, created_at
       FROM caregiver_dependents
       WHERE line_user_id = ? AND status = 'ACTIVE'
       ORDER BY updated_at DESC`,
      [room.line_user_id]
    );

    const hnSet = new Set();
    for (const c of normalizeHnCandidates(room.hn)) hnSet.add(c);
    for (const lp of lineProfiles) {
      for (const c of normalizeHnCandidates(lp.active_hn)) hnSet.add(c);
      for (const c of normalizeHnCandidates(lp.hn)) hnSet.add(c);
    }
    for (const cg of caregivers) {
      for (const c of normalizeHnCandidates(cg.hn)) hnSet.add(c);
    }

    const hnList = Array.from(hnSet);
    let telemedRequests = [];
    if (hnList.length > 0) {
      const ph = hnList.map(() => '?').join(',');
      const reqRows = await connVhos.query(
        `SELECT id, hn, patient_name, nextdate, clinic_name, doctor_name, status, vn_today, created_at
         FROM virtualhos.req_telemed
         WHERE hn IN (${ph})
         ORDER BY created_at DESC
         LIMIT 5`,
        hnList
      );
      telemedRequests = reqRows.map((r) => ({
        ...r,
        id: Number(r.id),
      }));
    }

    let hosPatient = null;
    let appointments = [];
    const primaryCandidates = normalizeHnCandidates(room.hn || lineProfiles[0]?.hn || lineProfiles[0]?.active_hn);
    const lookupHns = primaryCandidates.length > 0 ? primaryCandidates : hnList;

    if (lookupHns.length > 0) {
      try {
        connHos = await pool_hos.getConnection();
        const ph = lookupHns.map(() => '?').join(',');
        const ptRows = await connHos.query(
          `SELECT p.hn, p.pname, p.fname, p.lname, p.birthday, p.hometel, p.informtel,
                  p.pttype, pt.name AS pttype_name
           FROM patient p
           LEFT JOIN pttype pt ON pt.pttype = p.pttype
           WHERE p.hn IN (${ph})
           LIMIT 1`,
          lookupHns
        );
        if (ptRows && ptRows.length > 0) {
          hosPatient = ptRows[0];
        }

        const apptRows = await connHos.query(
          `SELECT o.oapp_id, o.hn, o.nextdate, o.nexttime, o.clinic, c.name AS clinic_name,
                  o.doctor, d.name AS doctor_name, o.note, o.app_cause
           FROM oapp o
           LEFT JOIN clinic c ON c.clinic = o.clinic
           LEFT JOIN doctor d ON d.code = o.doctor
           WHERE o.hn IN (${ph}) AND o.nextdate >= CURDATE()
           ORDER BY o.nextdate ASC, o.nexttime ASC
           LIMIT 5`,
          lookupHns
        );
        appointments = (apptRows || []).map((a) => ({
          ...a,
          oapp_id: a.oapp_id != null ? Number(a.oapp_id) : null,
        }));
      } catch (hosErr) {
        console.warn('[line-chat] HOSxP lookup warning:', hosErr.message);
      }
    }

    res.json({
      room,
      lineProfiles: (lineProfiles || []).map((p) => ({ ...p, id: Number(p.id) })),
      caregivers: (caregivers || []).map((c) => ({ ...c, id: Number(c.id) })),
      hosPatient,
      appointments,
      telemedRequests,
    });
  } catch (err) {
    console.error('[line-chat] patient-info error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connVhos) connVhos.release();
    if (connHos) connHos.release();
  }
});

// ---------------------------------------------------------------------------
// 7. PUT /api/line-chat/rooms/:roomId/link-hn — Link / Unlink HN manually
// ---------------------------------------------------------------------------
router.put('/rooms/:roomId/link-hn', authenticateToken, async (req, res) => {
  const roomId = parseInt(req.params.roomId, 10);
  if (!roomId) return res.status(400).json({ error: 'Invalid roomId' });

  const normalizedHn = normalizeHnForStorage(req.body?.hn);

  let connVhos;
  try {
    connVhos = await pool_vhos.getConnection();
    const result = await connVhos.query(
      'UPDATE line_chat_rooms SET hn = ? WHERE id = ?',
      [normalizedHn, roomId]
    );
    if (Number(result.affectedRows || 0) === 0) {
      return res.status(404).json({ error: 'ไม่พบห้องแชทนี้' });
    }
    const updatedRoom = await fetchEnrichedRoomById(connVhos, roomId);
    broadcastChatEvent('room_updated', { room: updatedRoom });
    res.json({ ok: true, hn: normalizedHn, room: updatedRoom });
  } catch (err) {
    console.error('[line-chat] link-hn error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connVhos) connVhos.release();
  }
});

async function deliverAndPersistOutboundMessage(
  connVhos,
  res,
  { room, messageId, lineMessages, roomPreviewText, roomPreviewType, failPrefix }
) {
  try {
    const sendResult = await sendLineMessageSmart(connVhos, room, lineMessages);

    await connVhos.query(
      'UPDATE line_chat_messages SET delivery_method = ?, delivery_status = ? WHERE id = ?',
      [sendResult.method, 'sent', messageId]
    );

    await connVhos.query(
      `UPDATE line_chat_rooms
       SET last_message_text = ?,
           last_message_type = ?,
           last_message_at = NOW(),
           last_direction = 'outbound',
           unread_count = 0
       WHERE id = ?`,
      [roomPreviewText, roomPreviewType, room.id]
    );

    const [msgRows, updatedRoom] = await Promise.all([
      connVhos.query('SELECT * FROM line_chat_messages WHERE id = ? LIMIT 1', [messageId]),
      fetchEnrichedRoomById(connVhos, room.id),
    ]);

    const savedMessage = serializeMessage(msgRows[0]);
    broadcastChatEvent('new_message', {
      roomId: Number(room.id),
      message: savedMessage,
      room: updatedRoom,
    });
    broadcastChatEvent('room_updated', { room: updatedRoom });

    return res.json({ data: savedMessage, room: updatedRoom });
  } catch (lineErr) {
    await connVhos.query(
      'UPDATE line_chat_messages SET delivery_status = ?, error_message = ? WHERE id = ?',
      ['failed', lineErr.message, messageId]
    );
    const msgRows = await connVhos.query(
      'SELECT * FROM line_chat_messages WHERE id = ? LIMIT 1',
      [messageId]
    );
    const failedMessage = serializeMessage(msgRows[0]);
    broadcastChatEvent('new_message', {
      roomId: Number(room.id),
      message: failedMessage,
    });
    return res.status(502).json({
      error: `${failPrefix}: ${lineErr.message}`,
      data: failedMessage,
    });
  }
}

// ---------------------------------------------------------------------------
// 8. POST /api/line-chat/rooms/:roomId/messages/text — Send text reply
// ---------------------------------------------------------------------------
router.post('/rooms/:roomId/messages/text', authenticateToken, async (req, res) => {
  const roomId = parseInt(req.params.roomId, 10);
  if (!roomId) return res.status(400).json({ error: 'Invalid roomId' });

  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    return res.status(400).json({ error: 'กรุณาพิมพ์ข้อความก่อนส่ง' });
  }
  if (text.length > 5000) {
    return res.status(400).json({ error: 'ข้อความยาวเกิน 5,000 ตัวอักษร' });
  }

  let connVhos;
  try {
    connVhos = await pool_vhos.getConnection();
    const roomRows = await connVhos.query(
      'SELECT * FROM line_chat_rooms WHERE id = ? LIMIT 1',
      [roomId]
    );
    if (!roomRows || roomRows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบห้องแชทนี้' });
    }
    const room = roomRows[0];

    const sentByUsername = req.user?.name || req.user?.username || 'staff';
    const sentByName = req.user?.displayName || req.user?.name || 'เจ้าหน้าที่';

    const insertRes = await connVhos.query(
      `INSERT INTO line_chat_messages (
        room_id, line_user_id, direction, message_type, content,
        sent_by_username, sent_by_name, delivery_method, delivery_status
      ) VALUES (?, ?, 'outbound', 'text', ?, ?, ?, 'push', 'sent')`,
      [room.id, room.line_user_id, text, sentByUsername, sentByName]
    );
    const messageId = Number(insertRes.insertId);

    return await deliverAndPersistOutboundMessage(connVhos, res, {
      room,
      messageId,
      lineMessages: [{ type: 'text', text }],
      roomPreviewText: text.slice(0, 500),
      roomPreviewType: 'text',
      failPrefix: 'ส่งข้อความไป LINE ไม่สำเร็จ',
    });
  } catch (err) {
    console.error('[line-chat] send text error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connVhos) connVhos.release();
  }
});

// ---------------------------------------------------------------------------
// 9. POST /api/line-chat/rooms/:roomId/messages/image — Upload to SeaweedFS & send
// ---------------------------------------------------------------------------
router.post('/rooms/:roomId/messages/image', authenticateToken, (req, res) => {
  upload.single('image')(req, res, async (multerErr) => {
    if (multerErr) {
      return res.status(400).json({
        error: multerErr.code === 'LIMIT_FILE_SIZE'
          ? 'ไฟล์รูปภาพต้องมีขนาดไม่เกิน 10 MB'
          : `อัปโหลดรูปภาพไม่สำเร็จ: ${multerErr.message}`,
      });
    }

    const roomId = parseInt(req.params.roomId, 10);
    if (!roomId) return res.status(400).json({ error: 'Invalid roomId' });

    if (!req.file) {
      return res.status(400).json({ error: 'กรุณาเลือกไฟล์รูปภาพที่ต้องการส่ง' });
    }
    if (!['image/jpeg', 'image/png'].includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'รองรับเฉพาะไฟล์รูปภาพ JPEG และ PNG เท่านั้น' });
    }

    if (!isSeaweedConfigured()) {
      return res.status(503).json({
        error: 'ยังไม่ได้ตั้งค่า SeaweedFS S3 (SEAWEEDFS_S3_ENDPOINT / SEAWEEDFS_S3_BUCKET) ในระบบ',
      });
    }

    let connVhos;
    try {
      connVhos = await pool_vhos.getConnection();
      const roomRows = await connVhos.query(
        'SELECT * FROM line_chat_rooms WHERE id = ? LIMIT 1',
        [roomId]
      );
      if (!roomRows || roomRows.length === 0) {
        return res.status(404).json({ error: 'ไม่พบห้องแชทนี้' });
      }
      const room = roomRows[0];

      const uploaded = await uploadMediaBuffer(req.file.buffer, {
        direction: 'outbound',
        contentType: req.file.mimetype,
        filename: req.file.originalname,
      });

      const sentByUsername = req.user?.name || req.user?.username || 'staff';
      const sentByName = req.user?.displayName || req.user?.name || 'เจ้าหน้าที่';

      const insertRes = await connVhos.query(
        `INSERT INTO line_chat_messages (
          room_id, line_user_id, direction, message_type,
          media_key, media_mime, media_size, media_filename,
          sent_by_username, sent_by_name, delivery_method, delivery_status
        ) VALUES (?, ?, 'outbound', 'image', ?, ?, ?, ?, ?, ?, 'push', 'sent')`,
        [
          room.id,
          room.line_user_id,
          uploaded.key,
          uploaded.contentType,
          uploaded.size,
          req.file.originalname || 'image.jpg',
          sentByUsername,
          sentByName,
        ]
      );
      const messageId = Number(insertRes.insertId);
      const publicUrl = buildPublicOutboundMediaUrl(messageId);

      return await deliverAndPersistOutboundMessage(connVhos, res, {
        room,
        messageId,
        lineMessages: [
          {
            type: 'image',
            originalContentUrl: publicUrl,
            previewImageUrl: publicUrl,
          },
        ],
        roomPreviewText: '[รูปภาพ]',
        roomPreviewType: 'image',
        failPrefix: 'อัปโหลดรูปสำเร็จแต่ส่งไป LINE ไม่สำเร็จ',
      });
    } catch (err) {
      console.error('[line-chat] send image error:', err);
      return res.status(500).json({ error: `อัปโหลดรูปภาพไม่สำเร็จ: ${err.message}` });
    } finally {
      if (connVhos) connVhos.release();
    }
  });
});

// ---------------------------------------------------------------------------
// 10. GET /api/line-chat/media/:messageId — Authenticated staff SeaweedFS proxy
// ---------------------------------------------------------------------------
router.get('/media/:messageId', authenticateToken, async (req, res) => {
  const { messageId } = req.params;
  let connVhos;
  try {
    connVhos = await pool_vhos.getConnection();
    const rows = await connVhos.query(
      `SELECT id, media_key, media_mime, media_size, media_filename
       FROM line_chat_messages
       WHERE id = ? AND media_key IS NOT NULL
       LIMIT 1`,
      [messageId]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบไฟล์แนบ' });
    }

    const msg = rows[0];
    const obj = await getMediaObject(msg.media_key);
    const contentType = msg.media_mime || obj.contentType || 'application/octet-stream';
    const isImage = contentType.toLowerCase().startsWith('image/');
    const disposition = isImage ? 'inline' : 'attachment';
    const filename = (msg.media_filename || `media_${msg.id}`).replace(/["\r\n]/g, '_');

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.setHeader('Cache-Control', 'private, max-age=86400');

    return await pipeMediaObjectToResponse(res, obj, { fallbackSize: msg.media_size });
  } catch (err) {
    console.error('[line-chat] Error streaming media:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'ไม่สามารถโหลดไฟล์จาก SeaweedFS ได้' });
    }
    return res.end();
  } finally {
    if (connVhos) connVhos.release();
  }
});

module.exports = router;
