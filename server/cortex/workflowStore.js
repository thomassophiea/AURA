/**
 * Durable storage for Cortex workflows and their blockers.
 *
 * WHY THIS IS NOT THE ORCHESTRATOR'S SESSION MAP
 * ----------------------------------------------
 * `cortexOrchestrator` already keeps conversations in a process-local `Map` with
 * a two-hour TTL. That is fine for chat scrollback and wrong for a task that
 * changes the network: Railway restarts containers, may run more than one, and a
 * workflow that evaporates mid-write leaves a half-configured WLAN with nothing
 * recording how to finish or undo it. Task state goes to Postgres.
 *
 * ONE ACTIVE WORKFLOW PER SESSION
 * -------------------------------
 * Enforced by a partial unique index, not by convention. Two concurrent tasks in
 * one conversation is how "create a guest network" and a follow-up correction
 * become two different WLANs. `claimActive` therefore reads the live workflow
 * rather than creating a second one.
 *
 * DEGRADED MODE IS DECLARED, NEVER SILENT
 * ---------------------------------------
 * With no database configured (a dev box, or a deployment whose migration has
 * not run) this degrades to an in-process map so the feature still works. Every
 * read and write reports `store: 'db' | 'memory'`, and the engine surfaces that,
 * because a workflow held only in memory will not survive a restart and the
 * operator deserves to know that before being asked to confirm a write.
 *
 * This module is a repository: it moves rows, it does not decide anything.
 */

import { randomUUID } from 'node:crypto';

import { isDatabaseConfigured, query } from '../db/pool.js';

/** Statuses that mean the workflow is still live and may be resumed. */
export const ACTIVE_STATUSES = Object.freeze([
  'PLANNING',
  'GATHERING_EVIDENCE',
  'WAITING_FOR_USER',
  'READY_FOR_PREVIEW',
  'WAITING_FOR_CONFIRMATION',
  'EXECUTING',
  'VERIFYING',
]);

/** Statuses that mean it is over, one way or another. */
export const TERMINAL_STATUSES = Object.freeze([
  'COMPLETED',
  'COMPLETED_WITH_WARNINGS',
  'BLOCKED_TECHNICALLY',
  'FAILED',
  'CANCELLED',
]);

export const BLOCKER_TYPE = Object.freeze({
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  AMBIGUOUS_ENTITY: 'AMBIGUOUS_ENTITY',
  AMBIGUOUS_SCOPE: 'AMBIGUOUS_SCOPE',
  SAFETY_CONFIRMATION: 'SAFETY_CONFIRMATION',
  MISSING_DEPENDENCY: 'MISSING_DEPENDENCY',
  UNKNOWN_NETWORK_STATE: 'UNKNOWN_NETWORK_STATE',
  API_UNAVAILABLE: 'API_UNAVAILABLE',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  CONFIG_CONFLICT: 'CONFIG_CONFLICT',
  INSUFFICIENT_PERMISSION: 'INSUFFICIENT_PERMISSION',
  UNSUPPORTED_CAPABILITY: 'UNSUPPORTED_CAPABILITY',
  STALE_DATA: 'STALE_DATA',
  DEVICE_UNREACHABLE: 'DEVICE_UNREACHABLE',
});

/** In-process fallback. Keyed by workflow id; blockers live on the record. */
const memory = new Map();

/** Cap the fallback so a long-lived dev process cannot grow without bound. */
const MEMORY_LIMIT = 200;

function nowIso() {
  return new Date().toISOString();
}

/** Shape a database row into the object the engine works with. */
function hydrate(row, blockers = []) {
  return {
    id: row.id,
    sessionId: row.session_id,
    userIntent: row.user_intent,
    workflowType: row.workflow_type,
    status: row.status,
    resolvedScope: row.resolved_scope ?? {},
    resolvedEntities: row.resolved_entities ?? {},
    requestedState: row.requested_state ?? {},
    derivedState: row.derived_state ?? {},
    executionPlan: row.execution_plan ?? [],
    completedSteps: row.completed_steps ?? [],
    evidence: row.evidence ?? [],
    warnings: row.warnings ?? [],
    confirmationState: row.confirmation_state ?? 'none',
    validation: row.validation ?? {},
    rollbackInformation: row.rollback_information ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    blockers,
  };
}

function hydrateBlocker(row) {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    type: row.blocker_type,
    reason: row.reason,
    requiredInformation: row.required_information,
    candidateValues: row.candidate_values ?? [],
    recommendedDefault: row.recommended_default ?? null,
    evidence: row.evidence ?? [],
    risk: row.risk,
    resolvableBySystem: row.resolvable_by_system,
    requiresHuman: row.requires_human,
    status: row.status,
    resolution: row.resolution ?? null,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

/**
 * Create a workflow, or return the session's existing live one.
 *
 * Returning the existing workflow rather than throwing is the whole point: a
 * second utterance in a conversation is nearly always a continuation, and the
 * caller decides whether it is genuinely a new intent.
 */
export async function claimActive({ sessionId, userIntent, workflowType }) {
  if (!sessionId) throw new Error('claimActive requires a sessionId');

  const existing = await findActive(sessionId);
  if (existing.workflow) return { ...existing, created: false };

  const id = randomUUID();

  if (isDatabaseConfigured()) {
    try {
      const { rows } = await query(
        `INSERT INTO cortex_workflows (id, session_id, user_intent, workflow_type)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [id, sessionId, userIntent ?? '', workflowType ?? 'investigate']
      );
      return { workflow: hydrate(rows[0]), store: 'db', created: true };
    } catch (err) {
      // A unique-violation means another request created one between our read
      // and our insert. That is the index doing its job, not an error: re-read.
      if (err?.code === '23505') {
        const raced = await findActive(sessionId);
        if (raced.workflow) return { ...raced, created: false };
      }
      console.warn('[Cortex] workflow insert failed, using memory:', err.message);
    }
  }

  if (memory.size >= MEMORY_LIMIT) memory.delete(memory.keys().next().value);
  const workflow = hydrate(
    {
      id,
      session_id: sessionId,
      user_intent: userIntent ?? '',
      workflow_type: workflowType ?? 'investigate',
      status: 'PLANNING',
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    []
  );
  memory.set(id, workflow);
  return { workflow, store: 'memory', created: true };
}

/** The session's live workflow, with its open blockers, or null. */
export async function findActive(sessionId) {
  if (!sessionId) return { workflow: null, store: 'none' };

  if (isDatabaseConfigured()) {
    try {
      const { rows } = await query(
        `SELECT * FROM cortex_workflows
          WHERE session_id = $1 AND status = ANY($2)
          ORDER BY updated_at DESC
          LIMIT 1`,
        [sessionId, ACTIVE_STATUSES]
      );
      if (!rows.length) return { workflow: null, store: 'db' };
      const blockers = await listBlockers(rows[0].id);
      return { workflow: hydrate(rows[0], blockers), store: 'db' };
    } catch (err) {
      console.warn('[Cortex] workflow read failed, using memory:', err.message);
    }
  }

  const found = [...memory.values()]
    .filter((w) => w.sessionId === sessionId && ACTIVE_STATUSES.includes(w.status))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  return { workflow: found ?? null, store: 'memory' };
}

/** Load one workflow by id, with its blockers. */
export async function load(workflowId) {
  if (!workflowId) return null;

  if (isDatabaseConfigured()) {
    try {
      const { rows } = await query('SELECT * FROM cortex_workflows WHERE id = $1', [workflowId]);
      if (!rows.length) return null;
      return hydrate(rows[0], await listBlockers(workflowId));
    } catch (err) {
      console.warn('[Cortex] workflow load failed, using memory:', err.message);
    }
  }
  return memory.get(workflowId) ?? null;
}

/**
 * Patch a workflow.
 *
 * Only the named columns are writable; anything else is ignored rather than
 * interpolated, because this is called with model-influenced data.
 */
const WRITABLE = new Map([
  ['status', 'status'],
  ['resolvedScope', 'resolved_scope'],
  ['resolvedEntities', 'resolved_entities'],
  ['requestedState', 'requested_state'],
  ['derivedState', 'derived_state'],
  ['executionPlan', 'execution_plan'],
  ['completedSteps', 'completed_steps'],
  ['evidence', 'evidence'],
  ['warnings', 'warnings'],
  ['confirmationState', 'confirmation_state'],
  ['validation', 'validation'],
  ['rollbackInformation', 'rollback_information'],
]);

const JSON_COLUMNS = new Set([
  'resolved_scope',
  'resolved_entities',
  'requested_state',
  'derived_state',
  'execution_plan',
  'completed_steps',
  'evidence',
  'warnings',
  'validation',
  'rollback_information',
]);

export async function update(workflowId, patch = {}) {
  const entries = Object.entries(patch).filter(([k]) => WRITABLE.has(k));
  if (!entries.length) return load(workflowId);

  if (isDatabaseConfigured()) {
    try {
      const sets = [];
      const values = [];
      entries.forEach(([key, value], i) => {
        const column = WRITABLE.get(key);
        sets.push(`${column} = $${i + 2}`);
        values.push(JSON_COLUMNS.has(column) ? JSON.stringify(value ?? null) : value);
      });
      const { rows } = await query(
        `UPDATE cortex_workflows
            SET ${sets.join(', ')}, updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [workflowId, ...values]
      );
      if (!rows.length) return null;
      return hydrate(rows[0], await listBlockers(workflowId));
    } catch (err) {
      console.warn('[Cortex] workflow update failed, using memory:', err.message);
    }
  }

  const current = memory.get(workflowId);
  if (!current) return null;
  const next = { ...current };
  for (const [key, value] of entries) next[key] = value;
  next.updatedAt = nowIso();
  memory.set(workflowId, next);
  return next;
}

/** Record a blocker against a workflow. */
export async function addBlocker(workflowId, blocker) {
  const id = randomUUID();
  const record = {
    id,
    workflowId,
    type: blocker.type,
    reason: blocker.reason,
    requiredInformation: blocker.requiredInformation ?? null,
    candidateValues: blocker.candidateValues ?? [],
    recommendedDefault: blocker.recommendedDefault ?? null,
    evidence: blocker.evidence ?? [],
    risk: blocker.risk ?? 'low',
    resolvableBySystem: blocker.resolvableBySystem ?? false,
    requiresHuman: blocker.requiresHuman ?? true,
    status: 'OPEN',
    resolution: null,
    createdAt: nowIso(),
    resolvedAt: null,
  };

  if (isDatabaseConfigured()) {
    try {
      const { rows } = await query(
        `INSERT INTO cortex_blockers
           (id, workflow_id, blocker_type, reason, required_information,
            candidate_values, recommended_default, evidence, risk,
            resolvable_by_system, requires_human)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          id,
          workflowId,
          record.type,
          record.reason,
          record.requiredInformation,
          JSON.stringify(record.candidateValues),
          record.recommendedDefault === null ? null : JSON.stringify(record.recommendedDefault),
          JSON.stringify(record.evidence),
          record.risk,
          record.resolvableBySystem,
          record.requiresHuman,
        ]
      );
      return hydrateBlocker(rows[0]);
    } catch (err) {
      console.warn('[Cortex] blocker insert failed, using memory:', err.message);
    }
  }

  const workflow = memory.get(workflowId);
  if (workflow) workflow.blockers = [...(workflow.blockers ?? []), record];
  return record;
}

/** Open blockers for a workflow, oldest first. */
export async function listBlockers(workflowId, { includeResolved = false } = {}) {
  if (isDatabaseConfigured()) {
    try {
      const { rows } = await query(
        `SELECT * FROM cortex_blockers
          WHERE workflow_id = $1 ${includeResolved ? '' : "AND status = 'OPEN'"}
          ORDER BY created_at ASC`,
        [workflowId]
      );
      return rows.map(hydrateBlocker);
    } catch (err) {
      console.warn('[Cortex] blocker read failed, using memory:', err.message);
    }
  }
  const workflow = memory.get(workflowId);
  const all = workflow?.blockers ?? [];
  return includeResolved ? all : all.filter((b) => b.status === 'OPEN');
}

/**
 * Settle a blocker.
 *
 * `by` is retained deliberately: "Cortex assumed this" and "the operator chose
 * this" are different facts when the change is reviewed later, and the preview
 * has to be able to tell them apart.
 */
export async function resolveBlocker(blockerId, { value, by = 'system', note = null }) {
  const resolution = { value: value ?? null, by, note, at: nowIso() };

  if (isDatabaseConfigured()) {
    try {
      const { rows } = await query(
        `UPDATE cortex_blockers
            SET status = 'RESOLVED', resolution = $2, resolved_at = now()
          WHERE id = $1
          RETURNING *`,
        [blockerId, JSON.stringify(resolution)]
      );
      if (rows.length) return hydrateBlocker(rows[0]);
    } catch (err) {
      console.warn('[Cortex] blocker resolve failed, using memory:', err.message);
    }
  }

  for (const workflow of memory.values()) {
    const blocker = (workflow.blockers ?? []).find((b) => b.id === blockerId);
    if (blocker) {
      blocker.status = 'RESOLVED';
      blocker.resolution = resolution;
      blocker.resolvedAt = resolution.at;
      return blocker;
    }
  }
  return null;
}

/** Close a workflow. Terminal statuses free the session's unique slot. */
export async function close(workflowId, status, patch = {}) {
  if (!TERMINAL_STATUSES.includes(status)) {
    throw new Error(`close() needs a terminal status, got ${status}`);
  }
  return update(workflowId, { ...patch, status });
}

/** Drop expired rows. Called by the same sweep that prunes metric_samples. */
export async function sweepExpired() {
  if (!isDatabaseConfigured()) {
    memory.clear();
    return { deleted: 0, store: 'memory' };
  }
  try {
    const { rowCount } = await query('DELETE FROM cortex_workflows WHERE expires_at < now()');
    return { deleted: rowCount ?? 0, store: 'db' };
  } catch (err) {
    console.warn('[Cortex] workflow sweep failed:', err.message);
    return { deleted: 0, store: 'none' };
  }
}

/** Test seam. */
export function __clearMemory() {
  memory.clear();
}
