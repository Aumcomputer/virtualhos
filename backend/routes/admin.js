const express = require('express');
const { pool_hos, pool_vhos } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin-users — list all admin users
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  let connVhos;
  let connHos;
  try {
    connVhos = await pool_vhos.getConnection();
    const rows = await connVhos.query(`
      SELECT u.id, u.username, u.display_name, u.role, u.is_active, u.created_by, u.created_at, u.updated_at,
             IFNULL(r.role_name, u.role) as role_name,
             IFNULL(r.icon, '👤') as role_icon,
             IFNULL(r.badge_color, 'blue') as role_badge_color
      FROM admin_users u
      LEFT JOIN system_roles r ON r.role_key = u.role
      ORDER BY u.created_at DESC
    `);

    // Fetch groupname and department from HOSxP opduser
    if (rows && rows.length > 0) {
      try {
        connHos = await pool_hos.getConnection();
        const usernames = [...new Set(rows.map((r) => r.username).filter(Boolean))];
        if (usernames.length > 0) {
          const placeholders = usernames.map(() => '?').join(',');
          const opdUsers = await connHos.query(
            `SELECT loginname, groupname, department FROM opduser WHERE loginname IN (${placeholders})`,
            usernames
          );
          const groupMap = {};
          for (const ou of opdUsers) {
            groupMap[ou.loginname] = {
              groupname: ou.groupname || '',
              department: ou.department || '',
            };
          }
          for (const row of rows) {
            const info = groupMap[row.username];
            row.groupname = info?.groupname || '—';
            row.department = info?.department || '';
          }
        }
      } catch (hosErr) {
        console.error('Error fetching opduser info from HOSxP:', hosErr.message);
        for (const row of rows) {
          row.groupname = '—';
          row.department = '';
        }
      }
    }

    res.json({ data: rows });
  } catch (err) {
    console.error('Error fetching admin users:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connVhos) connVhos.release();
    if (connHos) connHos.release();
  }
});

// POST /api/admin-users — add a new admin user
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  const { username, display_name, role } = req.body;

  // Input validation
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Username is required' });
  }
  if (username.length > 100) {
    return res.status(400).json({ error: 'Username too long' });
  }

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    // Check duplicate
    const existing = await conn.query(
      'SELECT id FROM admin_users WHERE username = ? LIMIT 1',
      [username]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'ผู้ใช้งานนี้มีอยู่ในระบบแล้ว' });
    }

    // Verify role in system_roles
    let finalRole = 'operator';
    if (role) {
      const roleCheck = await conn.query('SELECT role_key FROM system_roles WHERE role_key = ? LIMIT 1', [role]);
      if (roleCheck && roleCheck.length > 0) {
        finalRole = roleCheck[0].role_key;
      }
    }

    await conn.query(
      'INSERT INTO admin_users (username, display_name, role, is_active, created_by) VALUES (?, ?, ?, 1, ?)',
      [username, display_name || '', finalRole, req.user.name]
    );

    res.json({ message: 'เพิ่มผู้ใช้งานสำเร็จ' });
  } catch (err) {
    console.error('Error adding admin user:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/admin-users/:id — update role or is_active
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  const { role, is_active } = req.body;

  const updates = [];
  const params = [];

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    if (role !== undefined) {
      const roleCheck = await conn.query('SELECT role_key FROM system_roles WHERE role_key = ? LIMIT 1', [role]);
      if (!roleCheck || roleCheck.length === 0) {
        return res.status(400).json({ error: 'ไม่พบสิทธิ์นี้ในระบบ' });
      }
      updates.push('role = ?');
      params.push(role);
    }

    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);

    const result = await conn.query(
      `UPDATE admin_users SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'อัปเดตสำเร็จ' });
  } catch (err) {
    console.error('Error updating admin user:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/admin-users/:id — remove admin user
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    // Prevent deleting yourself
    const target = await conn.query('SELECT username FROM admin_users WHERE id = ? LIMIT 1', [id]);
    if (target.length > 0 && target[0].username === req.user.name) {
      return res.status(400).json({ error: 'ไม่สามารถลบบัญชีตัวเองได้' });
    }

    const result = await conn.query('DELETE FROM admin_users WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'ลบผู้ใช้งานสำเร็จ' });
  } catch (err) {
    console.error('Error deleting admin user:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/search-opduser — search HOSxP opduser for add-user dialog
// BUG FIX: Changed `account_disable != 'Y'` to handle NULL values properly.
// In MariaDB, `NULL != 'Y'` returns NULL (not TRUE), so users with NULL
// account_disable were being filtered out.
router.get('/search-opduser', authenticateToken, requireAdmin, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) {
    return res.json({ data: [] });
  }
  if (q.length > 100) {
    return res.status(400).json({ error: 'Query too long' });
  }

  let conn;
  try {
    conn = await pool_hos.getConnection();
    const searchParam = `%${q}%`;
    const rows = await conn.query(
      `SELECT loginname, name, department, groupname, account_disable
       FROM opduser
       WHERE (loginname LIKE ? OR name LIKE ?)
       AND (account_disable IS NULL OR account_disable != 'Y')
       ORDER BY name
       LIMIT 20`,
      [searchParam, searchParam]
    );

    res.json({
      data: rows.map(r => ({
        loginname: r.loginname,
        name: r.name,
        department: r.department || '',
        groupname: r.groupname || '',
        account_disable: r.account_disable,
      })),
    });
  } catch (err) {
    console.error('Error searching opduser:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
