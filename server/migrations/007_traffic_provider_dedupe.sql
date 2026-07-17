ALTER TABLE traffic_events
  ADD UNIQUE INDEX uq_traffic_provider (provider_id);
