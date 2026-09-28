-- ============================================================================
-- Migration for Telemed Pre-screening Cron Job System
-- ============================================================================

-- 1. ALTER dextor.tele_prescreening table to add tracking fields
ALTER TABLE dextor.tele_prescreening
  ADD COLUMN note VARCHAR(200) DEFAULT NULL AFTER doctor_name,
  ADD COLUMN clinic VARCHAR(255) DEFAULT NULL AFTER note,
  ADD COLUMN address VARCHAR(500) DEFAULT NULL AFTER clinic,
  ADD COLUMN line_sent ENUM('Y', 'N', 'NO_LINE') DEFAULT 'N' AFTER status,
  ADD COLUMN line_sent_timestamp DATETIME DEFAULT NULL AFTER line_sent,
  ADD COLUMN patient_name VARCHAR(200) DEFAULT NULL AFTER hn;

-- 2. CREATE virtualhos.cron_job_logs table
CREATE TABLE IF NOT EXISTS virtualhos.cron_job_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_name VARCHAR(100) NOT NULL,
  status ENUM('started', 'success', 'failed') NOT NULL,
  records_found INT DEFAULT 0,
  records_inserted INT DEFAULT 0,
  line_sent_count INT DEFAULT 0,
  line_failed_count INT DEFAULT 0,
  error_message TEXT DEFAULT NULL,
  started_at DATETIME NOT NULL,
  completed_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_job_name (job_name),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. CREATE virtualhos.app_config table
CREATE TABLE IF NOT EXISTS virtualhos.app_config (
  config_key VARCHAR(100) NOT NULL PRIMARY KEY,
  config_value TEXT,
  description VARCHAR(255),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. INSERT initial configuration
INSERT IGNORE INTO virtualhos.app_config (config_key, config_value, description)
VALUES ('prescreening_cron_time', '08:00', 'เวลาที่ Cron Job ดึงนัด Telemed สำหรับ Pre-screening (HH:mm)');
