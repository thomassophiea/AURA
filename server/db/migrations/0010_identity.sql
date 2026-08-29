-- AURA identity layer: users, roles, audit trail, and platform settings.
--
-- Authentication roots stay external (controller credentials, or OIDC SSO when
-- enabled) — AURA never stores passwords. These tables hold who a principal is
-- INSIDE AURA (role, enablement), what they did (audit), and admin-configured
-- platform settings (SSO, Cortex enablement, alert routing preferences).
--
-- NOTE: server/identity/identityStore.js lazy-ensures the same idempotent DDL
-- (deployed images do not include migrations/). Keep the two in sync.

CREATE TABLE IF NOT EXISTS aura_users (
  username      text PRIMARY KEY,
  display_name  text,
  email         text,
  role          text NOT NULL DEFAULT 'viewer',
  source        text NOT NULL DEFAULT 'controller',
  disabled      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS aura_audit_log (
  id       bigserial PRIMARY KEY,
  actor    text,
  source   text,
  action   text NOT NULL,
  target   text,
  detail   jsonb NOT NULL DEFAULT '{}'::jsonb,
  at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aura_audit_at ON aura_audit_log (at DESC);

CREATE TABLE IF NOT EXISTS aura_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
