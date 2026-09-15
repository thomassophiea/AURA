-- Cortex API gap catalogue.
--
-- Every time Cortex cannot answer a question because the platform exposes no
-- endpoint, no field or no telemetry for it, the gap is recorded here rather
-- than disappearing into a hedge in one operator's chat window.
--
-- The product question this table exists to answer is:
--
--   "What are customers asking that we cannot currently answer?"
--
-- which is unanswerable from logs, because the failure mode is a POLITE answer
-- ("I can't prove that with the telemetry available"), not an error. Nothing
-- upstream counts those.
--
-- One row per (capability, question shape) per controller, with a hit counter —
-- not one row per occurrence. A gap asked about four hundred times is one gap
-- worth four hundred, and an append-only event log would bury that under its
-- own volume.

CREATE TABLE IF NOT EXISTS cortex_api_gaps (
  id                 bigserial PRIMARY KEY,

  -- Which controller the gap was observed against. Capability varies by
  -- firmware, so the same gap can be real on one Gateway and closed on another.
  controller_key     text        NOT NULL,

  -- The capability registry key, when the gap came from a probed capability
  -- ('ap.reboot_reason'), or a synthesised key when it came from a question
  -- Cortex could not route at all.
  capability_key     text        NOT NULL,

  -- A NORMALISED question shape, never the operator's raw text: raw questions
  -- carry client names, usernames and MAC addresses, and this table is read by
  -- product management, not by operations.
  question_shape     text        NOT NULL,

  -- What evidence would have been needed, and what the platform offers instead.
  evidence_required  text,
  available_instead  text,

  -- Why it matters, in one line, so a reader does not have to reconstruct the
  -- investigation to judge the priority.
  impact             text,

  -- 'capability'  a probed capability this Gateway reports as unavailable
  -- 'endpoint'    no REST route exists for the operation at all
  -- 'field'       the route exists but never populates the field
  -- 'telemetry'   the measurement is not collected
  -- 'retention'   the data exists but not far enough back
  -- 'unrouted'    understood, but Cortex has no tool that would answer it
  gap_kind           text        NOT NULL DEFAULT 'capability',

  hits               integer     NOT NULL DEFAULT 1 CHECK (hits > 0),
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL DEFAULT now(),

  -- Set when the gap is closed by a firmware or API change, so history is kept
  -- rather than deleted. A gap that reappears gets a fresh row.
  resolved_at        timestamptz,
  resolution_note    text
);

-- The upsert key. Partial so a resolved gap can recur without colliding with
-- its own history.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cortex_api_gap_open
  ON cortex_api_gaps (controller_key, capability_key, question_shape)
  WHERE resolved_at IS NULL;

-- The report: "what is costing us the most answers", newest and hottest first.
CREATE INDEX IF NOT EXISTS idx_cortex_api_gaps_rank
  ON cortex_api_gaps (hits DESC, last_seen_at DESC)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE cortex_api_gaps IS
  'Questions Cortex could not answer because the platform exposes no endpoint, field or telemetry. Product feedback for Ascend / OS ONE. Question text is normalised to a shape; no client identifiers are stored.';
