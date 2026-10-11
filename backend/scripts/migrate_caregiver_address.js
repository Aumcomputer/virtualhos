require('dotenv').config();
const { pool_vhos } = require('../config/database');

async function migrateAddressColumns() {
  const conn = await pool_vhos.getConnection();
  try {
    console.log('--- Adding caregiver_address and patient_address columns ---');
    try {
      await conn.query(`
        ALTER TABLE caregiver_affidavits 
        ADD COLUMN caregiver_address TEXT NULL AFTER caregiver_phone;
      `);
      console.log('✅ Added caregiver_address to caregiver_affidavits');
    } catch (e) {
      if (e.message.includes('Duplicate column')) {
        console.log('ℹ️ caregiver_address already exists');
      } else {
        console.error('Error adding caregiver_address:', e.message);
      }
    }

    try {
      await conn.query(`
        ALTER TABLE caregiver_affidavits 
        ADD COLUMN patient_address TEXT NULL AFTER patient_name;
      `);
      console.log('✅ Added patient_address to caregiver_affidavits');
    } catch (e) {
      if (e.message.includes('Duplicate column')) {
        console.log('ℹ️ patient_address already exists');
      } else {
        console.error('Error adding patient_address:', e.message);
      }
    }
    console.log('--- Migration completed successfully! ---');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrateAddressColumns();
