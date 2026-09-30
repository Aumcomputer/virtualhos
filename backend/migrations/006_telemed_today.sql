-- ============================================================================
-- Migration 006: Add columns for Telemed Today workflow
-- (Real-date visit from HOSxP, Pharmacy Dispense & Finance approvals)
-- ============================================================================

ALTER TABLE virtualhos.req_telemed
  ADD COLUMN IF NOT EXISTS vn_today VARCHAR(20) DEFAULT NULL COMMENT 'VN ของ visit วันนี้ที่เวชระเบียนเปิดใน HOSxP' AFTER oapp_id,
  ADD COLUMN IF NOT EXISTS pharmacy_pay_type VARCHAR(20) DEFAULT NULL COMMENT 'PAID (ต้องชำระเงิน), FREE (ไม่ต้องชำระเงิน)' AFTER pharmacy_remark,
  ADD COLUMN IF NOT EXISTS pharmacy_dispense_by VARCHAR(100) DEFAULT NULL COMMENT 'เภสัชกรผู้จัดยา' AFTER pharmacy_pay_type,
  ADD COLUMN IF NOT EXISTS pharmacy_dispense_at DATETIME DEFAULT NULL COMMENT 'วันเวลาที่เภสัชกรจัดยา' AFTER pharmacy_dispense_by,
  ADD COLUMN IF NOT EXISTS finance_status VARCHAR(20) DEFAULT NULL COMMENT 'PENDING (รอชำระเงิน), PAID (ชำระเงินแล้ว), FREE (ไม่ต้องชำระ)' AFTER pharmacy_dispense_at,
  ADD COLUMN IF NOT EXISTS finance_by VARCHAR(100) DEFAULT NULL COMMENT 'เจ้าหน้าที่การเงินผู้บันทึกชำระ' AFTER finance_status,
  ADD COLUMN IF NOT EXISTS finance_at DATETIME DEFAULT NULL COMMENT 'วันเวลาที่ชำระเงิน' AFTER finance_by;
