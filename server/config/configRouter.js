/**
 * Configuration history API: snapshots, point-in-time diffs, on-demand
 * capture, export, restore, and the compliance score trend.
 */

import { Router, json as expressJson } from 'express';
import {
  listSnapshots,
  getSnapshot,
  takeSnapshot,
  diffSections,
  recordCompliance,
  getComplianceHistory,
  captureCurrentSections,
  computeRestorePlan,
  itemName,
  RESTORE_WRITE_SUPPORT,
  SNAPSHOT_SECTIONS,
} from './configSnapshotService.js';
import { requireRole } from '../identity/identityRouter.js';
import { audit } from '../identity/identityStore.js';

const SECTION_PATH = new Map(SNAPSHOT_SECTIONS.map((s) => [s.key, s.path]));

/**
 * Apply one restore plan against the live controller through `session`.
 * Never aborts on one item's failure — every item gets its own result.
 * A write is only attempted when RESTORE_WRITE_SUPPORT confirms the verb;
 * otherwise the item is reported skipped, never silently dropped.
 */
async function applyRestorePlan(session, plan) {
  const results = [];

  const run = async (section, op, item, verb, path, body) => {
    const support = RESTORE_WRITE_SUPPORT[section];
    if (!support?.[op] || !path || (op !== 'create' && !item?.id)) {
      results.push({
        section,
        name: itemName(item),
        op,
        ok: false,
        skipped: 'restore not supported for this section',
      });
      return;
    }
    const result = await session.write(path, { method: verb, body });
    results.push({
      section,
      name: itemName(item),
      op,
      ok: result.ok,
      ...(result.ok ? {} : { error: result.errorSummary ?? `HTTP ${result.status ?? '?'}` }),
    });
  };

  for (const sectionPlan of plan) {
    const collectionPath = SECTION_PATH.get(sectionPlan.section);
    for (const item of sectionPlan.items.create) {
      const { id: _id, ...createBody } = item ?? {};
      await run(sectionPlan.section, 'create', item, 'POST', collectionPath, createBody);
    }
    for (const item of sectionPlan.items.update) {
      const path = collectionPath && item?.id ? `${collectionPath}/${encodeURIComponent(item.id)}` : null;
      await run(sectionPlan.section, 'update', item, 'PUT', path, item);
    }
    for (const item of sectionPlan.items.delete) {
      const path = collectionPath && item?.id ? `${collectionPath}/${encodeURIComponent(item.id)}` : null;
      await run(sectionPlan.section, 'delete', item, 'DELETE', path, null);
    }
  }
  return results;
}

function summarizeApplied(applied) {
  const summary = { created: 0, updated: 0, deleted: 0, failed: 0, skipped: 0 };
  for (const r of applied) {
    if (r.skipped) summary.skipped += 1;
    else if (!r.ok) summary.failed += 1;
    else if (r.op === 'create') summary.created += 1;
    else if (r.op === 'update') summary.updated += 1;
    else if (r.op === 'delete') summary.deleted += 1;
  }
  return summary;
}

export function createConfigRouter({ sessionFactory }) {
  const router = Router();
  const viewer = requireRole('viewer');
  const operator = requireRole('operator');
  const admin = requireRole('admin');
  const jsonBody = expressJson({ limit: '256kb' });

  // GET /config/snapshots — newest first
  router.get('/config/snapshots', viewer, async (req, res) => {
    res.json({ snapshots: await listSnapshots({ limit: Number(req.query.limit) || 30 }) });
  });

  // POST /config/snapshots — capture now
  router.post('/config/snapshots', operator, async (req, res) => {
    const session = sessionFactory();
    if (!session) {
      return res.status(503).json({
        error: 'No service account configured — set CAMPUS_CONTROLLER_USER/_PASSWORD.',
      });
    }
    const result = await takeSnapshot(session, { kind: 'manual', takenBy: req.auraActor });
    if (!result.ok) return res.status(502).json({ error: result.error });
    audit('config.snapshot', { actor: req.auraActor, source: req.auraActorSource });
    // Refresh the compliance trend at the same moment, best-effort.
    recordCompliance(session).catch(() => undefined);
    res.json(result);
  });

  // GET /config/snapshots/:id — full snapshot (also the export payload)
  router.get('/config/snapshots/:id', viewer, async (req, res) => {
    const snapshot = await getSnapshot(Number(req.params.id));
    if (!snapshot) return res.status(404).json({ error: 'snapshot not found' });
    res.json({ snapshot });
  });

  // GET /config/diff?from=ID&to=ID — what changed between two snapshots
  router.get('/config/diff', viewer, async (req, res) => {
    const fromId = Number(req.query.from);
    const toId = Number(req.query.to);
    if (!fromId || !toId) return res.status(400).json({ error: 'from and to ids are required' });
    const [from, to] = await Promise.all([getSnapshot(fromId), getSnapshot(toId)]);
    if (!from || !to) return res.status(404).json({ error: 'snapshot not found' });
    res.json({
      from: { id: from.id, takenAt: from.takenAt },
      to: { id: to.id, takenAt: to.takenAt },
      sections: diffSections(from.sections, to.sections),
    });
  });

  // GET /config/compliance/history?days=90
  router.get('/config/compliance/history', viewer, async (req, res) => {
    res.json({ history: await getComplianceHistory({ days: Number(req.query.days) || 90 }) });
  });

  // GET /config/restore/status — is applying a restore allowed on this deployment?
  router.get('/config/restore/status', viewer, (_req, res) => {
    res.json({ enabled: process.env.CONFIG_RESTORE_ENABLED === 'true' });
  });

  // POST /config/restore — dry run by default; apply only with a matching
  // confirm token AND CONFIG_RESTORE_ENABLED=true. Never writes to the
  // controller otherwise.
  router.post('/config/restore', admin, jsonBody, async (req, res) => {
    const { snapshotId, sections, confirm } = req.body ?? {};
    const id = Number(snapshotId);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'snapshotId is required' });
    }
    if (sections !== undefined && !Array.isArray(sections)) {
      return res.status(400).json({ error: 'sections must be an array of section keys' });
    }

    const target = await getSnapshot(id);
    if (!target) return res.status(404).json({ error: 'snapshot not found' });

    const session = sessionFactory();
    if (!session) {
      return res.status(503).json({
        error: 'No service account configured — set CAMPUS_CONTROLLER_USER/_PASSWORD.',
      });
    }

    const { sections: currentSections, failures } = await captureCurrentSections(session);
    if (Object.keys(currentSections).length === 0) {
      return res
        .status(502)
        .json({ error: `could not capture current configuration: ${failures.join(', ')}` });
    }

    const plan = computeRestorePlan(currentSections, target.sections, { sections });

    const confirmed = confirm !== undefined && confirm !== null && String(confirm) === String(snapshotId);
    if (!confirmed) {
      return res.json({ dryRun: true, plan });
    }

    if (process.env.CONFIG_RESTORE_ENABLED !== 'true') {
      return res.status(403).json({
        error: 'Config restore is disabled. Set CONFIG_RESTORE_ENABLED=true to allow applying.',
        plan,
      });
    }

    const applied = await applyRestorePlan(session, plan);
    audit('config.restore', {
      actor: req.auraActor,
      source: req.auraActorSource,
      target: String(id),
      detail: { sections: sections ?? 'all', summary: summarizeApplied(applied) },
    });
    res.json({ dryRun: false, applied, plan });
  });

  return router;
}
