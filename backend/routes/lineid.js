const express = require('express');
const { pool_vhos } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { formatLineIdRows } = require('../helpers/patient');

const router = express.Router();

// GET /api/lineid — all registrations with search & pagination
router.get('/', authenticateToken, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const search = (req.query.search || '').trim();
  const offset = (page - 1) * limit;

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    let whereClause = '';
    const params = [];

    if (search) {
      whereClause = `WHERE line_display_name LIKE ? OR hn LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR mobile_no LIKE ? OR cid LIKE ? OR ptname_hos LIKE ?`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    // Count total
    const countStmt = `SELECT COUNT(*) AS total FROM lineid ${whereClause}`;
    const countResult = await conn.query(countStmt, params);
    const total = Number(countResult[0].total);

    // Fetch data
    const dataStmt = `SELECT id, cid, hn, line_user_id, line_display_name, line_picture_url, name_prefix, first_name, last_name, mobile_no, ptname_hos, ial, created_at FROM lineid ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const rows = await conn.query(dataStmt, [...params, limit, offset]);

    const formatted = await formatLineIdRows(rows);

    res.json({
      data: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Error fetching lineid data:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/lineid/today — registrations by date (default = today)
router.get('/today', authenticateToken, async (req, res) => {
  // Validate date format
  let dateStr = req.query.date || '';
  if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }

  // Default to today (server timezone)
  if (!dateStr) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    dateStr = `${y}-${m}-${d}`;
  }

  const search = (req.query.search || '').trim();

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    let whereClause = `WHERE DATE(created_at) = ?`;
    const params = [dateStr];

    if (search) {
      whereClause += ` AND (line_display_name LIKE ? OR hn LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR mobile_no LIKE ? OR cid LIKE ? OR ptname_hos LIKE ?)`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    // Count
    const countStmt = `SELECT COUNT(*) AS total FROM lineid ${whereClause}`;
    const countResult = await conn.query(countStmt, params);
    const total = Number(countResult[0].total);

    // Fetch
    const dataStmt = `SELECT id, cid, hn, line_user_id, line_display_name, line_picture_url, name_prefix, first_name, last_name, mobile_no, ptname_hos, ial, created_at FROM lineid ${whereClause} ORDER BY created_at DESC`;
    const rows = await conn.query(dataStmt, params);

    const formatted = await formatLineIdRows(rows);

    res.json({
      data: formatted,
      date: dateStr,
      total,
    });
  } catch (err) {
    console.error('Error fetching today lineid data:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/lineid/:id/phone — update mobile phone number
router.put('/:id/phone', authenticateToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { phone } = req.body;

  if (!id || isNaN(id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  const cleanPhone = typeof phone === 'string' ? phone.trim() : '';

  let conn;
  try {
    conn = await pool_vhos.getConnection();
    const result = await conn.query('UPDATE lineid SET mobile_no = ? WHERE id = ?', [cleanPhone, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json({
      success: true,
      id,
      phone: cleanPhone,
      message: 'อัปเดตเบอร์โทรศัพท์เรียบร้อยแล้ว',
    });
  } catch (err) {
    console.error('Error updating lineid mobile_no:', err.message);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
