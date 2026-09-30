const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Route imports
const authRoutes = require('./routes/auth');
const lineidRoutes = require('./routes/lineid');
const telemedRoutes = require('./routes/telemed');
const adminRoutes = require('./routes/admin');
const telemedCasesRoutes = require('./routes/telemed-cases');
const cronSettingsRoutes = require('./routes/cronSettings');
const prescreeningRoutes = require('./routes/prescreening');
const requestTelemedRoutes = require('./routes/request-telemed');
const telemedTodayRoutes = require('./routes/telemed-today');
const systemRoutes = require('./routes/system');
const { getAppVersion } = require('./lib/version');

const app = express();

// Trust reverse proxy (e.g., Nginx terminating SSL/TLS)
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "https://profile.line-scdn.net", "data:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  xFrameOptions: { action: 'deny' },
  xContentTypeOptions: true,
  permissionsPolicy: {
    features: {
      camera: [],
      microphone: [],
      geolocation: [],
    },
  },
}));

app.use(cors());

// Body parser with size limit
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Rate limiting — general
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(generalLimiter);

// Attach X-App-Version to all responses
app.use((req, res, next) => {
  const appVersion = getAppVersion();
  res.setHeader('X-App-Version', appVersion);
  res.setHeader('Access-Control-Expose-Headers', 'X-App-Version');
  next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api', authRoutes);              // /api/login, /api/logout, /api/me
app.use('/api/system', systemRoutes);     // /api/system/version, /api/system/check-update
app.use('/api/lineid', lineidRoutes);     // /api/lineid, /api/lineid/today
app.use('/api/create-link', telemedRoutes); // /api/create-link
app.use('/api/admin-users', adminRoutes); // /api/admin-users CRUD + /api/admin-users/search-opduser
app.use('/api/telemed-cases', telemedCasesRoutes); // /api/telemed-cases queries
app.use('/api/cron-settings', cronSettingsRoutes); // /api/cron-settings queries/updates
app.use('/api/prescreening', prescreeningRoutes); // /api/prescreening queries/actions
app.use('/api/request-telemed', requestTelemedRoutes); // /api/request-telemed queries
app.use('/api/telemed-today', telemedTodayRoutes);       // /api/telemed-today queries (real-date workflow)

// ---------------------------------------------------------------------------
// Start Scheduler (node-cron)
// ---------------------------------------------------------------------------
require('./cron/scheduler');

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT, 10) || 3001;
// TODO(security): Use mTLS for database connections in production.
app.listen(PORT, () => {
  console.log(`RBH Virtual Hospital API running on http://127.0.0.1:${PORT}`);
});