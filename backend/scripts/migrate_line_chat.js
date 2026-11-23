const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { pool_vhos } = require('../config/database');

/**
 * Migration for LINE OA Chat Center:
 * - line_chat_rooms
 * - line_chat_messages
 * - system_menus & system_role_permissions registration for 'line_chat'
 */
async function migrate() {
  let conn;
  let exitCode = 0;
  try {
    conn = await pool_vhos.getConnection();

    await conn.query(`
      CREATE TABLE IF NOT EXISTS line_chat_rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        line_user_id VARCHAR(100) NOT NULL UNIQUE,
        display_name VARCHAR(255) NULL,
        picture_url TEXT NULL,
        hn VARCHAR(20) NULL,
        last_message_text VARCHAR(500) NULL,
        last_message_type VARCHAR(30) NOT NULL DEFAULT 'text',
        last_message_at DATETIME NULL,
        last_direction ENUM('inbound', 'outbound') NOT NULL DEFAULT 'inbound',
        unread_count INT NOT NULL DEFAULT 0,
        last_reply_token VARCHAR(255) NULL,
        last_reply_token_at DATETIME NULL,
        profile_updated_at DATETIME NULL,
        status ENUM('open', 'resolved', 'archived') NOT NULL DEFAULT 'open',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_lcr_last_msg (last_message_at),
        INDEX idx_lcr_hn (hn),
        INDEX idx_lcr_unread (unread_count)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ line_chat_rooms table ready');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS line_chat_messages (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        room_id INT NOT NULL,
        line_user_id VARCHAR(100) NOT NULL,
        line_message_id VARCHAR(100) NULL,
        direction ENUM('inbound', 'outbound') NOT NULL,
        message_type VARCHAR(30) NOT NULL DEFAULT 'text',
        content TEXT NULL,
        media_key VARCHAR(500) NULL,
        media_mime VARCHAR(100) NULL,
        media_size INT NULL,
        media_filename VARCHAR(255) NULL,
        sticker_package_id VARCHAR(50) NULL,
        sticker_id VARCHAR(50) NULL,
        sent_by_username VARCHAR(100) NULL,
        sent_by_name VARCHAR(255) NULL,
        delivery_method ENUM('webhook', 'reply', 'push') NOT NULL DEFAULT 'webhook',
        delivery_status ENUM('received', 'sent', 'failed') NOT NULL DEFAULT 'received',
        error_message TEXT NULL,
        raw_event LONGTEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_lcm_line_msg_id (line_message_id),
        KEY idx_lcm_room_created (room_id, created_at),
        KEY idx_lcm_user_created (line_user_id, created_at),
        CONSTRAINT fk_lcm_room FOREIGN KEY (room_id) REFERENCES line_chat_rooms(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ line_chat_messages table ready');

    await conn.query(`
      INSERT INTO system_menus (menu_key, menu_name, group_name, path, icon, sort_order)
      VALUES ('line_chat', 'แชท LINE OA', 'LINE OA', '/line-chat', 'MessageCircle', 15)
      ON DUPLICATE KEY UPDATE
        menu_name = VALUES(menu_name),
        group_name = VALUES(group_name),
        path = VALUES(path),
        icon = VALUES(icon),
        sort_order = VALUES(sort_order);
    `);
    console.log('✅ Registered line_chat in system_menus');

    await conn.query(`
      INSERT IGNORE INTO system_role_permissions (role_key, menu_key) VALUES
      ('admin', 'line_chat'),
      ('clinic_manager', 'line_chat'),
      ('operator', 'line_chat');
    `);
    console.log('✅ Registered default role permissions for line_chat');
  } catch (err) {
    console.error('❌ Migration Error:', err);
    exitCode = 1;
  } finally {
    if (conn) conn.release();
    process.exit(exitCode);
  }
}

migrate();
