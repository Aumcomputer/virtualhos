-- ============================================================================
-- Migration: Add workflow stage fields for Doctor and Pharmacist approvals
-- ============================================================================

ALTER TABLE virtualhos.req_telemed
  ADD COLUMN IF NOT EXISTS doctor_approved_by VARCHAR(100) DEFAULT NULL COMMENT 'แพทย์ผู้อนุมัติหรือเจ้าหน้าที่ผู้ประสานแพทย์' AFTER approve_at,
  ADD COLUMN IF NOT EXISTS doctor_approved_at DATETIME DEFAULT NULL COMMENT 'วันเวลาที่แพทย์อนุมัติ' AFTER doctor_approved_by,
  ADD COLUMN IF NOT EXISTS doctor_remark TEXT DEFAULT NULL COMMENT 'เหตุผลหรือหมายเหตุจากแพทย์' AFTER doctor_approved_at,
  ADD COLUMN IF NOT EXISTS pharmacy_approved_by VARCHAR(100) DEFAULT NULL COMMENT 'เภสัชกรผู้ตรวจอนุมัติยา' AFTER doctor_remark,
  ADD COLUMN IF NOT EXISTS pharmacy_approved_at DATETIME DEFAULT NULL COMMENT 'วันเวลาที่เภสัชกรอนุมัติ' AFTER pharmacy_approved_by,
  ADD COLUMN IF NOT EXISTS pharmacy_remark TEXT DEFAULT NULL COMMENT 'เหตุผลหรือหมายเหตุจากเภสัชกร' AFTER pharmacy_approved_at;
