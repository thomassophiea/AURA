-- PPSK identity fields for the golden EP1 "Pre-Shared Keys" screens.
--
-- The base table (0014) modelled a key as name/ssid/passphrase/role/vlan/scope.
-- The management UI also carries an owner email, a usage mode (shared vs. a
-- single device bound by MAC), a notify-on-change flag, and a "store the key on
-- the assigned Gateways" flag (the STORED LOCALLY badge). All are operational,
-- not personal — a PPSK identity is a credential, so they are always kept.
--
-- NOTE: server/ppsk/ppskStore.js lazy-ensures the same idempotent DDL (deployed
-- images do not include migrations/). Keep the two in sync.

ALTER TABLE ppsk_identities
  ADD COLUMN IF NOT EXISTS email         text,
  ADD COLUMN IF NOT EXISTS usage         text NOT NULL DEFAULT 'multi',
  ADD COLUMN IF NOT EXISTS mac_mode      text,
  ADD COLUMN IF NOT EXISTS mac           text,
  ADD COLUMN IF NOT EXISTS notify        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS store_locally boolean NOT NULL DEFAULT false;
