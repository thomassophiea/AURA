-- Cortex durable workflows and structured blockers.
--
-- The problem this table exists to solve:
--
--   "Create a guest network" could not complete. Not because the write failed,
--   but because the request arrives incomplete -- no site, no security mode, no
--   name -- and there was nowhere to PUT that half-finished task. The
--   investigation endpoint is stateless per HTTP request, so every missing field
--   ended the task and the operator started over.
--
-- A blocker is not a failure. It is unresolved state. Unresolved state needs a
-- home that survives the request that discovered it, and -- because Railway
-- restarts containers and may run several instances -- a home outside one
-- process's memory. That is this table.
--
-- Deliberately NOT a chat transcript. The conversation is already carried in the
-- request; what was missing is the TASK: what the operator asked for, what has
-- been resolved since, what is still open, and what was already done to the
-- network. Those must outlive any single message.

CREATE TABLE IF NOT EXISTS cortex_workflows (
  id                   uuid        PRIMARY KEY,

  -- Groups a workflow to one operator's conversation. A reply of "PrimarySite"
  -- is meaningless without knowing which task it answers.
  session_id           text        NOT NULL,

  -- The operator's original words, kept verbatim. When a workflow is later
  -- reviewed ("why did Cortex build that?"), the paraphrase is not evidence.
  user_intent          text        NOT NULL,

  -- 'create_wlan', 'create_vlan', 'update_wlan', 'investigate', ...
  workflow_type        text        NOT NULL,

  status               text        NOT NULL DEFAULT 'PLANNING'
    CHECK (status IN (
      'PLANNING',
      'GATHERING_EVIDENCE',
      'WAITING_FOR_USER',
      'READY_FOR_PREVIEW',
      'WAITING_FOR_CONFIRMATION',
      'EXECUTING',
      'VERIFYING',
      'COMPLETED',
      'COMPLETED_WITH_WARNINGS',
      'BLOCKED_TECHNICALLY',
      'FAILED',
      'CANCELLED'
    )),

  -- Scope as the server resolved it, never as the model guessed it. Same
  -- argument scopeResolver makes for investigations, applied to writes.
  resolved_scope       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  resolved_entities    jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- What the operator asked for, versus what Cortex derived on their behalf.
  -- Kept apart on purpose: everything in derived_state must be disclosed in the
  -- preview, because the operator never said it out loud.
  requested_state      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  derived_state        jsonb       NOT NULL DEFAULT '{}'::jsonb,

  execution_plan       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  completed_steps      jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- Evidence gathered while planning, so a resumed workflow does not re-read the
  -- Gateway for facts it already established.
  evidence             jsonb       NOT NULL DEFAULT '[]'::jsonb,
  warnings             jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- 'none' | 'requested' | 'granted' | 'declined'. A write is refused unless
  -- this reads 'granted' -- the confirmation gate is state, not a prompt
  -- instruction the model could talk itself out of.
  confirmation_state   text        NOT NULL DEFAULT 'none'
    CHECK (confirmation_state IN ('none', 'requested', 'granted', 'declined')),

  -- Filled after execution: what was read back, and what could NOT be verified.
  validation           jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- How to undo it, captured BEFORE the write, because afterwards the
  -- information needed to reverse it may no longer be readable.
  rollback_information jsonb       NOT NULL DEFAULT '{}'::jsonb,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- Swept like metric_samples rather than accumulating forever. An abandoned
  -- half-built WLAN plan has no value a day later.
  expires_at           timestamptz NOT NULL DEFAULT now() + interval '7 days'
);

-- At most ONE live workflow per session. This is the "resume, do not restart"
-- rule expressed in the schema: a second concurrent task in the same
-- conversation is what produces two half-configured WLANs, so it is made
-- impossible rather than discouraged.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cortex_workflow_active
  ON cortex_workflows (session_id)
  WHERE status NOT IN ('COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED', 'CANCELLED');

CREATE INDEX IF NOT EXISTS idx_cortex_workflows_session
  ON cortex_workflows (session_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_cortex_workflows_sweep
  ON cortex_workflows (expires_at);


CREATE TABLE IF NOT EXISTS cortex_blockers (
  id                   uuid        PRIMARY KEY,
  workflow_id          uuid        NOT NULL
    REFERENCES cortex_workflows (id) ON DELETE CASCADE,

  blocker_type         text        NOT NULL
    CHECK (blocker_type IN (
      'MISSING_REQUIRED_FIELD',
      'AMBIGUOUS_ENTITY',
      'AMBIGUOUS_SCOPE',
      'SAFETY_CONFIRMATION',
      'MISSING_DEPENDENCY',
      'UNKNOWN_NETWORK_STATE',
      'API_UNAVAILABLE',
      'VALIDATION_FAILED',
      'CONFIG_CONFLICT',
      'INSUFFICIENT_PERMISSION',
      'UNSUPPORTED_CAPABILITY',
      'STALE_DATA',
      'DEVICE_UNREACHABLE'
    )),

  -- Why this is blocked, in the words the operator will actually be shown.
  -- "Specify VLAN" is not a reason; "which network should guests use" is.
  reason               text        NOT NULL,

  -- The field name this blocker resolves, e.g. 'security.mode'.
  required_information text,

  -- Real options read off the network, so the operator picks rather than types.
  candidate_values     jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- What Cortex would choose if the operator says "whatever we normally use".
  -- Null where there is no defensible default -- security mode, for instance,
  -- is always a human decision.
  recommended_default  jsonb,

  -- Why the candidates/default are what they are. A recommendation without its
  -- evidence cannot be argued with, so it gets ignored or blindly accepted.
  evidence             jsonb       NOT NULL DEFAULT '[]'::jsonb,

  risk                 text        NOT NULL DEFAULT 'low'
    CHECK (risk IN ('low', 'medium', 'high')),

  -- The five-rung ladder: can the system settle this, or must a human?
  -- Both false means genuinely blocked, which is a legitimate outcome.
  resolvable_by_system boolean     NOT NULL DEFAULT false,
  requires_human       boolean     NOT NULL DEFAULT true,

  status               text        NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'RESOLVED', 'WAIVED', 'FAILED')),

  -- How it was settled AND by whom ('system' | 'human' | 'default'), because
  -- "Cortex assumed this" and "the operator chose this" carry different weight
  -- when the change is reviewed afterwards.
  resolution           jsonb,

  created_at           timestamptz NOT NULL DEFAULT now(),
  resolved_at          timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cortex_blockers_open
  ON cortex_blockers (workflow_id, created_at)
  WHERE status = 'OPEN';

COMMENT ON TABLE cortex_workflows IS
  'Durable Cortex task state. A blocker is unresolved state, not a failure: this is where a half-finished task waits for the one answer it needs, so the operator never restarts. At most one active workflow per session.';

COMMENT ON TABLE cortex_blockers IS
  'One row per thing standing between a Cortex workflow and completion, with the candidates and evidence needed to settle it -- by the system where possible, by a human only for real decisions.';
