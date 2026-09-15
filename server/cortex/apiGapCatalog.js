/**
 * The API gap catalogue.
 *
 * WHY THIS IS NOT A LOG LINE
 * --------------------------
 * When Cortex cannot answer something, it says so politely and correctly:
 * "I can't prove that with the telemetry currently available." That is the
 * behaviour the doctrine demands, and it is also completely invisible. Nothing
 * upstream counts a polite refusal. No error is raised, no alert fires, and the
 * only record is one sentence in one operator's chat window.
 *
 * So the product question —
 *
 *   "What are customers asking that we cannot currently answer?"
 *
 * — has no data source at all unless refusals are deliberately recorded. This
 * module is that source.
 *
 * WHAT IS STORED, AND WHAT DELIBERATELY IS NOT
 * --------------------------------------------
 * The question is reduced to a SHAPE before it is written: MAC addresses, IPs,
 * hostnames, usernames, SSIDs and site names are replaced with placeholders.
 * The catalogue is read by product management to prioritise API work, and it
 * must not become a second, unaudited copy of who was on the network. The
 * normalisation is also what makes the hit counter meaningful — four hundred
 * operators asking the same question about four hundred different clients is
 * ONE gap worth four hundred, not four hundred gaps.
 *
 * AVAILABILITY
 * ------------
 * Recording a gap must never fail a question. Every write is best-effort: with
 * no database configured the catalogue degrades to an in-process ring buffer,
 * which is enough for a dev box and for the report route to return something
 * true about this process.
 */

import { isDatabaseConfigured, query } from '../db/pool.js';

/** How many gaps the in-memory fallback keeps before discarding the oldest. */
const MEMORY_LIMIT = 500;

/** @type {Map<string, object>} */
const memory = new Map();

export const GAP_KIND = {
  CAPABILITY: 'capability',
  ENDPOINT: 'endpoint',
  FIELD: 'field',
  TELEMETRY: 'telemetry',
  RETENTION: 'retention',
  UNROUTED: 'unrouted',
};

/**
 * Reduce a question to a shape.
 *
 * Order matters: the IP pattern runs before the MAC pattern for the same reason
 * `clientResolver` resolves IPs first — 192.168.100.122 strips to twelve hex
 * digits and is a structurally valid MAC.
 */
export function normaliseQuestion(question, { entityNames = [] } = {}) {
  let text = String(question ?? '').trim();
  if (!text) return '';

  // Known entity names first, while they are still surrounded by their original
  // punctuation. Longest first so "AURA_LAB_2" is not half-replaced by
  // "AURA_LAB".
  const names = [...entityNames].filter(Boolean).sort((a, b) => String(b).length - String(a).length);
  for (const name of names) {
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(escaped, 'gi'), '<entity>');
  }

  text = text
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '<ip>')
    .replace(/\b(?:[0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}\b/g, '<mac>')
    .replace(/\b[A-Z]{2}\d{6,9}[A-Z]?-?[A-Z0-9]{4,8}\b/g, '<serial>')
    // Anything quoted is a name the operator typed: a site, an SSID, a person.
    .replace(/["'][^"']{1,64}["']/g, '<name>')
    // Bare numbers that are not part of a placeholder: VLAN ids, channel
    // numbers, times. Keeps "VLAN <n>" comparable across questions.
    .replace(/\b\d{1,5}\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  return text.slice(0, 300);
}

/**
 * @typedef {object} GapRecord
 * @property {string} controllerKey
 * @property {string} capabilityKey
 * @property {string} question
 * @property {string} [evidenceRequired]
 * @property {string} [availableInstead]
 * @property {string} [impact]
 * @property {string} [gapKind]
 * @property {string[]} [entityNames]  names to scrub out of the question
 */

/**
 * Record one gap. Best-effort by contract: returns a result, never throws.
 *
 * @param {GapRecord} gap
 * @returns {Promise<{recorded: boolean, store: 'db'|'memory'|'none', reason?: string}>}
 */
export async function recordGap(gap) {
  const shape = normaliseQuestion(gap?.question, { entityNames: gap?.entityNames ?? [] });
  const capabilityKey = String(gap?.capabilityKey ?? '').trim();
  const controllerKey = String(gap?.controllerKey ?? 'unknown').trim() || 'unknown';

  if (!capabilityKey || !shape) {
    return { recorded: false, store: 'none', reason: 'a gap needs both a capability key and a question' };
  }

  const row = {
    controllerKey,
    capabilityKey,
    questionShape: shape,
    evidenceRequired: gap.evidenceRequired ?? null,
    availableInstead: gap.availableInstead ?? null,
    impact: gap.impact ?? null,
    gapKind: gap.gapKind ?? GAP_KIND.CAPABILITY,
  };

  if (isDatabaseConfigured()) {
    try {
      await query(
        `INSERT INTO cortex_api_gaps
           (controller_key, capability_key, question_shape, evidence_required,
            available_instead, impact, gap_kind)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (controller_key, capability_key, question_shape)
           WHERE resolved_at IS NULL
         DO UPDATE SET hits = cortex_api_gaps.hits + 1,
                       last_seen_at = now(),
                       -- Keep the first non-null explanation rather than letting
                       -- a later, thinner record overwrite a good one.
                       evidence_required = COALESCE(cortex_api_gaps.evidence_required, EXCLUDED.evidence_required),
                       available_instead = COALESCE(cortex_api_gaps.available_instead, EXCLUDED.available_instead),
                       impact            = COALESCE(cortex_api_gaps.impact, EXCLUDED.impact)`,
        [
          row.controllerKey,
          row.capabilityKey,
          row.questionShape,
          row.evidenceRequired,
          row.availableInstead,
          row.impact,
          row.gapKind,
        ]
      );
      return { recorded: true, store: 'db' };
    } catch (err) {
      // Fall through to memory. A catalogue write must never be the reason an
      // operator does not get an answer.
      console.warn('[Cortex] api gap write failed, using in-memory catalogue:', err.message);
    }
  }

  const key = `${row.controllerKey}|${row.capabilityKey}|${row.questionShape}`;
  const existing = memory.get(key);
  if (existing) {
    existing.hits += 1;
    existing.lastSeenAt = new Date().toISOString();
  } else {
    if (memory.size >= MEMORY_LIMIT) memory.delete(memory.keys().next().value);
    memory.set(key, {
      ...row,
      hits: 1,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    });
  }
  return { recorded: true, store: 'memory' };
}

/**
 * Record every capability gap an investigation actually ran into.
 *
 * Driven from the evidence ledger, so only gaps that were REACHED are recorded.
 * Writing every unusable capability on every question would make the catalogue
 * a copy of the capability registry and tell nobody anything about demand.
 */
export async function recordGapsFromInvestigation({
  question,
  ledger = [],
  controllerKey,
  capabilities = null,
  entityNames = [],
}) {
  const hit = new Set();
  for (const entry of ledger) {
    const digest = entry?.digest;
    if (digest?.unavailable) hit.add(digest.capabilityKey ?? `tool:${entry.tool}`);
  }

  const results = [];
  for (const capabilityKey of hit) {
    results.push(
      await recordGap({
        controllerKey,
        capabilityKey,
        question,
        entityNames,
        gapKind: GAP_KIND.CAPABILITY,
        evidenceRequired: capabilities?.explainGap?.(capabilityKey) ?? null,
        impact: 'An investigation reached for this and the platform could not supply it.',
      })
    );
  }
  return results;
}

/**
 * The report: what is costing us the most answers.
 *
 * @returns {Promise<{store:string, gaps:object[], total:number}>}
 */
export async function gapReport({ limit = 50, controllerKey = null } = {}) {
  if (isDatabaseConfigured()) {
    try {
      const params = [Math.min(Math.max(Number(limit) || 50, 1), 500)];
      let where = 'WHERE resolved_at IS NULL';
      if (controllerKey) {
        params.push(controllerKey);
        where += ` AND controller_key = $${params.length}`;
      }
      const res = await query(
        `SELECT capability_key, question_shape, gap_kind, evidence_required,
                available_instead, impact, hits, first_seen_at, last_seen_at,
                controller_key
           FROM cortex_api_gaps
           ${where}
           ORDER BY hits DESC, last_seen_at DESC
           LIMIT $1`,
        params
      );
      return {
        store: 'db',
        total: res.rows.length,
        gaps: res.rows.map((r) => ({
          capabilityKey: r.capability_key,
          questionShape: r.question_shape,
          gapKind: r.gap_kind,
          evidenceRequired: r.evidence_required,
          availableInstead: r.available_instead,
          impact: r.impact,
          hits: r.hits,
          firstSeenAt: r.first_seen_at,
          lastSeenAt: r.last_seen_at,
          controllerKey: r.controller_key,
        })),
      };
    } catch (err) {
      console.warn('[Cortex] api gap report failed, falling back to memory:', err.message);
    }
  }

  const gaps = [...memory.values()]
    .filter((g) => !controllerKey || g.controllerKey === controllerKey)
    .sort((a, b) => b.hits - a.hits || String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)))
    .slice(0, limit);
  return {
    store: 'memory',
    total: gaps.length,
    gaps,
    note:
      'No database is configured, so this catalogue covers only the current process and is ' +
      'lost on restart. It is not a record of what customers have asked over time.',
  };
}

/** Test seam. */
export function clearMemoryCatalogue() {
  memory.clear();
}
