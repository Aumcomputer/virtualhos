require('dotenv').config({ path: __dirname + '/../.env' });
const { pool_vhos } = require('../config/database');

async function migrate() {
  let conn;
  try {
    conn = await pool_vhos.getConnection();
    const cols = await conn.query("SHOW COLUMNS FROM caregiver_affidavits LIKE 'witness_ip'");
    if (cols.length === 0) {
      await conn.query("ALTER TABLE caregiver_affidavits ADD COLUMN witness_ip VARCHAR(50) NULL AFTER witness_position");
      console.log('✅ Successfully added witness_ip column to caregiver_affidavits');
    } else {
      console.log('ℹ️ Column witness_ip already exists');
    }

    // Set 172.18.5.18 for affidavit id 9
    await conn.query("UPDATE caregiver_affidavits SET witness_ip = '172.18.5.18' WHERE id = 9");
    console.log('✅ Updated witness_ip for affidavit 9 to 172.18.5.18');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    if (conn) conn.release();
    process.exit(0);
  }
}

migrate();
