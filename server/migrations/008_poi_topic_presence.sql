CREATE TABLE poi_topic_presence (
  id VARCHAR(64) PRIMARY KEY,
  topic_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  last_seen_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_topic_presence_user (topic_id, user_id),
  INDEX idx_topic_presence_active (topic_id, last_seen_at),
  CONSTRAINT fk_topic_presence_topic FOREIGN KEY (topic_id) REFERENCES poi_topics(id) ON DELETE CASCADE,
  CONSTRAINT fk_topic_presence_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
