ALTER TABLE invites
  MODIFY COLUMN source ENUM('link','qrcode','phone_fallback','merchant') NOT NULL;

ALTER TABLE invite_links
  MODIFY COLUMN source ENUM('link','qrcode','merchant') NOT NULL;
