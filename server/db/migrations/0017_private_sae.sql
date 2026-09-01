-- AURA Private SAE credentials: per-user WPA3-Personal (SAE) identities for one
-- WLAN, and their MAC bindings from enrollment.
--
-- Private SAE is PPSK's identity model on the SAE AKM (see 0014_ppsk.sql). AURA
-- owns the credential lifecycle; the Campus OS AP dataplane can already select a
-- per-station SAE password by MAC (hardware evidence — docs/private-sae/
-- PRIVATE_SAE_CAMPUS_OS_REQUIREMENTS.md, E1/E2), but the controller's config
-- generator does not yet emit a sae_password set, so provisioning is rendered
-- here and applied out of band until the controller enhancement (R1) lands.
--
-- The passphrase is stored application-encrypted (server/ppsk/ppskCrypto.js,
-- reused verbatim) — never hashed — because the AP needs the plaintext to derive
-- the PT. Nothing here is personal data; a SAE credential is an operational
-- credential. The `akm` column lets one table express WPA3-SAE (default) so a
-- credential can later be migrated from a WPA2-PPSK identity.
--
-- A binding is one station MAC enrolled onto a credential — the selector the AP
-- uses to pick the password pre-Commit. A credential with no binding renders a
-- wildcard sae_password line; a credential with bindings renders one line per
-- bound MAC.
--
-- NOTE: server/privateSae/saeStore.js lazy-ensures the same idempotent DDL
-- (deployed images do not include migrations/). Keep the two in sync.

CREATE TABLE IF NOT EXISTS private_sae_credentials (
  id                   text PRIMARY KEY,
  name                 text NOT NULL,
  description          text,
  email                text,
  ssid                 text NOT NULL DEFAULT 'AURA_PSAE',
  keyid                text NOT NULL,
  passphrase_encrypted text NOT NULL,
  akm                  text NOT NULL DEFAULT 'wpa3-sae',
  role                 text,
  vlan_id              integer,
  usage                text NOT NULL DEFAULT 'multi',
  scope                text NOT NULL DEFAULT 'global',
  scope_ref            text,
  enabled              boolean NOT NULL DEFAULT true,
  expires_at           timestamptz,
  max_devices          integer,
  notify               boolean NOT NULL DEFAULT false,
  store_locally        boolean NOT NULL DEFAULT false,
  last_used_at         timestamptz,
  created_by           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- One WLAN advertises one SSID; a keyid must be unique within that SSID or the
-- AP's sae_password set would carry two credentials claiming the same identity.
CREATE UNIQUE INDEX IF NOT EXISTS idx_private_sae_ssid_keyid ON private_sae_credentials (ssid, keyid);
CREATE INDEX IF NOT EXISTS idx_private_sae_ssid_enabled ON private_sae_credentials (ssid, enabled);
CREATE INDEX IF NOT EXISTS idx_private_sae_created ON private_sae_credentials (created_at DESC);

-- MAC bindings: the enrollment output that becomes the AP's mac= selector. A
-- binding dies with its credential (revoke a credential ⇒ revoke every binding).
CREATE TABLE IF NOT EXISTS private_sae_bindings (
  id            text PRIMARY KEY,
  credential_id text NOT NULL REFERENCES private_sae_credentials (id) ON DELETE CASCADE,
  mac           text NOT NULL,
  bound_at      timestamptz NOT NULL DEFAULT now(),
  last_seen     timestamptz,
  UNIQUE (credential_id, mac)
);

CREATE INDEX IF NOT EXISTS idx_private_sae_bindings_credential ON private_sae_bindings (credential_id);
