const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { pool_vhos } = require('../config/database');

async function migrate() {
  let conn;
  try {
    conn = await pool_vhos.getConnection();
    console.log('Connected to pool_vhos successfully');

    const sql = `
      CREATE TABLE IF NOT EXISTS virtualhos.referral_pttypes (
        pttype VARCHAR(10) NOT NULL PRIMARY KEY,
        pttype_name VARCHAR(255) NULL,
        pcode VARCHAR(10) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        note VARCHAR(255) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_by VARCHAR(100) NULL,
        INDEX idx_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    await conn.query(sql);
    console.log('Successfully created or verified virtualhos.referral_pttypes table');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    if (conn) conn.release();
    process.exit(0);
  }
}

migrate();
