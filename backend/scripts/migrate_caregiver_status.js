require('dotenv').config();
const { pool_vhos } = require('../config/database');

async function migrate() {
  let conn;
  try {
    conn = await pool_vhos.getConnection();
    const cols = await conn.query("SHOW COLUMNS FROM caregiver_affidavits LIKE 'status'");
    if (cols.length === 0) {
      await conn.query("ALTER TABLE caregiver_affidavits ADD COLUMN status ENUM('APPROVED', 'REJECTED', 'PENDING') NOT NULL DEFAULT 'APPROVED' AFTER pdf_hash");
      console.log('Successfully added status column to caregiver_affidavits');
    } else {
      console.log('Column status already exists');
    }
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    if (conn) conn.release();
    process.exit(0);
  }
}

migrate();
