const crypto = require('crypto');

const REPLY_TOKEN_MAX_AGE_MS = 18 * 60 * 1000;

/**
 * Verify X-Line-Signature header against raw request body using LINE_CHANNEL_SECRET.
 */
function verifyLineSignature(rawBody, signatureHeader) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !rawBody || !signatureHeader || typeof signatureHeader !== 'string') {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signatureHeader.trim(), 'utf8');
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Fetch LINE user profile (displayName, pictureUrl, statusMessage) via Messaging API.
 */
async function getLineUserProfile(lineUserId) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !lineUserId) return null;

  try {
    const res = await fetch(
      `https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      displayName: data.displayName || null,
      pictureUrl: data.pictureUrl || null,
      statusMessage: data.statusMessage || null,
    };
  } catch (err) {
    console.warn('[lineMessaging] Failed to fetch profile:', err.message);
    return null;
  }
}

/**
 * Download binary content (image/file/video/audio) sent by a LINE user.
 */
async function downloadLineMessageContent(lineMessageId) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');
  }

  const res = await fetch(
    `https://api-data.line.me/v2/bot/message/${encodeURIComponent(lineMessageId)}/content`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`LINE content download failed (${res.status}): ${errText}`);
  }
  const arrayBuf = await res.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuf),
    contentType: res.headers.get('content-type') || 'application/octet-stream',
  };
}

/**
 * Send messages to LINE user using Reply API first (free quota) when a fresh replyToken
 * is available, automatically falling back to Push API otherwise.
 */
async function sendLineMessageSmart(connVhos, room, lineMessages) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่าในระบบ');
  }

  const tokenAgeMs = room.last_reply_token_at
    ? Date.now() - new Date(room.last_reply_token_at).getTime()
    : Infinity;

  if (room.last_reply_token && tokenAgeMs >= 0 && tokenAgeMs < REPLY_TOKEN_MAX_AGE_MS) {
    const consumeRes = await connVhos.query(
      'UPDATE line_chat_rooms SET last_reply_token = NULL, last_reply_token_at = NULL WHERE id = ? AND last_reply_token = ?',
      [room.id, room.last_reply_token]
    );
    if (Number(consumeRes.affectedRows || 0) > 0) {
      try {
        const replyRes = await fetch('https://api.line.me/v2/bot/message/reply', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            replyToken: room.last_reply_token,
            messages: lineMessages,
          }),
        });
        if (replyRes.ok) {
          return { method: 'reply' };
        }
        const replyErr = await replyRes.text().catch(() => '');
        console.warn('[lineMessaging] Reply API failed, falling back to Push API:', replyRes.status, replyErr);
      } catch (replyFetchErr) {
        console.warn('[lineMessaging] Reply API request error, falling back to Push API:', replyFetchErr.message);
      }
    }
  }

  const pushRes = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: room.line_user_id,
      messages: lineMessages,
    }),
  });

  if (!pushRes.ok) {
    const pushErr = await pushRes.text().catch(() => '');
    throw new Error(`LINE Push API Error (${pushRes.status}): ${pushErr}`);
  }

  return { method: 'push' };
}

module.exports = {
  verifyLineSignature,
  getLineUserProfile,
  downloadLineMessageContent,
  sendLineMessageSmart,
};
