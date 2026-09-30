-- ============================================================================
-- Migration 007: Dynamic Roles & Menu Permissions System
-- Rebuild role and authorization system with 5 initial roles:
-- 1. admin (ผู้ดูแลระบบ)
-- 2. clinic_manager (ผู้จัดการคลินิก)
-- 3. operator (เจ้าหน้าที่รับเรื่อง/คัดกรอง)
-- 4. pharmacy (ห้องยา/เภสัชกรรม)
-- 5. finance (การเงิน)
-- Supports adding custom roles in the future and configuring menu access per role
-- ============================================================================

-- 1. Table: system_roles
CREATE TABLE IF NOT EXISTS virtualhos.system_roles (
  role_key VARCHAR(50) NOT NULL PRIMARY KEY COMMENT 'Key identifier, e.g. admin, clinic_manager, operator, pharmacy, finance',
  role_name VARCHAR(100) NOT NULL COMMENT 'Display name in Thai/English',
  description VARCHAR(255) DEFAULT NULL,
  icon VARCHAR(50) DEFAULT '👤',
  badge_color VARCHAR(50) DEFAULT 'blue',
  is_system TINYINT(1) DEFAULT 0 COMMENT '1 = System role (cannot be deleted)',
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Table: system_menus
CREATE TABLE IF NOT EXISTS virtualhos.system_menus (
  menu_key VARCHAR(50) NOT NULL PRIMARY KEY COMMENT 'Unique menu key',
  menu_name VARCHAR(100) NOT NULL COMMENT 'Menu display label',
  group_name VARCHAR(100) NOT NULL COMMENT 'Group / Section name in Sidebar',
  path VARCHAR(150) NOT NULL COMMENT 'Frontend route path',
  icon VARCHAR(50) DEFAULT NULL,
  sort_order INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Table: system_role_permissions
CREATE TABLE IF NOT EXISTS virtualhos.system_role_permissions (
  role_key VARCHAR(50) NOT NULL,
  menu_key VARCHAR(50) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_key, menu_key),
  CONSTRAINT fk_srp_role FOREIGN KEY (role_key) REFERENCES virtualhos.system_roles(role_key) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_srp_menu FOREIGN KEY (menu_key) REFERENCES virtualhos.system_menus(menu_key) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Seed initial system_roles
INSERT INTO virtualhos.system_roles (role_key, role_name, description, icon, badge_color, is_system, sort_order)
VALUES
  ('admin', 'Admin (ผู้ดูแลระบบ)', 'ผู้ดูแลระบบสูงสุด เข้าถึงและจัดการได้ทุกเมนูและตั้งค่าระบบ', '🛡️', 'rose', 1, 1),
  ('clinic_manager', 'Clinic Manager (ผู้จัดการคลินิก)', 'ผู้จัดการคลินิก ดูแลภาพรวม ติดตามเคส Telemed และงานทุกแผนก', '🏥', 'indigo', 1, 2),
  ('operator', 'Operator (เจ้าหน้าที่รับเรื่อง/คัดกรอง)', 'เจ้าหน้าที่รับเรื่อง ตรวจสอบเอกสาร และคัดกรองคำขอรับยา', '🎧', 'purple', 1, 3),
  ('pharmacy', 'Pharmacy (ห้องยา / เภสัชกร)', 'ห้องยาและเภสัชกรรม ตรวจสอบและจัดยา ส่งมอบยาและพัสดุ', '💊', 'emerald', 1, 4),
  ('finance', 'Finance (การเงิน)', 'งานการเงิน ตรวจสอบและบันทึกการชำระค่ายาและค่าบริการ', '💰', 'amber', 1, 5)
ON DUPLICATE KEY UPDATE
  role_name = VALUES(role_name),
  description = VALUES(description),
  icon = VALUES(icon),
  badge_color = VALUES(badge_color),
  sort_order = VALUES(sort_order);

-- 5. Seed initial system_menus
INSERT INTO virtualhos.system_menus (menu_key, menu_name, group_name, path, icon, sort_order)
VALUES
  -- LINE OA
  ('today_registrations', 'ลงทะเบียนวันนี้', 'LINE OA', '/', 'calendar', 10),
  ('all_registrations', 'ข้อมูลลงทะเบียนทั้งหมด', 'LINE OA', '/all', 'users', 20),
  -- Telemed
  ('telemed_dashboard', 'Dashboard Telemed', 'Telemed', '/telemed-dashboard', 'chart', 30),
  ('telemed_cases', 'Case Telemed วันนี้', 'Telemed', '/telemed-with-doctor', 'activity', 40),
  ('telemed_appointments', 'ใบนัด Telemed วันนี้', 'Telemed', '/telemed-appointments', 'calendar', 50),
  ('prescreening', 'ข้อมูลคัดกรอง', 'Telemed', '/prescreening', 'clipboard', 60),
  -- Pre-screening (คำขอรับยา)
  ('request_telemed_register', 'ลงทะเบียนขอรับยา', 'Pre-screening (คำขอรับยา)', '/request-telemed/register', 'user-plus', 70),
  ('request_telemed_receive', 'รอรับเรื่อง', 'Pre-screening (คำขอรับยา)', '/request-telemed/pending-receive', 'inbox', 80),
  ('request_telemed_doctor', 'รอปรึกษาแพทย์', 'Pre-screening (คำขอรับยา)', '/request-telemed/pending-doctor', 'stethoscope', 90),
  ('request_telemed_pharmacist', 'รอปรึกษาเภสัช', 'Pre-screening (คำขอรับยา)', '/request-telemed/pharmacist', 'plus-square', 100),
  ('request_telemed_approved', 'รายการที่อนุมัติ', 'Pre-screening (คำขอรับยา)', '/request-telemed/approved', 'check-circle', 110),
  ('request_telemed_all', 'ผู้ยื่นความจำนงทั้งหมด', 'Pre-screening (คำขอรับยา)', '/request-telemed/all', 'list', 120),
  -- Telemed Today (วันนัดจริง)
  ('telemed_today_appointments', '“รับยาไม่พบแพทย์” วันนี้', 'Telemed Today (วันนัดจริง)', '/telemed-today/appointments', 'calendar-check', 130),
  ('telemed_today_pharmacy', 'ห้องยา', 'Telemed Today (วันนัดจริง)', '/telemed-today/pharmacy', 'pill', 140),
  ('telemed_today_finance', 'การเงิน', 'Telemed Today (วันนัดจริง)', '/telemed-today/finance', 'credit-card', 150),
  -- ตั้งค่าระบบ
  ('settings', 'ตั้งค่าผู้ใช้งานและสิทธิ์', 'ตั้งค่าระบบ', '/settings', 'settings', 160)
ON DUPLICATE KEY UPDATE
  menu_name = VALUES(menu_name),
  group_name = VALUES(group_name),
  path = VALUES(path),
  icon = VALUES(icon),
  sort_order = VALUES(sort_order);

-- 6. Seed initial permissions for the 5 roles
-- 6.1 Admin: All menus
INSERT IGNORE INTO virtualhos.system_role_permissions (role_key, menu_key)
SELECT 'admin', menu_key FROM virtualhos.system_menus;

-- 6.2 Clinic Manager: All clinical/telemed/prescreening/today menus (except settings)
INSERT IGNORE INTO virtualhos.system_role_permissions (role_key, menu_key)
SELECT 'clinic_manager', menu_key FROM virtualhos.system_menus WHERE menu_key != 'settings';

-- 6.3 Operator: LINE OA, Pre-screening, Appointments Today
INSERT IGNORE INTO virtualhos.system_role_permissions (role_key, menu_key)
VALUES
  ('operator', 'today_registrations'),
  ('operator', 'all_registrations'),
  ('operator', 'request_telemed_register'),
  ('operator', 'request_telemed_receive'),
  ('operator', 'request_telemed_doctor'),
  ('operator', 'request_telemed_pharmacist'),
  ('operator', 'request_telemed_approved'),
  ('operator', 'request_telemed_all'),
  ('operator', 'telemed_today_appointments');

-- 6.4 Pharmacy: Pre-screening pharmacy/approved/all + Today appointments & pharmacy
INSERT IGNORE INTO virtualhos.system_role_permissions (role_key, menu_key)
VALUES
  ('pharmacy', 'request_telemed_pharmacist'),
  ('pharmacy', 'request_telemed_approved'),
  ('pharmacy', 'request_telemed_all'),
  ('pharmacy', 'telemed_today_appointments'),
  ('pharmacy', 'telemed_today_pharmacy');

-- 6.5 Finance: Pre-screening all + Today appointments & finance
INSERT IGNORE INTO virtualhos.system_role_permissions (role_key, menu_key)
VALUES
  ('finance', 'request_telemed_all'),
  ('finance', 'telemed_today_appointments'),
  ('finance', 'telemed_today_finance');

-- 7. Migrate legacy roles in admin_users: 'request_telemed' -> 'operator', 'viewer' -> 'operator'
UPDATE virtualhos.admin_users
SET role = 'operator'
WHERE role IN ('request_telemed', 'viewer');
