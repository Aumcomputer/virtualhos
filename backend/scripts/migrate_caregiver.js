require('dotenv').config();
const { pool_vhos } = require('../config/database');

async function migrate() {
  const conn = await pool_vhos.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS caregiver_sessions (
        session_id VARCHAR(64) PRIMARY KEY,
        caregiver_cid VARCHAR(13),
        caregiver_prefix VARCHAR(50),
        caregiver_name VARCHAR(100),
        caregiver_surname VARCHAR(100),
        caregiver_phone VARCHAR(20),
        caregiver_birthdate VARCHAR(20),
        moph_jti VARCHAR(100),
        moph_ial VARCHAR(20),
        status ENUM('PENDING', 'COMPLETED', 'EXPIRED') DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ caregiver_sessions table created or exists');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS caregiver_affidavits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(64),
        caregiver_cid VARCHAR(13) NOT NULL,
        caregiver_name VARCHAR(255) NOT NULL,
        caregiver_phone VARCHAR(20),
        caregiver_birthdate VARCHAR(20),
        patient_hn VARCHAR(20) NOT NULL,
        patient_cid VARCHAR(13) NOT NULL,
        patient_name VARCHAR(255) NOT NULL,
        relationship VARCHAR(100) NOT NULL,
        relationship_desc VARCHAR(255),
        inability_reasons TEXT,
        inability_reason_other VARCHAR(255),
        patient_id_card_img VARCHAR(255),
        witness_username VARCHAR(100) NOT NULL,
        witness_name VARCHAR(255) NOT NULL,
        witness_position VARCHAR(100),
        moph_jti VARCHAR(100),
        moph_ial VARCHAR(20),
        pdf_path VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_caregiver_cid (caregiver_cid),
        INDEX idx_patient_hn (patient_hn),
        INDEX idx_session_id (session_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ caregiver_affidavits table created or exists');

    // Add menu into system_menus if not exists
    await conn.query(`
      INSERT INTO system_menus (menu_key, menu_name, group_name, path, icon, sort_order)
      VALUES ('caregivers', 'Caregiver (ผู้ดูแล)', 'LINE OA', '/caregivers', 'users', 25)
      ON DUPLICATE KEY UPDATE menu_name = VALUES(menu_name), group_name = VALUES(group_name), path = VALUES(path), sort_order = VALUES(sort_order);
    `);
    console.log('✅ system_menus updated with caregivers');

    // Add permission for admin
    await conn.query(`
      INSERT IGNORE INTO system_role_permissions (role_key, menu_key)
      VALUES ('admin', 'caregivers');
    `);
    console.log('✅ admin permission added for caregivers');

  } catch (err) {
    console.error('❌ Migration Error:', err);
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate();
