const express = require('express');
const { pool_vhos, pool_hos } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Safely ensure workflow columns exist in virtualhos.req_telemed (if user has ALTER privilege)
(async () => {
  let conn;
  try {
    conn = await pool_vhos.getConnection();
    await conn.query(`
      ALTER TABLE virtualhos.req_telemed 
      ADD COLUMN IF NOT EXISTS request_by VARCHAR(100) DEFAULT NULL COMMENT 'ผู้บันทึกคำขอ (เจ้าหน้าที่หรือคนไข้)',
      ADD COLUMN IF NOT EXISTS doctor_approved_by VARCHAR(100) DEFAULT NULL COMMENT 'แพทย์ผู้อนุมัติหรือเจ้าหน้าที่ผู้ประสานแพทย์',
      ADD COLUMN IF NOT EXISTS doctor_approved_at DATETIME DEFAULT NULL COMMENT 'วันเวลาที่แพทย์อนุมัติ',
      ADD COLUMN IF NOT EXISTS doctor_remark TEXT DEFAULT NULL COMMENT 'เหตุผลหรือหมายเหตุจากแพทย์',
      ADD COLUMN IF NOT EXISTS pharmacy_approved_by VARCHAR(100) DEFAULT NULL COMMENT 'เภสัชกรผู้ตรวจอนุมัติยา',
      ADD COLUMN IF NOT EXISTS pharmacy_approved_at DATETIME DEFAULT NULL COMMENT 'วันเวลาที่เภสัชกรอนุมัติ',
      ADD COLUMN IF NOT EXISTS pharmacy_remark TEXT DEFAULT NULL COMMENT 'เหตุผลหรือหมายเหตุจากเภสัชกร'
    `);
    console.log('[req_telemed] Ensured workflow columns exist in virtualhos.req_telemed');
  } catch (err) {
    // Non-fatal if DB user does not have ALTER permission or already exists
  } finally {
    if (conn) conn.release();
  }
})();

/**
 * Normalizes status string to match both with and without emoji
 */
function getStatusKeywords(status) {
  if (!status) return [];
  const trimmed = status.trim();
  if (trimmed.includes('รอตรวจสอบ')) return ['%รอตรวจสอบ%'];
  if (trimmed.includes('รอปรึกษาแพทย์')) return ['%รอปรึกษาแพทย์%'];
  if (trimmed.includes('รอเภสัช')) return ['%รอเภสัช%'];
  if (trimmed.includes('สามารถจัดส่งได้') && !trimmed.includes('ไม่สามารถ')) return ['%สามารถจัดส่งได้%'];
  if (trimmed.includes('ไม่สามารถจัดส่งได้') || trimmed.includes('ไม่อนุมัติ')) return ['%ไม่สามารถจัดส่งได้%', '%ไม่อนุมัติ%'];
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

function formatToYMD(val) {
  if (!val) return null;
  if (val instanceof Date) {
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const s = String(val).trim();
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  return s;
}


// GET /api/request-telemed — List requests with stage, filters, search, sorting, and pagination
router.get('/', authenticateToken, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const search = (req.query.search || '').trim();
  const stage = (req.query.stage || '').trim();
  const statusFilter = (req.query.status || '').trim();
  const startDate = (req.query.startDate || '').trim();
  const endDate = (req.query.endDate || '').trim();
  const offset = (page - 1) * limit;

  // Sorting
  const allowedSorts = {
    id: 'id',
    created_at: 'created_at',
    nextdate: 'nextdate',
    hn: 'hn',
    patient_name: 'patient_name',
    clinic_name: 'clinic_name',
    doctor_name: 'doctor_name',
    status: 'status',
    received_at: 'received_at',
    delivery_at: 'delivery_at',
  };
  const sortCol = allowedSorts[req.query.sortBy] || 'id';
  const sortOrder = String(req.query.sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    let whereConditions = ['1=1'];
    const params = [];

    // Stage filters
    if (stage === 'receive') {
      // 2. รอรับเรื่อง: คำขอใหม่ที่ยังไม่ได้กดรับเรื่อง
      whereConditions.push("(status LIKE '%รอตรวจสอบ%' AND (received_by IS NULL OR received_by = ''))");
    } else if (stage === 'doctor') {
      // 3. รอปรึกษาแพทย์: รับเรื่องแล้ว รอแพทย์อนุมัติ
      whereConditions.push("status LIKE '%รอปรึกษาแพทย์%'");
    } else if (stage === 'pharmacist') {
      // 4. เภสัชกร: แพทย์อนุมัติแล้ว รอเภสัชตรวจยา
      whereConditions.push("(status LIKE '%รอเภสัช%' OR status = 'รอเภสัชกรตรวจสอบ')");
    } else if (stage === 'approved') {
      // 5. รายการที่อนุมัติ: ผ่านการอนุมัติแล้ว รอจัดส่ง
      whereConditions.push("(status LIKE '%สามารถจัดส่งได้%' AND (tracking_number IS NULL OR tracking_number = ''))");
    } else if (stage === 'today') {
      // 7. "รับยาไม่พบแพทย์"วันนี้: ดึงเฉพาะคำขอใน virtualhos.req_telemed ที่มีนัดหมายตามวันที่เลือก (ค่าเริ่มต้นวันนี้)
      const targetDate = (req.query.date || req.query.startDate || '').trim();
      if (targetDate) {
        whereConditions.push('DATE(nextdate) = ?');
        params.push(targetDate);
      } else {
        whereConditions.push('DATE(nextdate) = CURDATE()');
      }
    }

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
        approve_by LIKE ? OR
        request_by LIKE ?
      )`);
      const searchParam = `%${search}%`;
      for (let i = 0; i < 12; i++) {
        params.push(searchParam);
      }
    }

    // Status filter
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'เปิด Visit แล้ว') {
        whereConditions.push("(vn_today IS NOT NULL AND vn_today != '')");
      } else if (statusFilter === 'รอชำระเงิน') {
        whereConditions.push("(pharmacy_pay_type = 'PAID' AND (finance_status IS NULL OR finance_status != 'PAID'))");
      } else if (statusFilter === 'รอจัดส่ง') {
        whereConditions.push("((pharmacy_pay_type = 'FREE' OR (pharmacy_pay_type = 'PAID' AND finance_status = 'PAID')) AND (tracking_number IS NULL OR tracking_number = ''))");
      } else if (statusFilter === 'กำลังจัดส่ง' || statusFilter === 'จัดส่งเรียบร้อย') {
        whereConditions.push("(tracking_number IS NOT NULL AND tracking_number != '')");
      } else if (statusFilter === 'อนุมัติแล้ว' || statusFilter === 'สามารถจัดส่งได้') {
        whereConditions.push("((status LIKE '%สามารถจัดส่งได้%' OR status LIKE '%อนุมัติ%') AND status NOT LIKE '%ไม่อนุมัติ%' AND status NOT LIKE '%ไม่สามารถ%')");
      } else {
        const keywords = getStatusKeywords(statusFilter);
        if (keywords.length > 0) {
          whereConditions.push('(' + keywords.map(() => 'status LIKE ?').join(' OR ') + ')');
          params.push(...keywords);
        }
      }
    }

    // Date range filter on created_at (for stages other than today)
    if (stage !== 'today') {
      if (startDate) {
        whereConditions.push('DATE(created_at) >= ?');
        params.push(startDate);
      }
      if (endDate) {
        whereConditions.push('DATE(created_at) <= ?');
        params.push(endDate);
      }
    }

    const whereClause = whereConditions.join(' AND ');

    // 1. Total count with current filters
    const countQuery = `SELECT COUNT(*) AS total FROM virtualhos.req_telemed WHERE ${whereClause}`;
    const countResult = await conn.query(countQuery, params);
    const total = Number(countResult[0]?.total || 0);

    // 2. Summary counts by stage & status (overall)
    const summaryQuery = `
      SELECT 
        COUNT(*) AS total_all,
        SUM(CASE WHEN (status LIKE '%รอตรวจสอบ%' AND (received_by IS NULL OR received_by = '')) THEN 1 ELSE 0 END) AS receive_count,
        SUM(CASE WHEN status LIKE '%รอปรึกษาแพทย์%' THEN 1 ELSE 0 END) AS doctor_count,
        SUM(CASE WHEN (status LIKE '%รอเภสัช%' OR status = 'รอเภสัชกรตรวจสอบ') THEN 1 ELSE 0 END) AS pharmacist_count,
        SUM(CASE WHEN (status LIKE '%สามารถจัดส่งได้%' AND (tracking_number IS NULL OR tracking_number = '')) THEN 1 ELSE 0 END) AS approved_count,
        SUM(CASE WHEN DATE(nextdate) = CURDATE() THEN 1 ELSE 0 END) AS today_count,
        SUM(CASE WHEN (status LIKE '%ไม่อนุมัติ%' OR status LIKE '%ไม่สามารถจัดส่งได้%') THEN 1 ELSE 0 END) AS rejected_count,
        SUM(CASE WHEN status LIKE '%จัดส่งเรียบร้อย%' THEN 1 ELSE 0 END) AS delivered_count
      FROM virtualhos.req_telemed
    `;
    let summary = {
      total: total,
      receive: 0,
      doctor: 0,
      pharmacist: 0,
      approved: 0,
      today: 0,
      rejected: 0,
      delivered: 0,
    };
    try {
      const summaryResult = await conn.query(summaryQuery);
      if (summaryResult && summaryResult[0]) {
        const s = summaryResult[0];
        summary = {
          total: Number(s.total_all || 0),
          receive: Number(s.receive_count || 0),
          doctor: Number(s.doctor_count || 0),
          pharmacist: Number(s.pharmacist_count || 0),
          approved: Number(s.approved_count || 0),
          today: Number(s.today_count || 0),
          rejected: Number(s.rejected_count || 0),
          delivered: Number(s.delivered_count || 0),
        };
      }
    } catch (sErr) {
      console.warn('[req_telemed] Summary query error:', sErr.message);
    }

    // 3. Fetch paginated data (defensive SELECT * to prevent unknown column errors)
    const dataQuery = `
      SELECT *
      FROM virtualhos.req_telemed
      WHERE ${whereClause}
      ORDER BY ${sortCol} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    const rows = await conn.query(dataQuery, [...params, limit, offset]);
    const serializedRows = rows.map(serializeRow);

    // Enrich with HOSxP vn_today and vn_stat.dx0 for dynamic status lifecycle
    let connHos;
    try {
      connHos = await pool_hos.getConnection();
      for (const item of serializedRows) {
        // 1. Resolve vn_today from hos.oapp.visit_vn if oapp_id exists
        if (item.oapp_id) {
          try {
            const oappRows = await connHos.query(
              'SELECT visit_vn FROM oapp WHERE oapp_id = ? LIMIT 1',
              [item.oapp_id]
            );
            if (oappRows && oappRows.length > 0 && oappRows[0].visit_vn) {
              const oappVn = String(oappRows[0].visit_vn).trim();
              if (oappVn && item.vn_today !== oappVn) {
                item.vn_today = oappVn;
                conn.query('UPDATE virtualhos.req_telemed SET vn_today = ?, updated_at = NOW() WHERE id = ?', [oappVn, item.id]).catch(() => {});
              }
            }
          } catch (e) {
            // ignore
          }
        }

        // 2. Fallback: Look up vn_today if missing and nextdate is available
        if (!item.vn_today && item.hn && item.nextdate) {
          const targetDate = formatToYMD(item.nextdate);
          const strippedHn = String(item.hn).replace(/^0+/, '') || item.hn;
          try {
            const ovstRows = await connHos.query(
              'SELECT vn FROM ovst WHERE (hn = ? OR hn = ?) AND vstdate = ? ORDER BY vsttime DESC LIMIT 1',
              [item.hn, strippedHn, targetDate]
            );
            if (ovstRows && ovstRows.length > 0 && ovstRows[0].vn) {
              item.vn_today = ovstRows[0].vn;
              conn.query('UPDATE virtualhos.req_telemed SET vn_today = ?, updated_at = NOW() WHERE id = ?', [item.vn_today, item.id]).catch(() => {});
            }
          } catch (e) {
            // ignore
          }
        }

        // Look up vn_stat.dx0 (แพทย์ลงวินิจฉัย/สั่งยาแล้ว)
        if (item.vn_today) {
          try {
            const statRows = await connHos.query(
              'SELECT dx0, pdx FROM vn_stat WHERE vn = ? LIMIT 1',
              [item.vn_today]
            );
            if (statRows && statRows.length > 0) {
              item.dx0 = statRows[0].dx0 || statRows[0].pdx || null;
              item.pdx = statRows[0].pdx || null;
            }
          } catch (e) {
            // ignore
          }
        }
      }
    } catch (hosErr) {
      console.warn('[req_telemed] HOSxP enrichment warning:', hosErr.message);
    } finally {
      if (connHos) connHos.release();
    }

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
    console.error('Error fetching req_telemed data:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
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
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/request-telemed/:id/receive — รับเรื่องโดยเจ้าหน้าที่คลินิก (ส่งต่อคิวรอปรึกษาแพทย์)
router.post('/:id/receive', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const officerName = req.user.displayName || req.user.name || req.user.username || 'เจ้าหน้าที่';

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    const checkQuery = `SELECT id, status, received_by FROM virtualhos.req_telemed WHERE id = ? LIMIT 1`;
    const existing = await conn.query(checkQuery, [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลคำขอนี้' });
    }

    // Update received_by and transition status to 'รอปรึกษาแพทย์'
    const updateQuery = `
      UPDATE virtualhos.req_telemed
      SET 
        received_by = ?, 
        received_at = NOW(), 
        status = 'รอปรึกษาแพทย์', 
        updated_at = NOW()
      WHERE id = ?
    `;
    await conn.query(updateQuery, [officerName, id]);

    const updated = await conn.query(`SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1`, [id]);
    res.json({
      message: 'รับเรื่องเรียบร้อยแล้ว (ย้ายไปคิวรอปรึกษาแพทย์)',
      data: serializeRow(updated[0]),
    });
  } catch (err) {
    console.error('Error receiving req_telemed:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/request-telemed/:id/doctor-action — บันทึกผลการปรึกษาแพทย์ (อนุมัติ / ไม่อนุมัติ)
router.post('/:id/doctor-action', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { approve, remark } = req.body;
  const staffName = req.user.displayName || req.user.name || req.user.username || 'เจ้าหน้าที่';

  if (!approve || (approve !== 'APPROVED' && approve !== 'REJECTED')) {
    return res.status(400).json({ error: 'กรุณาระบุผลการปรึกษาแพทย์ (APPROVED หรือ REJECTED)' });
  }

  if (approve === 'REJECTED' && (!remark || !remark.trim())) {
    return res.status(400).json({ error: 'กรุณาระบุเหตุผลที่แพทย์ไม่อนุมัติ (จำเป็นต้องกรอก)' });
  }

  let conn;
  try {
    conn = await pool_vhos.getConnection();
    const existing = await conn.query('SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลคำขอนี้' });
    }

    const isApproved = approve === 'APPROVED';
    const newStatus = isApproved ? 'รอเภสัชกรตรวจสอบ' : 'ไม่อนุมัติ (แพทย์ไม่อนุมัติ)';
    const approveFlag = isApproved ? 'PENDING' : 'REJECTED';

    try {
      const updateSql = `
        UPDATE virtualhos.req_telemed
        SET 
          status = ?,
          approve = ?,
          doctor_approved_by = ?,
          doctor_approved_at = NOW(),
          doctor_remark = ?,
          updated_at = NOW()
        WHERE id = ?
      `;
      await conn.query(updateSql, [newStatus, approveFlag, staffName, remark ? remark.trim() : null, id]);
    } catch (colErr) {
      // Fallback if doctor_approved columns do not exist yet
      const fallbackSql = `
        UPDATE virtualhos.req_telemed
        SET 
          status = ?,
          approve = ?,
          remark = COALESCE(?, remark),
          updated_at = NOW()
        WHERE id = ?
      `;
      await conn.query(fallbackSql, [newStatus, approveFlag, remark ? `[แพทย์] ${remark.trim()}` : null, id]);
    }

    const updated = await conn.query('SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1', [id]);
    res.json({
      message: isApproved ? 'บันทึกแพทย์อนุมัติเรียบร้อยแล้ว (ส่งต่อคิวเภสัชกร)' : 'บันทึกแพทย์ไม่อนุมัติเรียบร้อยแล้ว',
      data: serializeRow(updated[0]),
    });
  } catch (err) {
    console.error('Error in doctor-action:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/request-telemed/:id/pharmacy-action — เภสัชกรอนุมัติว่ายาส่งได้ หรือ ไม่อนุมัติ
router.post('/:id/pharmacy-action', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { approve, remark } = req.body;
  const staffName = req.user.displayName || req.user.name || req.user.username || 'เภสัชกร';

  if (!approve || (approve !== 'APPROVED' && approve !== 'REJECTED')) {
    return res.status(400).json({ error: 'กรุณาระบุผลการตรวจของเภสัชกร (APPROVED หรือ REJECTED)' });
  }

  if (approve === 'REJECTED' && (!remark || !remark.trim())) {
    return res.status(400).json({ error: 'กรุณาระบุเหตุผลที่เภสัชกรไม่อนุมัติ/ยาส่งไม่ได้ (จำเป็นต้องกรอก)' });
  }

  let conn;
  try {
    conn = await pool_vhos.getConnection();
    const existing = await conn.query('SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลคำขอนี้' });
    }

    const isApproved = approve === 'APPROVED';
    const newStatus = isApproved ? 'สามารถจัดส่งได้' : 'ไม่อนุมัติ (ยาส่งไม่ได้)';
    const approveFlag = isApproved ? 'APPROVED' : 'REJECTED';

    try {
      const updateSql = `
        UPDATE virtualhos.req_telemed
        SET 
          status = ?,
          approve = ?,
          approve_by = ?,
          approve_at = NOW(),
          pharmacy_approved_by = ?,
          pharmacy_approved_at = NOW(),
          pharmacy_remark = ?,
          updated_at = NOW()
        WHERE id = ?
      `;
      await conn.query(updateSql, [newStatus, approveFlag, staffName, staffName, remark ? remark.trim() : null, id]);
    } catch (colErr) {
      // Fallback if pharmacy_approved columns do not exist yet
      const fallbackSql = `
        UPDATE virtualhos.req_telemed
        SET 
          status = ?,
          approve = ?,
          approve_by = ?,
          approve_at = NOW(),
          remark = COALESCE(?, remark),
          updated_at = NOW()
        WHERE id = ?
      `;
      await conn.query(fallbackSql, [newStatus, approveFlag, staffName, remark ? `[เภสัช] ${remark.trim()}` : null, id]);
    }

    const updated = await conn.query('SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1', [id]);
    res.json({
      message: isApproved ? 'เภสัชกรอนุมัติเรียบร้อยแล้ว (ย้ายไปรายการที่อนุมัติ)' : 'บันทึกสถานะยาส่งไม่ได้เรียบร้อยแล้ว',
      data: serializeRow(updated[0]),
    });
  } catch (err) {
    console.error('Error in pharmacy-action:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/request-telemed/:id/approve — อนุมัติ หรือ ไม่อนุมัติ (Legacy Endpoint)
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
    console.error('Error approving req_telemed:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/request-telemed/:id/delivery — บันทึกเลขพัสดุและจัดส่งเรียบร้อย
router.post('/:id/delivery', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { tracking_number } = req.body;
  const officerName = req.user.displayName || req.user.name || req.user.username || 'เจ้าหน้าที่';

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

    try {
      const updateQuery = `
        UPDATE virtualhos.req_telemed
        SET 
          tracking_number = ?,
          status = 'จัดส่งเรียบร้อย',
          delivery_at = NOW(),
          delivery_by = ?,
          updated_at = NOW()
        WHERE id = ?
      `;
      await conn.query(updateQuery, [tracking_number.trim(), officerName, id]);
    } catch (colErr) {
      if (colErr.message && colErr.message.includes('delivery_by')) {
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
      } else {
        throw colErr;
      }
    }

    const updated = await conn.query(`SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1`, [id]);
    res.json({
      message: 'บันทึกเลขพัสดุและสถานะจัดส่งเรียบร้อยแล้ว',
      data: serializeRow(updated[0]),
    });
  } catch (err) {
    console.error('Error updating delivery for req_telemed:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/request-telemed/:id/visit-detail — ดูรายละเอียดการมารับบริการครั้งที่มีการนัดหมาย (จาก vn ที่ได้จาก oapp_id)
router.get('/:id/visit-detail', authenticateToken, async (req, res) => {
  const { id } = req.params;
  let connVhos;
  let connHos;
  try {
    connVhos = await pool_vhos.getConnection();
    const reqRows = await connVhos.query('SELECT * FROM virtualhos.req_telemed WHERE id = ? LIMIT 1', [id]);
    if (!reqRows || reqRows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลคำขอนี้' });
    }
    const requestItem = reqRows[0];

    connHos = await pool_hos.getConnection();

    let targetVn = null;
    let oappRow = null;

    // 1. Find vn from oapp
    if (requestItem.oapp_id) {
      const oappRows = await connHos.query(
        'SELECT oapp_id, vn, hn, vstdate, nextdate, nexttime, clinic, doctor, note, app_cause FROM oapp WHERE oapp_id = ? LIMIT 1',
        [requestItem.oapp_id]
      );
      if (oappRows && oappRows.length > 0) {
        oappRow = oappRows[0];
        targetVn = oappRow.vn;
      }
    }

    // Fallback: If vn is missing in oapp, try finding previous visit for this patient
    if (!targetVn && requestItem.hn) {
      const vstDate = oappRow?.vstdate || requestItem.created_at;
      const ovstRows = await connHos.query(
        'SELECT vn FROM ovst WHERE hn = ? AND vstdate <= ? ORDER BY vstdate DESC, vsttime DESC LIMIT 1',
        [requestItem.hn, vstDate]
      );
      if (ovstRows && ovstRows.length > 0) {
        targetVn = ovstRows[0].vn;
      }
    }

    if (!targetVn) {
      return res.json({
        request: serializeRow(requestItem),
        oapp: oappRow ? serializeRow(oappRow) : null,
        visit: null,
        message: 'ไม่พบรหัสการตรวจ (VN) สำหรับการนัดหมายนี้ในระบบ HOSxP',
      });
    }

    // 2. Query clinical visit details using the exact user-specified query
    const visitQuery = `
      SELECT o.vn, o.vstdate, o.vsttime, p.hn, v.age_y, v.age_m, v.age_d,
             od.bps, od.bpd, od.height, od.bw, od.pulse, od.temperature, od.cc, od.hr, od.pe, od.rr, od.bmi,
             ovstist.name AS ovstist_name,
             o.pttype,
             pt.name AS pttype_name,
             (SELECT GROUP_CONCAT(IF(ovstdiag.diagtype = 1, CONCAT(ovstdiag.icd10, ':', icd101.name, ' (PDX)'), CONCAT(ovstdiag.icd10, ':', icd101.name)) SEPARATOR '\n')
              FROM ovstdiag
              LEFT OUTER JOIN icd101 ON icd101.code = ovstdiag.icd10
              WHERE vn = o.vn
             ) AS diagnosis_concat,
             (SELECT GROUP_CONCAT(
                 CONCAT(IFNULL(d.name, ''), ' ', IFNULL(d.strength, ''), ' ',
                        IF(o1.sp_use <> '', CONCAT(IFNULL(u.name1, ''), ' ', IFNULL(u.name2, ''), ' ', IFNULL(u.name3, '')), ''),
                        IFNULL(du.shortlist, ''), ' #', IFNULL(o1.qty, ''))
                 SEPARATOR '\n')
              FROM opitemrece o1
              INNER JOIN drugitems d ON o1.icode = d.icode
              LEFT OUTER JOIN drugusage du ON du.drugusage = o1.drugusage
              LEFT OUTER JOIN sp_use u ON u.sp_use = o1.sp_use
              WHERE o1.vn = o.vn
             ) AS drug_concat,
             (SELECT GROUP_CONCAT(CONCAT(d.name, ' #', o2.qty) SEPARATOR '\n')
              FROM opitemrece o2
              INNER JOIN nondrugitems d ON o2.icode = d.icode
              WHERE o2.vn = o.vn
             ) AS nondrug_concat,
             (SELECT report_text FROM xray_report WHERE vn = o.vn LIMIT 1) AS xray_report
      FROM ovst o
      LEFT OUTER JOIN vn_stat v ON v.vn = o.vn
      LEFT OUTER JOIN patient p ON p.hn = o.hn
      LEFT OUTER JOIN pttype pt ON pt.pttype = o.pttype
      LEFT OUTER JOIN opdscreen od ON od.vn = o.vn
      LEFT OUTER JOIN ovstist ON ovstist.ovstist = o.ovstist
      WHERE o.vn = ?
      LIMIT 1
    `;

    let visit = null;
    try {
      const visitRows = await connHos.query(visitQuery, [targetVn]);
      if (visitRows && visitRows.length > 0) {
        visit = serializeRow(visitRows[0]);
      }
    } catch (vErr) {
      console.warn('[req_telemed] Clinical query warning:', vErr.message);
      // Fallback with simpler visit query if any subquery table is missing
      const simpleQuery = `
        SELECT o.vn, o.vstdate, o.vsttime, p.hn, v.age_y, v.age_m, v.age_d,
               od.bps, od.bpd, od.height, od.bw, od.pulse, od.temperature, od.cc, od.hr, od.pe, od.rr, od.bmi,
               ovstist.name AS ovstist_name,
               o.pttype,
               pt.name AS pttype_name,
               (SELECT GROUP_CONCAT(CONCAT(ovstdiag.icd10, ':', icd101.name) SEPARATOR '\n')
                FROM ovstdiag
                LEFT OUTER JOIN icd101 ON icd101.code = ovstdiag.icd10
                WHERE vn = o.vn) AS diagnosis_concat
        FROM ovst o
        LEFT OUTER JOIN vn_stat v ON v.vn = o.vn
        LEFT OUTER JOIN patient p ON p.hn = o.hn
        LEFT OUTER JOIN pttype pt ON pt.pttype = o.pttype
        LEFT OUTER JOIN opdscreen od ON od.vn = o.vn
        LEFT OUTER JOIN ovstist ON ovstist.ovstist = o.ovstist
        WHERE o.vn = ?
        LIMIT 1
      `;
      const fallbackRows = await connHos.query(simpleQuery, [targetVn]);
      if (fallbackRows && fallbackRows.length > 0) {
        visit = serializeRow(fallbackRows[0]);
      }
    }

    // 3. Query patient entitlements from visit_pttype table
    let visitPttypes = [];
    try {
      const pttypeSql = `
        SELECT 
          vp.vn,
          vp.pttype,
          pt.name AS pttype_name,
          pt.pcode,
          vp.pttypeno,
          vp.begin_date,
          vp.expire_date,
          vp.hospmain,
          hm.name AS hospmain_name,
          vp.hospsub,
          hs.name AS hospsub_name,
          vp.claim_code,
          vp.auth_code,
          vp.pttype_number,
          vp.pttype_order
        FROM visit_pttype vp
        LEFT OUTER JOIN pttype pt ON pt.pttype = vp.pttype
        LEFT OUTER JOIN hospcode hm ON hm.hospcode = vp.hospmain
        LEFT OUTER JOIN hospcode hs ON hs.hospcode = vp.hospsub
        WHERE vp.vn = ?
        ORDER BY vp.pttype_number ASC, vp.pttype_order ASC
      `;
      const pttypeRows = await connHos.query(pttypeSql, [targetVn]);
      if (pttypeRows && pttypeRows.length > 0) {
        visitPttypes = pttypeRows.map(r => serializeRow(r));
      }
    } catch (vpErr) {
      console.warn('[req_telemed] visit_pttype query warning:', vpErr.message);
    }

    // Fallback if visit_pttype table has no records for this vn but visit has pttype_name
    if (visitPttypes.length === 0 && visit?.pttype_name) {
      visitPttypes.push({
        vn: targetVn,
        pttype: visit.pttype || '',
        pttype_name: visit.pttype_name,
        pttypeno: null,
        hospmain: null,
        hospmain_name: null,
      });
    }

    if (visit) {
      visit.visit_pttype = visitPttypes;
    }

    res.json({
      request: serializeRow(requestItem),
      oapp: oappRow ? serializeRow(oappRow) : null,
      visit,
      visit_pttype: visitPttypes,
      vn: targetVn,
    });
  } catch (err) {
    console.error('Error fetching visit detail:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (connVhos) connVhos.release();
    if (connHos) connHos.release();
  }
});

// GET /api/request-telemed/patient-appointments/:hn — Get patient profile and upcoming appointments from HOSxP (supports HN or CID)
router.get('/patient-appointments/:hn', authenticateToken, async (req, res) => {
  const rawHn = (req.params.hn || '').trim();
  if (!rawHn) {
    return res.status(400).json({ error: 'กรุณาระบุเลข HN หรือ เลขบัตรประชาชน (CID)' });
  }

  let connHos;
  let connVhos;
  try {
    connHos = await pool_hos.getConnection();
    connVhos = await pool_vhos.getConnection();

    // 1. Query patient profile from HOSxP
    // Support searching by raw HN, trimmed leading zeros, or 13-digit CID
    const strippedHn = rawHn.replace(/^0+/, '') || rawHn;
    const cleanDigits = rawHn.replace(/[^0-9]/g, '');
    const ptQuery = `
      SELECT p.hn, p.pname, p.fname, p.lname, p.addrpart, p.moopart, p.po_code,
             p.hometel, p.informtel, p.cid,
             tmb.name as tmb_name, amp.name as amp_name, chw.name as chw_name
      FROM patient p
      LEFT JOIN thaiaddress tmb ON tmb.addressid = CONCAT(p.chwpart, p.amppart, p.tmbpart)
      LEFT JOIN thaiaddress amp ON amp.addressid = CONCAT(p.chwpart, p.amppart, '00')
      LEFT JOIN thaiaddress chw ON chw.addressid = CONCAT(p.chwpart, '0000')
      WHERE p.hn = ? OR TRIM(LEADING '0' FROM p.hn) = ? OR p.cid = ? OR (LENGTH(?) = 13 AND p.cid = ?)
      LIMIT 1
    `;
    let ptRows = [];
    try {
      ptRows = await connHos.query(ptQuery, [rawHn, strippedHn, rawHn, cleanDigits, cleanDigits]);
    } catch (addrErr) {
      console.warn('[req_telemed] Address join failed, falling back to simple patient query:', addrErr.message);
      const simplePtQuery = `
        SELECT p.hn, p.pname, p.fname, p.lname, p.addrpart, p.moopart, p.po_code,
               p.hometel, p.informtel, p.cid
        FROM patient p
        WHERE p.hn = ? OR TRIM(LEADING '0' FROM p.hn) = ? OR p.cid = ? OR (LENGTH(?) = 13 AND p.cid = ?)
        LIMIT 1
      `;
      ptRows = await connHos.query(simplePtQuery, [rawHn, strippedHn, rawHn, cleanDigits, cleanDigits]);
    }

    if (!ptRows || ptRows.length === 0) {
      return res.status(404).json({ error: `ไม่พบข้อมูลผู้ป่วยสำหรับ "${rawHn}" ในระบบ HOSxP` });
    }

    const pt = ptRows[0];
    const canonicalHn = pt.hn;

    const cleanAreaName = (name) => (name ? name.replace(/^(ต\.|ตำบล|อ\.|อำเภอ|จ\.|จังหวัด)/, '').trim() : '');
    const addrParts = [];
    if (pt.addrpart) addrParts.push(`บ้านเลขที่ ${pt.addrpart}`);
    if (pt.moopart && pt.moopart !== '-' && pt.moopart !== '0') addrParts.push(`หมู่ ${pt.moopart}`);
    if (pt.tmb_name) addrParts.push(`ต.${cleanAreaName(pt.tmb_name)}`);
    if (pt.amp_name) addrParts.push(`อ.${cleanAreaName(pt.amp_name)}`);
    if (pt.chw_name) addrParts.push(`จ.${cleanAreaName(pt.chw_name)}`);

    const patientProfile = {
      hn: canonicalHn,
      cid: pt.cid || '',
      fullname: `${pt.pname || ''}${pt.fname || ''} ${pt.lname || ''}`.trim(),
      address: addrParts.join(' '),
      postcode: pt.po_code || '',
      phone: (pt.informtel || pt.hometel || '').trim(),
    };

    // 2. Query upcoming appointments from HOSxP oapp (nextdate >= CURDATE())
    const oappQuery = `
      SELECT 
        o.oapp_id,
        o.vstdate, 
        o.nextdate, 
        o.nexttime, 
        o.endtime,
        c.name AS clinic_name, 
        d.name AS doctor_name, 
        o.note,
        o.app_cause
      FROM oapp o
      LEFT JOIN clinic c ON c.clinic = o.clinic
      LEFT JOIN doctor d ON d.code = o.doctor
      WHERE (o.hn = ? OR o.hn = ?) 
        AND o.nextdate >= CURDATE()
      ORDER BY o.nextdate ASC, o.nexttime ASC
    `;
    let apptRows = [];
    try {
      apptRows = await connHos.query(oappQuery, [canonicalHn, rawHn]);
    } catch (apptErr) {
      console.warn('[req_telemed] oapp join query failed, trying simpler oapp query:', apptErr.message);
      const simpleOapp = `
        SELECT oapp_id, vstdate, nextdate, nexttime, endtime, note, app_cause
        FROM oapp
        WHERE (hn = ? OR hn = ?) AND nextdate >= CURDATE()
        ORDER BY nextdate ASC, nexttime ASC
      `;
      apptRows = await connHos.query(simpleOapp, [canonicalHn, rawHn]);
    }

    // 3. Query existing requests in virtualhos.req_telemed for this HN
    const reqMap = {};
    try {
      const reqQuery = `
        SELECT id, oapp_id, hn, status, approve, tracking_number, reason, symptoms, address, postcode, phone, created_at
        FROM virtualhos.req_telemed
        WHERE hn = ? OR hn = ?
      `;
      const reqRows = await connVhos.query(reqQuery, [canonicalHn, rawHn]);
      for (const r of reqRows) {
        reqMap[Number(r.oapp_id)] = serializeRow(r);
      }
    } catch (reqErr) {
      console.warn('[req_telemed] Querying virtualhos.req_telemed error (ignored):', reqErr.message);
    }

    // Helper to format time range (e.g. 09.00 - 10.00 น.)
    const formatTimeRange = (nextTimeStr, endTimeStr) => {
      if (!nextTimeStr) return '';
      const [sH, sM] = String(nextTimeStr).split(':').map(Number);
      const startH = isNaN(sH) ? 0 : sH;
      const startM = isNaN(sM) ? 0 : sM;

      let endH;
      let endM;
      if (endTimeStr && endTimeStr !== '00:00:00') {
        const [eH, eM] = String(endTimeStr).split(':').map(Number);
        endH = isNaN(eH) ? (startH + 1) % 24 : eH;
        endM = isNaN(eM) ? startM : eM;
        if (endM === 29) endM = 30;
        else if (endM === 59) {
          endM = 0;
          endH = (endH + 1) % 24;
        }
      } else {
        endH = (startH + 1) % 24;
        endM = startM;
      }
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(startH)}.${pad(startM)} - ${pad(endH)}.${pad(endM)} น.`;
    };

    const maxApptDate = process.env.TELEMED_MAX_APPT_DATE ? process.env.TELEMED_MAX_APPT_DATE.trim() : null;

    const appointments = apptRows.map((row) => {
      const oappIdNum = Number(row.oapp_id);
      const existingReq = reqMap[oappIdNum] || null;
      const nextDateFormatted = formatToYMD(row.nextdate);
      let isDateAllowed = true;
      let dateDisallowedReason = null;
      if (maxApptDate && nextDateFormatted && nextDateFormatted > maxApptDate) {
        isDateAllowed = false;
        dateDisallowedReason = `วันนัดหมายเกินกำหนด (เปิดรับเฉพาะนัดหมายไม่เกิน ${maxApptDate})`;
      }

      return {
        oappId: oappIdNum,
        vstdate: row.vstdate,
        nextdate: row.nextdate,
        nextdateFormatted: nextDateFormatted,
        isDateAllowed,
        dateDisallowedReason,
        nexttime: row.nexttime,
        endtime: row.endtime,
        timeRange: formatTimeRange(row.nexttime, row.endtime),
        clinicName: row.clinic_name || 'ไม่ระบุคลินิก',
        doctorName: row.doctor_name || 'ไม่ระบุแพทย์',
        note: row.note || '',
        appCause: row.app_cause || '',
        existingRequest: existingReq,
      };
    });

    res.json({
      patient: patientProfile,
      appointments,
      maxApptDate,
    });
  } catch (err) {
    console.error('Error fetching patient appointments:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (connHos) connHos.release();
    if (connVhos) connVhos.release();
  }
});

// POST /api/request-telemed/register — Create a new telemed request from staff
router.post('/register', authenticateToken, async (req, res) => {
  const { oapp_id, hn, reason, symptoms, address, postcode, phone } = req.body;

  if (!oapp_id) {
    return res.status(400).json({ error: 'กรุณาระบุรหัสการนัดหมาย (oapp_id)' });
  }
  if (!hn) {
    return res.status(400).json({ error: 'กรุณาระบุเลข HN' });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุเหตุผลความจำเป็น' });
  }
  if (!symptoms || !symptoms.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุอาการปัจจุบัน' });
  }
  if (!address || !address.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุที่อยู่สำหรับจัดส่งยา' });
  }
  if (!postcode || !postcode.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุรหัสไปรษณีย์' });
  }
  if (!phone || !phone.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุหมายเลขโทรศัพท์' });
  }

  let connHos;
  let connVhos;
  try {
    connVhos = await pool_vhos.getConnection();

    // 1. Check if a request already exists for this oapp_id in virtualhos.req_telemed
    const checkSql = `SELECT id, status, approve, tracking_number FROM virtualhos.req_telemed WHERE oapp_id = ? LIMIT 1`;
    const existing = await connVhos.query(checkSql, [oapp_id]);
    if (existing && existing.length > 0) {
      return res.status(409).json({
        error: `มีการยื่นคำขอสำหรับนัดหมายนี้แล้ว (สถานะปัจจุบัน: ${existing[0].status})`,
        data: serializeRow(existing[0]),
      });
    }

    connHos = await pool_hos.getConnection();

    // 2. Fetch oapp details to verify appointment
    const oappSql = `
      SELECT o.oapp_id, o.nextdate, c.name AS clinic_name, d.name AS doctor_name
      FROM oapp o
      LEFT JOIN clinic c ON c.clinic = o.clinic
      LEFT JOIN doctor d ON d.code = o.doctor
      WHERE o.oapp_id = ? LIMIT 1
    `;
    let oappRows = [];
    try {
      oappRows = await connHos.query(oappSql, [oapp_id]);
    } catch {
      oappRows = await connHos.query(`SELECT oapp_id, nextdate FROM oapp WHERE oapp_id = ? LIMIT 1`, [oapp_id]);
    }

    if (!oappRows || oappRows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลการนัดหมายนี้ในระบบ HOSxP' });
    }
    const oapp = oappRows[0];

    // Verify appointment date restriction
    const maxApptDate = process.env.TELEMED_MAX_APPT_DATE ? process.env.TELEMED_MAX_APPT_DATE.trim() : null;
    const apptDateFormatted = formatToYMD(oapp.nextdate);
    if (maxApptDate && apptDateFormatted && apptDateFormatted > maxApptDate) {
      return res.status(400).json({
        error: `ไม่สามารถลงทะเบียนได้ เนื่องจากวันนัดหมาย (${apptDateFormatted}) เกินกำหนดที่เปิดรับ (เปิดรับเฉพาะนัดหมายไม่เกิน ${maxApptDate})`,
      });
    }

    // 3. Fetch patient name
    let patientName = null;
    try {
      const strippedHn = hn.replace(/^0+/, '') || hn;
      const ptSql = `SELECT pname, fname, lname FROM patient WHERE hn = ? OR TRIM(LEADING '0' FROM hn) = ? LIMIT 1`;
      const ptRows = await connHos.query(ptSql, [hn, strippedHn]);
      if (ptRows && ptRows.length > 0) {
        patientName = `${ptRows[0].pname || ''}${ptRows[0].fname || ''} ${ptRows[0].lname || ''}`.trim();
      }
    } catch (ptErr) {
      console.warn('[req_telemed] Error fetching patient name:', ptErr.message);
    }

    // 4. Check if patient has line_user_id in virtualhos.lineid
    let lineUserId = null;
    try {
      const strippedHn = hn.replace(/^0+/, '') || hn;
      const lineRows = await connVhos.query(
        `SELECT line_user_id FROM lineid WHERE hn = ? OR hn = ? LIMIT 1`,
        [hn, strippedHn]
      );
      if (lineRows && lineRows.length > 0 && lineRows[0].line_user_id) {
        lineUserId = lineRows[0].line_user_id;
      }
    } catch {
      // Ignore if lineid query fails
    }

    // 5. Staff recorder identifier
    const requestBy = req.user?.displayName || req.user?.name || req.user?.username || 'เจ้าหน้าที่';

    // 6. Insert into virtualhos.req_telemed (with defensive fallback if request_by column does not exist)
    try {
      const insertSql = `
        INSERT INTO virtualhos.req_telemed 
        (oapp_id, hn, line_user_id, patient_name, nextdate, clinic_name, doctor_name, reason, symptoms, address, postcode, phone, status, approve, request_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'รอตรวจสอบ', 'PENDING', ?, NOW())
      `;
      const insertRes = await connVhos.query(insertSql, [
        oapp_id,
        hn,
        lineUserId,
        patientName,
        oapp.nextdate,
        oapp.clinic_name || null,
        oapp.doctor_name || null,
        reason.trim(),
        symptoms.trim(),
        address.trim(),
        postcode.trim(),
        phone.trim(),
        requestBy,
      ]);

      return res.status(201).json({
        success: true,
        id: Number(insertRes.insertId),
        message: 'บันทึกคำขอรับยาไม่พบแพทย์เรียบร้อยแล้ว',
      });
    } catch (insertErr) {
      if (insertErr.message && insertErr.message.includes('request_by')) {
        console.warn('[req_telemed] Falling back to insert without request_by column:', insertErr.message);
        const fallbackSql = `
          INSERT INTO virtualhos.req_telemed 
          (oapp_id, hn, line_user_id, patient_name, nextdate, clinic_name, doctor_name, reason, symptoms, address, postcode, phone, status, approve, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'รอตรวจสอบ', 'PENDING', NOW())
        `;
        const insertRes = await connVhos.query(fallbackSql, [
          oapp_id,
          hn,
          lineUserId,
          patientName,
          oapp.nextdate,
          oapp.clinic_name || null,
          oapp.doctor_name || null,
          reason.trim(),
          symptoms.trim(),
          address.trim(),
          postcode.trim(),
          phone.trim(),
        ]);

        return res.status(201).json({
          success: true,
          id: Number(insertRes.insertId),
          message: 'บันทึกคำขอรับยาไม่พบแพทย์เรียบร้อยแล้ว',
        });
      }
      throw insertErr;
    }
  } catch (err) {
    console.error('Error registering req_telemed:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (connHos) connHos.release();
    if (connVhos) connVhos.release();
  }
});

module.exports = router;
