-- ============================================================================
-- Migration: Add request_by column to virtualhos.req_telemed
-- ============================================================================

ALTER TABLE virtualhos.req_telemed
  ADD COLUMN IF NOT EXISTS request_by VARCHAR(100) DEFAULT NULL COMMENT 'ผู้บันทึกคำขอ (เจ้าหน้าที่หรือคนไข้)' AFTER approve_at;
