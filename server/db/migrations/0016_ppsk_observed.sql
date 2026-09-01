-- Observed PPSK identity: the live binding of a client MAC to the PPSK keyid it
-- authenticated with, as seen on the wireless side.
--
-- Campus OS does not (yet) report which per-key identity a station used — the
-- AP authenticator knows it, but it never reaches the controller's client
-- record, so AURA's Clients "Username" column is blank for PPSK clients. This
-- table is the bridge: an out-of-band collector reads MAC->keyid from the APs
-- and posts it here; AURA overlays it onto the Clients view.
--
-- This is a stopgap for the observability gap. The clean fix is the controller
-- reporting the keyid into the station's userName (see docs/PPSK.md). Rows are
-- ephemeral observations, upserted by MAC and aged out on read.
--
-- NOTE: server/ppsk/ppskObservedStore.js lazy-ensures the same idempotent DDL
-- (deployed images do not include migrations/). Keep the two in sync.

CREATE TABLE IF NOT EXISTS ppsk_observed (
  mac       text PRIMARY KEY,
  keyid     text NOT NULL,
  ssid      text,
  ap_name   text,
  source    text,
  seen_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppsk_observed_seen ON ppsk_observed (seen_at DESC);
