-- Controller identity columns: persist hostname + Locking ID per controller.
-- Sourced live from /system/info on first successful connect, then cached so the
-- Site Group picker can show identity for hundreds of controllers without a live
-- fetch per row. Safe to run multiple times.

ALTER TABLE controllers ADD COLUMN IF NOT EXISTS hostname   text;
ALTER TABLE controllers ADD COLUMN IF NOT EXISTS locking_id text;

COMMENT ON COLUMN controllers.hostname   IS 'Controller host name, cached from /system/info.';
COMMENT ON COLUMN controllers.locking_id IS 'Controller Locking ID (stable license identity), cached from /system/info.';
