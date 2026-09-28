const express = require('express');
const { pool_vhos } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * Normalizes status string to match both with and without emoji
 */
function getStatusKeywords(status) {
  if (!status) return [];
  const trimmed = status.trim();
  if (trimmed.includes('รอตรวจสอบ')) return ['%รอตรวจสอบ%'];
  if (trimmed.includes('สามารถจัดส่งได้') && !trimmed.includes('ไม่สามารถ')) return ['%สามารถจัดส่งได้%'];
  if (trimmed.includes('ไม่สามารถจัดส่งได้')) return ['%ไม่สามารถจัดส่งได้%'];
  if (trimmed.includes('จัดส่งเรียบร้อย')) return ['%จัดส่งเรียบร้อย%'];
  return [`%${trimmed}%`];
}

function serializeRow(row) {
  if (!row) return null;
  const item = {};
  for (const key of Object.keys(row)) {
    if (typeof row[key] === 'bigint') {
      item[key] = Number(row[key]);
    } else {
      item[key] = row[key];
    }
  }
  return item;
}

// GET /api/request-telemed — List all telemed requests with filters, search, and pagination
router.get('/', authenticateToken, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const search = (req.query.search || '').trim();
  const statusFilter = (req.query.status || '').trim();
  const startDate = (req.query.startDate || '').trim();
  const endDate = (req.query.endDate || '').trim();
  const offset = (page - 1) * limit;

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    let whereConditions = ['1=1'];
    const params = [];

    // Search condition
    if (search) {
      whereConditions.push(`(
        hn LIKE ? OR 
        patient_name LIKE ? OR 
        phone LIKE ? OR 
        clinic_name LIKE ? OR 
        doctor_name LIKE ? OR 
        address LIKE ? OR 
        reason LIKE ? OR 
        symptoms LIKE ? OR
        tracking_number LIKE ? OR
        received_by LIKE ? OR
        approve_by LIKE ?
      )`);
      const searchParam = `%${search}%`;
      for (let i = 0; i < 11; i++) {
        params.push(searchParam);
      }
    }

    // Status filter
    if (statusFilter && statusFilter !== 'all') {
      const keywords = getStatusKeywords(statusFilter);
      if (keywords.length > 0) {
        whereConditions.push('(' + keywords.map(() => 'status LIKE ?').join(' OR ') + ')');
        params.push(...keywords);
      }
    }

    // Date range filter on created_at or nextdate
    if (startDate) {
      whereConditions.push('DATE(created_at) >= ?');
      params.push(startDate);
    }
    if (endDate) {
      whereConditions.push('DATE(created_at) <= ?');
      params.push(endDate);
    }

    const whereClause = whereConditions.join(' AND ');

    // 1. Total count with current filters
    const countQuery = `SELECT COUNT(*) AS total FROM virtualhos.req_telemed WHERE ${whereClause}`;
    const countResult = await conn.query(countQuery, params);
    const total = Number(countResult[0].total);

    // 2. Summary counts by status (overall)
    const summaryQuery = `
      SELECT 
        COUNT(*) AS total_all,
        SUM(CASE WHEN status LIKE '%รอตรวจสอบ%' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN status LIKE '%สามารถจัดส่งได้%' AND status NOT LIKE '%ไม่สามารถ%' THEN 1 ELSE 0 END) AS approved_count,
        SUM(CASE WHEN status LIKE '%ไม่สามารถจัดส่งได้%' THEN 1 ELSE 0 END) AS rejected_count,
        SUM(CASE WHEN status LIKE '%จัดส่งเรียบร้อย%' THEN 1 ELSE 0 END) AS delivered_count
      FROM virtualhos.req_telemed
    `;
    const summaryResult = await conn.query(summaryQuery);
    const summary = {
      total: Number(summaryResult[0]?.total_all || 0),
      pending: Number(summaryResult[0]?.pending_count || 0),
      approved: Number(summaryResult[0]?.approved_count || 0),
      rejected: Number(summaryResult[0]?.rejected_count || 0),
      delivered: Number(summaryResult[0]?.delivered_count || 0),
    };

    // 3. Fetch paginated data
    const dataQuery = `
      SELECT 
        id, oapp_id, hn, line_user_id, patient_name, nextdate, 
        clinic_name, doctor_name, reason, symptoms, address, 
        postcode, phone, status, received_by, received_at, 
        approve, approve_by, approve_at, tracking_number, delivery_at, 
        remark, created_at, updated_at
      FROM virtualhos.req_telemed
      WHERE ${whereClause}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `;
    const rows = await conn.query(dataQuery, [...params, limit, offset]);
    const serializedRows = rows.map(serializeRow);

    res.json({
      data: serializedRows,
      summary,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    console.error('Error fetching req_telemed data:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/request-telemed/:id — Single item detail
router.get('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  let conn;
  try {
    conn = await pool_vhos.getConnection();
    const query = `SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1`;
    const results = await conn.query(query, [id]);
    if (results.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูล' });
    }

    res.json(serializeRow(results[0]));
  } catch (err) {
    console.error('Error fetching req_telemed detail:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/request-telemed/:id/receive — รับเรื่องโดยเจ้าหน้าที่
router.post('/:id/receive', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const officerName = req.user.displayName || req.user.name || 'เจ้าหน้าที่';

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    // Check item exists
    const checkQuery = `SELECT id, received_by FROM virtualhos.req_telemed WHERE id = ? LIMIT 1`;
    const existing = await conn.query(checkQuery, [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลคำขอนี้' });
    }

    // Update received_by and received_at
    const updateQuery = `
      UPDATE virtualhos.req_telemed
      SET received_by = ?, received_at = NOW(), updated_at = NOW()
      WHERE id = ?
    `;
    await conn.query(updateQuery, [officerName, id]);

    // Return updated record
    const updated = await conn.query(`SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1`, [id]);
    res.json({
      message: 'รับเรื่องเรียบร้อยแล้ว',
      data: serializeRow(updated[0]),
    });
  } catch (err) {
    console.error('Error receiving req_telemed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/request-telemed/:id/approve — อนุมัติ หรือ ไม่อนุมัติ
router.post('/:id/approve', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { approve, remark } = req.body;
  const officerName = req.user.displayName || req.user.name || 'เจ้าหน้าที่';

  if (!approve || (approve !== 'Y' && approve !== 'N')) {
    return res.status(400).json({ error: 'ค่า approve ต้องเป็น Y หรือ N เท่านั้น' });
  }

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    // Check item exists
    const checkQuery = `SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1`;
    const existing = await conn.query(checkQuery, [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลคำขอนี้' });
    }

    const currentItem = existing[0];
    const newStatus = approve === 'Y' ? 'สามารถจัดส่งได้' : 'ไม่สามารถจัดส่งได้';
    const receivedBy = currentItem.received_by || officerName;
    const receivedAt = currentItem.received_at || new Date();

    const updateQuery = `
      UPDATE virtualhos.req_telemed
      SET 
        approve = ?,
        status = ?,
        approve_by = ?,
        approve_at = NOW(),
        remark = ?,
        received_by = ?,
        received_at = COALESCE(received_at, ?),
        updated_at = NOW()
      WHERE id = ?
    `;

    await conn.query(updateQuery, [
      approve,
      newStatus,
      officerName,
      remark !== undefined ? remark : currentItem.remark,
      receivedBy,
      receivedAt,
      id,
    ]);

    const updated = await conn.query(`SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1`, [id]);
    res.json({
      message: approve === 'Y' ? 'อนุมัติเรียบร้อยแล้ว (สามารถจัดส่งได้)' : 'บันทึกสถานะไม่อนุมัติเรียบร้อยแล้ว',
      data: serializeRow(updated[0]),
    });
  } catch (err) {
    console.error('Error approving req_telemed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/request-telemed/:id/delivery — บันทึกเลขพัสดุและจัดส่งเรียบร้อย
router.post('/:id/delivery', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { tracking_number } = req.body;

  if (!tracking_number || !tracking_number.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุเลขพัสดุ (Tracking Number)' });
  }

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    const checkQuery = `SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1`;
    const existing = await conn.query(checkQuery, [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลคำขอนี้' });
    }

    const updateQuery = `
      UPDATE virtualhos.req_telemed
      SET 
        tracking_number = ?,
        status = 'จัดส่งเรียบร้อย',
        delivery_at = NOW(),
        updated_at = NOW()
      WHERE id = ?
    `;
    await conn.query(updateQuery, [tracking_number.trim(), id]);

    const updated = await conn.query(`SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1`, [id]);
    res.json({
      message: 'บันทึกเลขพัสดุและสถานะจัดส่งเรียบร้อยแล้ว',
      data: serializeRow(updated[0]),
    });
  } catch (err) {
    console.error('Error updating delivery for req_telemed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
