-- ============================================================================
-- Migration: Add workflow tracking fields to virtualhos.req_telemed
-- ============================================================================

ALTER TABLE virtualhos.req_telemed
  ADD COLUMN IF NOT EXISTS received_by VARCHAR(100) DEFAULT NULL COMMENT 'เจ้าหน้าที่ผู้กดรับเรื่อง' AFTER status,
  ADD COLUMN IF NOT EXISTS received_at DATETIME DEFAULT NULL COMMENT 'วันเวลาที่กดรับเรื่อง' AFTER received_by,
  ADD COLUMN IF NOT EXISTS delivery_at DATETIME DEFAULT NULL COMMENT 'วันเวลาที่บันทึกจัดส่งพัสดุ' AFTER tracking_number;
