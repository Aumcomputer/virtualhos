const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { pool_vhos } = require('../config/database');

async function migrate() {
  let conn;
  try {
    conn = await pool_vhos.getConnection();
    console.log('Connected to pool_vhos successfully');

    const sql = `
      CREATE TABLE IF NOT EXISTS virtualhos.telemed_stat (
        id INT AUTO_INCREMENT PRIMARY KEY,
        prescreening_id INT NOT NULL,
        oapp_id INT NULL,
        hn VARCHAR(20) NOT NULL,
        vn VARCHAR(20) NULL,
        vstdate DATE NOT NULL,
        patient_name VARCHAR(255) NULL,
        doctor_code VARCHAR(20) NULL,
        doctor_name VARCHAR(255) NULL,
        clinic VARCHAR(100) NULL,
        pttype VARCHAR(10) NULL,
        pttype_name VARCHAR(100) NULL,
        pharmacy_status VARCHAR(50) NOT NULL DEFAULT 'WAITING',
        pharmacy_pay_type VARCHAR(20) NULL,
        pharmacy_note TEXT NULL,
        dispensed_at DATETIME NULL,
        dispensed_by VARCHAR(100) NULL,
        finance_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        finance_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        paid_at DATETIME NULL,
        paid_by VARCHAR(100) NULL,
        delivery_type VARCHAR(50) NOT NULL DEFAULT 'POST',
        tracking_number VARCHAR(100) NULL,
        delivery_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        delivery_at DATETIME NULL,
        delivery_by VARCHAR(100) NULL,
        status VARCHAR(100) NOT NULL DEFAULT 'รอจัดยา',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_prescreening_id (prescreening_id),
        INDEX idx_hn_vstdate (hn, vstdate),
        INDEX idx_vn (vn),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    await conn.query(sql);
    console.log('Successfully created or verified virtualhos.telemed_stat table');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    if (conn) conn.release();
    process.exit(0);
  }
}

migrate();
