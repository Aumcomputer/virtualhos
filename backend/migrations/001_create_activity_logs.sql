-- ============================================================================
-- Activity Logs Table — tracks login and telemed call events
-- Run this on the VHOS database (same as admin_users / telemed_sessions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username    VARCHAR(100)   NOT NULL,
  action      VARCHAR(50)    NOT NULL COMMENT 'login | call_line_oa | call_mohpromt',
  detail      VARCHAR(1000)  DEFAULT NULL COMMENT 'Additional context (role, hn, patient, status)',
  ip_address  VARCHAR(45)    DEFAULT NULL COMMENT 'Client IP (IPv4 or IPv6)',
  created_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_action       (action),
  INDEX idx_username     (username),
  INDEX idx_created_at   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
