-- ============================================================================
-- Migration 008: Add medical_records (เจ้าหน้าที่เวชระเบียน) role
-- ============================================================================

INSERT INTO virtualhos.system_roles (role_key, role_name, description, icon, badge_color, is_system, sort_order)
VALUES
  ('medical_records', 'Medical Records (เจ้าหน้าที่เวชระเบียน)', 'เจ้าหน้าที่เวชระเบียน ตรวจสอบข้อมูลประวัติผู้ป่วย ลงทะเบียน และตรวจสอบนัดหมาย', '📋', 'blue', 1, 3)
ON DUPLICATE KEY UPDATE
  role_name = VALUES(role_name),
  description = VALUES(description),
  icon = VALUES(icon),
  badge_color = VALUES(badge_color),
  is_system = 1;

UPDATE virtualhos.system_roles SET sort_order = 4 WHERE role_key = 'operator';
UPDATE virtualhos.system_roles SET sort_order = 5 WHERE role_key = 'pharmacy';
UPDATE virtualhos.system_roles SET sort_order = 6 WHERE role_key = 'finance';

-- Seed default permissions for medical_records
INSERT IGNORE INTO virtualhos.system_role_permissions (role_key, menu_key)
VALUES
  ('medical_records', 'today_registrations'),
  ('medical_records', 'all_registrations'),
  ('medical_records', 'telemed_appointments'),
  ('medical_records', 'prescreening'),
  ('medical_records', 'request_telemed_register'),
  ('medical_records', 'request_telemed_receive'),
  ('medical_records', 'request_telemed_all'),
  ('medical_records', 'telemed_today_appointments');
