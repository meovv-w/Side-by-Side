ALTER TABLE support_tickets
  ADD COLUMN target_type VARCHAR(32) NULL AFTER order_id,
  ADD COLUMN target_id VARCHAR(128) NULL AFTER target_type,
  ADD COLUMN message_id VARCHAR(64) NULL AFTER target_id,
  ADD INDEX idx_support_target (target_type, target_id, status);
