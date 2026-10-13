const express = require('express');
const { pool_hos, pool_vhos } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/referral-pttypes/hos-options — ดึงรายการสิทธิ์ทั้งหมดจาก hos.pttype
router.get('/hos-options', authenticateToken, async (req, res) => {
  let conn;
  try {
    conn = await pool_hos.getConnection();
    const query = `
      SELECT pttype, name, pcode, isuse, hipdata_code 
      FROM pttype 
      ORDER BY pttype ASC
    `;
    const rows = await conn.query(query);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching hos pttype options:', err.message);
    res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลสิทธิ์จาก HOSxP ได้: ' + err.message });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/referral-pttypes — ดึงรายการสิทธิ์ที่ต้องใช้ใบส่งตัวจาก virtualhos.referral_pttypes
router.get('/', authenticateToken, async (req, res) => {
  let conn;
  try {
    conn = await pool_vhos.getConnection();
    const rows = await conn.query(`
      SELECT pttype, pttype_name, pcode, is_active, note, created_at, updated_at, created_by 
      FROM virtualhos.referral_pttypes 
      ORDER BY pttype ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching referral pttypes:', err.message);
    res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลสิทธิ์ที่ต้องใช้ใบส่งตัวได้: ' + err.message });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/referral-pttypes — เพิ่มสิทธิ์ที่ต้องใช้ใบส่งตัว
router.post('/', authenticateToken, async (req, res) => {
  const { pttype, pttype_name, pcode, note, is_active = 1 } = req.body;
  const created_by = req.user?.name || req.user?.username || 'admin';

  if (!pttype) {
    return res.status(400).json({ error: 'ต้องระบุรหัสสิทธิ์ (pttype)' });
  }

  let conn;
  try {
    conn = await pool_vhos.getConnection();
    await conn.query(
      `
      INSERT INTO virtualhos.referral_pttypes (pttype, pttype_name, pcode, is_active, note, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        pttype_name = VALUES(pttype_name),
        pcode = VALUES(pcode),
        is_active = VALUES(is_active),
        note = VALUES(note),
        updated_at = NOW()
    `,
      [pttype.trim(), pttype_name || null, pcode || null, is_active ? 1 : 0, note || null, created_by]
    );

    res.json({ success: true, message: 'บันทึกสิทธิ์การรักษาที่ต้องใช้ใบส่งตัวเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Error adding referral pttype:', err.message);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + err.message });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/referral-pttypes/:pttype — แก้ไขสถานะหรือหมายเหตุ
router.put('/:pttype', authenticateToken, async (req, res) => {
  const { pttype } = req.params;
  const { is_active, note, pttype_name, pcode } = req.body;

  let conn;
  try {
    conn = await pool_vhos.getConnection();
    await conn.query(
      `
      UPDATE virtualhos.referral_pttypes 
      SET 
        is_active = COALESCE(?, is_active),
        note = COALESCE(?, note),
        pttype_name = COALESCE(?, pttype_name),
        pcode = COALESCE(?, pcode),
        updated_at = NOW()
      WHERE pttype = ?
    `,
      [
        is_active !== undefined ? (is_active ? 1 : 0) : null,
        note !== undefined ? note : null,
        pttype_name || null,
        pcode || null,
        pttype,
      ]
    );

    res.json({ success: true, message: 'อัปเดตข้อมูลเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Error updating referral pttype:', err.message);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล: ' + err.message });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/referral-pttypes/:pttype — ลบสิทธิ์ที่ต้องใช้ใบส่งตัว
router.delete('/:pttype', authenticateToken, async (req, res) => {
  const { pttype } = req.params;

  let conn;
  try {
    conn = await pool_vhos.getConnection();
    await conn.query(`DELETE FROM virtualhos.referral_pttypes WHERE pttype = ?`, [pttype]);
    res.json({ success: true, message: 'ลบรายการสิทธิ์เรียบร้อยแล้ว' });
  } catch (err) {
    console.error('Error deleting referral pttype:', err.message);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบข้อมูล: ' + err.message });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
