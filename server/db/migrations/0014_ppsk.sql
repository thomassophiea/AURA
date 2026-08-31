-- AURA PPSK / MPSK identities: per-key identities for a WPA2-Personal WLAN.
--
-- AURA owns the PPSK identity lifecycle. Each row is one key: a passphrase bound
-- to an SSID, tagged with a `keyid` the AP echoes on connect. The Campus OS AP
-- dataplane already resolves identity-by-key via a wpa_psk_file (proven on real
-- hardware — docs/PPSK_HARDWARE_FINDINGS.md); the controller's config generator
-- does not yet emit that file, so provisioning is rendered here and applied out
-- of band until the controller enhancement lands.
--
-- The passphrase is stored application-encrypted (server/ppsk/ppskCrypto.js),
-- never hashed — the AP needs the plaintext to derive the PMK. Nothing here is
-- personal data; a PPSK identity is an operational credential.
--
-- NOTE: server/ppsk/ppskStore.js lazy-ensures the same idempotent DDL (deployed
-- images do not include migrations/). Keep the two in sync.

CREATE TABLE IF NOT EXISTS ppsk_identities (
  id                   text PRIMARY KEY,
  name                 text NOT NULL,
  description          text,
  ssid                 text NOT NULL,
  keyid                text NOT NULL,
  passphrase_encrypted text NOT NULL,
  role                 text,
  vlan_id              integer,
  scope                text NOT NULL DEFAULT 'global',
  scope_ref            text,
  enabled              boolean NOT NULL DEFAULT true,
  expires_at           timestamptz,
  max_devices          integer,
  last_used_at         timestamptz,
  created_by           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- One WLAN advertises one SSID; a keyid must be unique within that SSID or the
-- AP's key file would carry two lines claiming the same identity tag.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ppsk_ssid_keyid ON ppsk_identities (ssid, keyid);
CREATE INDEX IF NOT EXISTS idx_ppsk_ssid_enabled ON ppsk_identities (ssid, enabled);
CREATE INDEX IF NOT EXISTS idx_ppsk_created ON ppsk_identities (created_at DESC);
