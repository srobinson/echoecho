-- Migration: 20260309_004_route_save_rpcs
-- DOWN: Remove route save RPCs and the columns added in UP

DROP FUNCTION IF EXISTS retract_route(uuid);
DROP FUNCTION IF EXISTS publish_route(uuid);
DROP FUNCTION IF EXISTS save_route(uuid, text, text, text, uuid, uuid, text, text[], integer, jsonb);
DROP FUNCTION IF EXISTS create_building_stub(uuid, text, float, float);

ALTER TABLE routes
  DROP COLUMN IF EXISTS recorded_at,
  DROP COLUMN IF EXISTS recorded_duration_sec,
  DROP COLUMN IF EXISTS to_label,
  DROP COLUMN IF EXISTS from_label;
