ALTER TABLE traffic_events
  ADD COLUMN source ENUM('provider','ops','user') NOT NULL DEFAULT 'provider' AFTER provider_id,
  ADD COLUMN reporter_id VARCHAR(64) NULL AFTER source,
  ADD COLUMN status ENUM('pending','active','rejected') NOT NULL DEFAULT 'active' AFTER ends_at,
  ADD COLUMN reviewed_by VARCHAR(64) NULL AFTER status,
  ADD COLUMN review_reason VARCHAR(500) NOT NULL DEFAULT '' AFTER reviewed_by,
  ADD COLUMN reviewed_at DATETIME(3) NULL AFTER review_reason,
  ADD INDEX idx_traffic_status (status, created_at),
  ADD CONSTRAINT fk_traffic_reporter FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_traffic_reviewer FOREIGN KEY (reviewed_by) REFERENCES admins(id) ON DELETE SET NULL;
