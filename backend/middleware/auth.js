const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');

// ---------------------------------------------------------------------------
// JWT Secret — multi-tiered fallback (ENV → file → random + warning)
// ---------------------------------------------------------------------------
function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const secretFile = './jwt_secret.txt';
  if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, 'utf-8').trim();
  console.warn('WARNING: Generating ephemeral JWT secret. Instance-isolated! Set JWT_SECRET in .env for production.');
  return crypto.randomBytes(32).toString('hex');
}
const JWT_SECRET = getJwtSecret();

// ---------------------------------------------------------------------------
// Auth Middleware — read JWT from HttpOnly cookie
// ---------------------------------------------------------------------------
function authenticateToken(req, res, next) {
  const token = req.cookies && (req.cookies['__Host-token'] || req.cookies['vhos_token']);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Hardcode algorithm to HS256, reject 'none'
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ---------------------------------------------------------------------------
// Auth Middleware — require admin role
// ---------------------------------------------------------------------------
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { JWT_SECRET, authenticateToken, requireAdmin };
