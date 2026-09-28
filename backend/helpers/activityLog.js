const { pool_vhos } = require('../config/database');

// ---------------------------------------------------------------------------
// Activity Log Helper
// ---------------------------------------------------------------------------
// Logs user activity (login, telemed calls) into the activity_logs table.
// Fire-and-forget by default — logging failures never block the main request.
// ---------------------------------------------------------------------------

/**
 * Insert an activity log entry.
 *
 * @param {Object} params
 * @param {string} params.username      - loginname of the user performing the action
 * @param {string} params.action        - action type: 'login', 'call_line_oa', 'call_mohpromt'
 * @param {string} [params.detail]      - JSON-safe detail string (e.g. patient info)
 * @param {string} [params.ip_address]  - IP address of the requester
 */
async function logActivity({ username, action, detail, ip_address }) {
  let conn;
  try {
    conn = await pool_vhos.getConnection();
    await conn.query(
      `INSERT INTO activity_logs (username, action, detail, ip_address) VALUES (?, ?, ?, ?)`,
      [
        username || '',
        action || '',
        detail ? String(detail).substring(0, 1000) : null,
        ip_address ? String(ip_address).substring(0, 45) : null,
      ]
    );
  } catch (err) {
    // Log to console but never throw — activity logging must not break the app
    console.error('Failed to write activity log:', err.message);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Extract client IP from request (respects X-Forwarded-For behind reverse proxy).
 * @param {import('express').Request} req
 * @returns {string}
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // X-Forwarded-For can be comma-separated; take the first (client) IP
    return String(forwarded).split(',')[0].trim().substring(0, 45);
  }
  return (req.ip || req.connection?.remoteAddress || '').substring(0, 45);
}

module.exports = { logActivity, getClientIp };
