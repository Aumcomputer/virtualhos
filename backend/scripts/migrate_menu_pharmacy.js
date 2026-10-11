const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { pool_vhos } = require('../config/database');

async function main() {
  let conn;
  try {
    conn = await pool_vhos.getConnection();
    await conn.query(`
      INSERT INTO system_menus (menu_key, menu_name, group_name, path, icon, sort_order)
      VALUES ('telemed_pharmacy', 'ห้องยา', 'Telemed', '/telemed-pharmacy', 'Pill', 25)
      ON DUPLICATE KEY UPDATE menu_name = VALUES(menu_name), group_name = VALUES(group_name), path = VALUES(path)
    `);

    await conn.query(`
      INSERT IGNORE INTO system_role_permissions (role_key, menu_key) VALUES
      ('admin', 'telemed_pharmacy'),
      ('clinic_manager', 'telemed_pharmacy'),
      ('pharmacy', 'telemed_pharmacy')
    `);

    console.log('Successfully registered telemed_pharmacy in system_menus & permissions');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (conn) conn.release();
    process.exit(0);
  }
}

main();
