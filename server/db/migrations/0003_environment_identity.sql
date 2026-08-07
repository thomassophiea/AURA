-- Stamp this database with the environment it belongs to.
--
-- Integration and Production Demo run byte-identical images and differ only by
-- variables. A DATABASE_URL pasted into the wrong service is therefore a
-- completely silent failure: the process connects, the schema matches, and the
-- retention sweep happily deletes the other environment's history.
--
-- This table makes that mistake loud. `environmentGuard.js` reads it before any
-- destructive work and refuses to proceed on a mismatch.
--
-- The CHECK on `singleton` is what keeps it a *stamp*: exactly one row can ever
-- exist, so there is no ambiguity about which environment a database claims to
-- be.

CREATE TABLE IF NOT EXISTS environment_identity (
  singleton    boolean     PRIMARY KEY DEFAULT true CHECK (singleton),
  environment  text        NOT NULL CHECK (environment IN ('integration', 'production')),
  stamped_at   timestamptz NOT NULL DEFAULT now(),
  stamped_by   text        NULL
);

-- Claim the row for whichever environment migrates first. Existing databases
-- (Integration's, which predates this migration) get stamped on their next
-- migration run from the value the migrating process declares.
--
-- ON CONFLICT DO NOTHING, never DO UPDATE: a database that already knows what
-- it is must not be silently re-badged by a process that connected to it by
-- mistake. Re-stamping is a deliberate manual act.
INSERT INTO environment_identity (singleton, environment, stamped_by)
VALUES (
  true,
  COALESCE(NULLIF(current_setting('aura.environment', true), ''), 'integration'),
  COALESCE(NULLIF(current_setting('aura.stamped_by', true), ''), 'migration')
)
ON CONFLICT (singleton) DO NOTHING;
