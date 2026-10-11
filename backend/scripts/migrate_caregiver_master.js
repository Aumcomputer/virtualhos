require('dotenv').config();
const { pool_vhos } = require('../config/database');

async function migrateMasterTables() {
  const conn = await pool_vhos.getConnection();
  try {
    console.log('--- 1. Creating caregiver_relationships master table ---');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS caregiver_relationships (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(100) NOT NULL,
        sort_order INT DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure options exist
    const defaultRels = [
      ['คู่สมรส', 1],
      ['บุตร', 2],
      ['บิดา/มารดา', 3],
      ['พี่น้อง', 4],
      ['หลาน', 5],
      ['ญาติ', 6],
      ['ผู้ปกครองตามกฎหมาย', 7],
      ['อื่นๆ', 8]
    ];
    for (const [title, order] of defaultRels) {
      const existing = await conn.query('SELECT id FROM caregiver_relationships WHERE title = ? LIMIT 1', [title]);
      if (!existing || existing.length === 0) {
        await conn.query('INSERT INTO caregiver_relationships (title, sort_order) VALUES (?, ?)', [title, order]);
      } else {
        await conn.query('UPDATE caregiver_relationships SET sort_order = ? WHERE title = ?', [order, title]);
      }
    }
    console.log('✅ caregiver_relationships master table ready');

    console.log('--- 2. Creating caregiver_inability_reasons master table ---');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS caregiver_inability_reasons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        sort_order INT DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    const defaultReasons = [
      ['เป็นผู้ป่วยติดเตียง / ภาวะพึ่งพิงสูง ไม่สามารถเคลื่อนย้ายได้', 1],
      ['มีข้อจำกัดทางกายภาพหรือการเคลื่อนไหวรุนแรง', 2],
      ['ผู้ป่วยมีความรู้คิดบกพร่อง / ภาวะสมองเสื่อม / ไม่รู้สติสัมปชัญญะ', 3],
      ['เด็กเล็กหรือเยาวชนที่มีข้อจำกัดด้านสุขภาพหรือการเดินทาง', 4],
      ['อื่นๆ', 5]
    ];
    for (const [title, order] of defaultReasons) {
      const existing = await conn.query('SELECT id FROM caregiver_inability_reasons WHERE title = ? LIMIT 1', [title]);
      if (!existing || existing.length === 0) {
        await conn.query('INSERT INTO caregiver_inability_reasons (title, sort_order) VALUES (?, ?)', [title, order]);
      } else {
        await conn.query('UPDATE caregiver_inability_reasons SET sort_order = ? WHERE title = ?', [order, title]);
      }
    }
    console.log('✅ caregiver_inability_reasons master table ready');

    console.log('--- 3. Adding foreign key/id columns to caregiver_affidavits ---');
    try {
      await conn.query(`
        ALTER TABLE caregiver_affidavits 
        ADD COLUMN relationship_id INT NULL AFTER patient_name;
      `);
      console.log('✅ Added relationship_id to caregiver_affidavits');
    } catch (e) {
      if (e.message.includes('Duplicate column')) {
        console.log('ℹ️ relationship_id already exists in caregiver_affidavits');
      } else {
        console.error('Error adding relationship_id:', e.message);
      }
    }

    try {
      await conn.query(`
        ALTER TABLE caregiver_affidavits 
        ADD COLUMN inability_reason_ids JSON NULL AFTER relationship_desc;
      `);
      console.log('✅ Added inability_reason_ids to caregiver_affidavits');
    } catch (e) {
      if (e.message.includes('Duplicate column')) {
        console.log('ℹ️ inability_reason_ids already exists in caregiver_affidavits');
      } else {
        console.error('Error adding inability_reason_ids:', e.message);
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

migrateMasterTables();
