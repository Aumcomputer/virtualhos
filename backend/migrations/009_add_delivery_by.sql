-- ============================================================================
-- Migration 009: Add delivery_by column to virtualhos.req_telemed
-- ============================================================================

ALTER TABLE virtualhos.req_telemed
  ADD COLUMN IF NOT EXISTS delivery_by VARCHAR(100) DEFAULT NULL COMMENT 'เจ้าหน้าที่ผู้บันทึกจัดส่งยา' AFTER delivery_at;
