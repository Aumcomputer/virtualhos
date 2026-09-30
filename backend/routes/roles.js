const express = require('express');
const { pool_vhos } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/roles — List all roles with their assigned menu_keys & user counts
// ---------------------------------------------------------------------------
router.get('/', authenticateToken, async (req, res) => {
  let conn;
  try {
    conn = await pool_vhos.getConnection();

    // 1. Fetch roles
    const roles = await conn.query(`
      SELECT r.role_key, r.role_name, r.description, r.icon, r.badge_color, r.is_system, r.sort_order, r.created_at, r.updated_at,
             COUNT(DISTINCT u.id) AS user_count
      FROM system_roles r
      LEFT JOIN admin_users u ON u.role = r.role_key
      GROUP BY r.role_key
      ORDER BY r.sort_order ASC, r.created_at ASC
    `);

    // 2. Fetch permissions for all roles
    const perms = await conn.query(`
      SELECT role_key, menu_key
      FROM system_role_permissions
    `);

    // Map permissions by role_key
    const permMap = {};
    for (const p of perms) {
      if (!permMap[p.role_key]) permMap[p.role_key] = [];
      permMap[p.role_key].push(p.menu_key);
    }

    const result = roles.map(r => ({
      role_key: r.role_key,
      role_name: r.role_name,
      description: r.description,
      icon: r.icon || '👤',
      badge_color: r.badge_color || 'blue',
      is_system: Boolean(r.is_system),
      sort_order: Number(r.sort_order || 0),
      user_count: Number(r.user_count || 0),
      menu_keys: permMap[r.role_key] || (r.role_key === 'admin' ? [] : []),
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    res.json({ data: result });
  } catch (err) {
    console.error('Error fetching roles:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// ---------------------------------------------------------------------------
// GET /api/roles/menus — List all system menus grouped by section
// ---------------------------------------------------------------------------
router.get('/menus', authenticateToken, async (req, res) => {
  let conn;
  try {
    conn = await pool_vhos.getConnection();
    const rows = await conn.query(`
      SELECT menu_key, menu_name, group_name, path, icon, sort_order
      FROM system_menus
      ORDER BY sort_order ASC
    `);

    res.json({ data: rows });
  } catch (err) {
    console.error('Error fetching system menus:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/roles — Add a new role
// ---------------------------------------------------------------------------
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  const { role_key, role_name, description, icon, badge_color, menu_keys } = req.body;

  if (!role_key || typeof role_key !== 'string') {
    return res.status(400).json({ error: 'กรุณาระบุรหัสสิทธิ์ (Role Key)' });
  }

  // Sanitize role_key: lowercase, alphanumeric and underscores only
  const cleanKey = role_key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (!cleanKey) {
    return res.status(400).json({ error: 'รหัสสิทธิ์ไม่ถูกต้อง (ต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลข หรือขีดล่าง)' });
  }

  if (!role_name || !role_name.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุชื่อสิทธิ์ (Role Name)' });
  }

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    // Check duplicate
    const existing = await conn.query('SELECT role_key FROM system_roles WHERE role_key = ? LIMIT 1', [cleanKey]);
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: `รหัสสิทธิ์ "${cleanKey}" มีอยู่ในระบบแล้ว` });
    }

    // Get max sort_order
    const maxOrderRow = await conn.query('SELECT MAX(sort_order) AS max_order FROM system_roles');
    const nextOrder = Number(maxOrderRow[0]?.max_order || 0) + 1;

    // Insert role
    await conn.query(`
      INSERT INTO system_roles (role_key, role_name, description, icon, badge_color, is_system, sort_order)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `, [
      cleanKey,
      role_name.trim(),
      (description || '').trim() || null,
      icon || '👤',
      badge_color || 'indigo',
      nextOrder,
    ]);

    // Insert menu permissions
    if (Array.isArray(menu_keys) && menu_keys.length > 0) {
      for (const mKey of menu_keys) {
        await conn.query(`
          INSERT IGNORE INTO system_role_permissions (role_key, menu_key)
          VALUES (?, ?)
        `, [cleanKey, mKey]);
      }
    }

    res.json({
      success: true,
      message: `เพิ่มสิทธิ์ "${role_name.trim()}" สำเร็จ`,
      role_key: cleanKey,
    });
  } catch (err) {
    console.error('Error creating role:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// ---------------------------------------------------------------------------
// PUT /api/roles/:role_key — Update role details and menu permissions
// ---------------------------------------------------------------------------
router.put('/:role_key', authenticateToken, requireAdmin, async (req, res) => {
  const { role_key } = req.params;
  const { role_name, description, icon, badge_color, menu_keys } = req.body;

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    const existing = await conn.query('SELECT * FROM system_roles WHERE role_key = ? LIMIT 1', [role_key]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ error: 'ไม่พบสิทธิ์นี้ในระบบ' });
    }

    const updates = [];
    const params = [];

    if (role_name !== undefined) {
      updates.push('role_name = ?');
      params.push(role_name.trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push((description || '').trim() || null);
    }
    if (icon !== undefined) {
      updates.push('icon = ?');
      params.push(icon);
    }
    if (badge_color !== undefined) {
      updates.push('badge_color = ?');
      params.push(badge_color);
    }

    if (updates.length > 0) {
      params.push(role_key);
      await conn.query(`UPDATE system_roles SET ${updates.join(', ')} WHERE role_key = ?`, params);
    }

    // Update menu permissions if provided
    if (Array.isArray(menu_keys)) {
      // Clear existing
      await conn.query('DELETE FROM system_role_permissions WHERE role_key = ?', [role_key]);

      // If admin, ensure settings permission is always preserved
      const finalMenuKeys = role_key === 'admin' && !menu_keys.includes('settings')
        ? [...menu_keys, 'settings']
        : menu_keys;

      for (const mKey of finalMenuKeys) {
        await conn.query(`
          INSERT IGNORE INTO system_role_permissions (role_key, menu_key)
          VALUES (?, ?)
        `, [role_key, mKey]);
      }
    }

    res.json({
      success: true,
      message: `บันทึกการตั้งค่าสิทธิ์ "${role_name || role_key}" เรียบร้อยแล้ว`,
    });
  } catch (err) {
    console.error('Error updating role:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/roles/:role_key — Delete a custom role
// ---------------------------------------------------------------------------
router.delete('/:role_key', authenticateToken, requireAdmin, async (req, res) => {
  const { role_key } = req.params;

  let conn;
  try {
    conn = await pool_vhos.getConnection();

    const existing = await conn.query('SELECT is_system, role_name FROM system_roles WHERE role_key = ? LIMIT 1', [role_key]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ error: 'ไม่พบสิทธิ์นี้ในระบบ' });
    }

    if (existing[0].is_system) {
      return res.status(400).json({ error: `ไม่สามารถลบสิทธิ์ระบบ "${existing[0].role_name}" ได้` });
    }

    // Check if any users are currently assigned this role
    const assignedUsers = await conn.query('SELECT id, username FROM admin_users WHERE role = ?', [role_key]);
    if (assignedUsers && assignedUsers.length > 0) {
      return res.status(400).json({
        error: `ไม่สามารถลบสิทธิ์ได้ เนื่องจากมีผู้ใช้งาน ${assignedUsers.length} คนกำลังใช้สิทธิ์นี้อยู่ กรุณาเปลี่ยนสิทธิ์ของผู้ใช้งานก่อน`,
      });
    }

    // Delete permissions and role
    await conn.query('DELETE FROM system_role_permissions WHERE role_key = ?', [role_key]);
    await conn.query('DELETE FROM system_roles WHERE role_key = ?', [role_key]);

    res.json({
      success: true,
      message: `ลบสิทธิ์ "${existing[0].role_name}" สำเร็จ`,
    });
  } catch (err) {
    console.error('Error deleting role:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
