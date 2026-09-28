const mariadb = require('mariadb');

// ---------------------------------------------------------------------------
// Database Connection Pools
// ---------------------------------------------------------------------------
const pool_hos = mariadb.createPool({
  host: process.env.HOSXP_DB_HOST,
  user: process.env.HOSXP_DB_USER,
  password: process.env.HOSXP_DB_PASS,
  database: process.env.HOSXP_DB_NAME,
  connectionLimit: 5,
  connectTimeout: 10000,
});

const pool_vhos = mariadb.createPool({
  host: process.env.VHOS_DB_HOST,
  user: process.env.VHOS_DB_USER,
  password: process.env.VHOS_DB_PASS,
  database: process.env.VHOS_DB_NAME,
  connectionLimit: 5,
  connectTimeout: 10000,
});

module.exports = { pool_hos, pool_vhos };
