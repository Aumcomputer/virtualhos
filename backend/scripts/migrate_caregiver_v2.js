require('dotenv').config();
const { pool_vhos } = require('../config/database');

async function migrateV2() {
  const conn = await pool_vhos.getConnection();
  try {
    console.log('--- Starting Migration V2 ---');

    // 1. Add moph_account_id to caregiver_sessions
    try {
      await conn.query(`
        ALTER TABLE caregiver_sessions 
        ADD COLUMN moph_account_id VARCHAR(64) NULL AFTER moph_jti;
      `);
      console.log('✅ Added moph_account_id to caregiver_sessions');
    } catch (e) {
      if (e.message.includes('Duplicate column')) {
        console.log('ℹ️ moph_account_id already exists in caregiver_sessions');
      } else {
        console.error('Error adding moph_account_id to caregiver_sessions:', e.message);
      }
    }

    // 2. Add moph_account_id and pdf_hash to caregiver_affidavits
    try {
      await conn.query(`
        ALTER TABLE caregiver_affidavits 
        ADD COLUMN moph_account_id VARCHAR(64) NULL AFTER moph_jti;
      `);
      console.log('✅ Added moph_account_id to caregiver_affidavits');
    } catch (e) {
      if (e.message.includes('Duplicate column')) {
        console.log('ℹ️ moph_account_id already exists in caregiver_affidavits');
      } else {
        console.error('Error adding moph_account_id to caregiver_affidavits:', e.message);
      }
    }

    try {
      await conn.query(`
        ALTER TABLE caregiver_affidavits 
        ADD COLUMN pdf_hash VARCHAR(64) NULL AFTER pdf_path;
      `);
      console.log('✅ Added pdf_hash to caregiver_affidavits');
    } catch (e) {
      if (e.message.includes('Duplicate column')) {
        console.log('ℹ️ pdf_hash already exists in caregiver_affidavits');
      } else {
        console.error('Error adding pdf_hash to caregiver_affidavits:', e.message);
      }
    }

    // 3. Drop relationship_desc from caregiver_dependents
    try {
      await conn.query(`
        ALTER TABLE caregiver_dependents 
        DROP COLUMN relationship_desc;
      `);
      console.log('✅ Dropped relationship_desc from caregiver_dependents');
    } catch (e) {
      if (e.message.includes("Can't DROP column") || e.message.includes("check that it exists")) {
        console.log('ℹ️ relationship_desc already dropped from caregiver_dependents');
      } else {
        console.error('Error dropping relationship_desc:', e.message);
      }
    }

    console.log('--- Migration V2 Complete ---');
  } catch (err) {
    console.error('Migration V2 error:', err);
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrateV2();
