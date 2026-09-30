const express = require('express');
const jwt = require('jsonwebtoken');
const md5 = require('md5');
const rateLimit = require('express-rate-limit');
const { pool_hos, pool_vhos } = require('../config/database');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');
const { logActivity, getClientIp } = require('../helpers/activityLog');

const router = express.Router();

// Rate limiting — strict for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});

// POST /api/login
// TODO(security): MD5 password hashing — used to match existing HOSxP database.
// Should migrate to bcrypt/argon2 when possible.
// TODO(security): Consider adding OAuth providers for stronger authentication.
// TODO(security): Consider implementing MFA.
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // Input validation
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Invalid input' });
  }
  if (username.length > 100 || password.length > 128) {
    return res.status(400).json({ error: 'Input too long' });
  }

  let connHos;
  let connVhos;
  try {
    // 1. Check password + account_disable from HOSxP opduser
    const hashedPass = md5(password);
    const stmt = `SELECT loginname, name, account_disable FROM opduser WHERE loginname = ? AND passweb = ? LIMIT 1`;
    connHos = await pool_hos.getConnection();
    const results = await connHos.query(stmt, [username, hashedPass]);

    if (results.length !== 1) {
      return res.status(401).json({ error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
    }

    if (results[0].account_disable === 'Y') {
      return res.status(403).json({ error: 'บัญชีผู้ใช้งานนี้ถูกระงับการใช้งาน' });
    }

    // 2. Check admin_users table
    // - ถ้าอยู่ใน admin_users แล้ว → ใช้ role/is_active ตาม record นั้น
    // - ถ้ายังไม่อยู่ใน admin_users → เข้าได้เลยด้วย role 'viewer' (open access)
    connVhos = await pool_vhos.getConnection();
    const adminCheck = await connVhos.query(
      'SELECT role, is_active FROM admin_users WHERE username = ? LIMIT 1',
      [username]
    );

    let role = 'operator'; // Default role for HOSxP users not yet in admin_users

    if (adminCheck.length > 0) {
      // User is registered in admin_users — respect their is_active flag
      if (!adminCheck[0].is_active) {
        return res.status(403).json({ error: 'บัญชีผู้ใช้งานนี้ถูกระงับการใช้งาน' });
      }
      role = adminCheck[0].role || 'operator';
    }

    // Fetch permitted menus for this role
    let permissions = [];
    try {
      if (role === 'admin') {
        const all = await connVhos.query('SELECT menu_key FROM system_menus ORDER BY sort_order ASC');
        permissions = all.map(m => m.menu_key);
      } else {
        const perms = await connVhos.query('SELECT menu_key FROM system_role_permissions WHERE role_key = ?', [role]);
        permissions = perms.map(p => p.menu_key);
      }
    } catch (permErr) {
      console.warn('Could not fetch permissions:', permErr.message);
      if (role === 'admin') permissions = ['settings', 'today_registrations', 'all_registrations'];
    }

    // 3. Issue JWT with role
    const user = { name: username, displayName: results[0].name, role };
    const token = jwt.sign(user, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '12h',
    });

    // Set HttpOnly cookie — use Secure flag only when connection is actually HTTPS
    // to allow non-HTTPS LAN access during development without browser cookie rejection
    const isSecureConnection = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const useSecureCookie = isSecureConnection;

    const cookieName = useSecureCookie ? '__Host-token' : 'vhos_token';
    res.cookie(cookieName, token, {
      httpOnly: true,
      secure: useSecureCookie,
      sameSite: 'lax',
      maxAge: 12 * 60 * 60 * 1000, // 12 hours
      path: '/',
    });

    res.json({ user, permissions });

    // Fire-and-forget: log successful login
    logActivity({
      username,
      action: 'login',
      detail: `role=${role}`,
      ip_address: getClientIp(req),
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connHos) connHos.release();
    if (connVhos) connVhos.release();
  }
});

// POST /api/logout
router.post('/logout', (req, res) => {
  const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  const isSecureConnection = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const useSecure = isSecureConnection || isLocalhost;

  res.clearCookie('__Host-token', {
    httpOnly: true,
    secure: useSecure,
    sameSite: 'lax',
    path: '/',
  });
  res.clearCookie('vhos_token', {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
  });
  res.json({ message: 'Logged out successfully' });
});

// GET /api/me — check current session & fetch permissions
router.get('/me', authenticateToken, async (req, res) => {
  let connVhos;
  try {
    connVhos = await pool_vhos.getConnection();
    const adminCheck = await connVhos.query(
      'SELECT role, is_active FROM admin_users WHERE username = ? LIMIT 1',
      [req.user.name]
    );

    let role = req.user.role || 'operator';
    if (adminCheck.length > 0) {
      if (!adminCheck[0].is_active) {
        return res.status(403).json({ error: 'บัญชีผู้ใช้งานนี้ถูกระงับการใช้งาน' });
      }
      role = adminCheck[0].role || 'operator';
    }

    let permissions = [];
    if (role === 'admin') {
      const all = await connVhos.query('SELECT menu_key FROM system_menus ORDER BY sort_order ASC');
      permissions = all.map(m => m.menu_key);
    } else {
      const perms = await connVhos.query('SELECT menu_key FROM system_role_permissions WHERE role_key = ?', [role]);
      permissions = perms.map(p => p.menu_key);
    }

    res.json({
      user: {
        name: req.user.name,
        displayName: req.user.displayName,
        role,
      },
      permissions,
    });
  } catch (err) {
    console.error('Error in /me:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connVhos) connVhos.release();
  }
});

module.exports = router;
