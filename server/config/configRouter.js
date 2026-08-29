/**
 * Configuration history API: snapshots, point-in-time diffs, on-demand
 * capture, export, and the compliance score trend.
 */

import { Router } from 'express';
import {
  listSnapshots,
  getSnapshot,
  takeSnapshot,
  diffSections,
  recordCompliance,
  getComplianceHistory,
} from './configSnapshotService.js';
import { requireRole } from '../identity/identityRouter.js';
import { audit } from '../identity/identityStore.js';

export function createConfigRouter({ sessionFactory }) {
  const router = Router();
  const viewer = requireRole('viewer');
  const operator = requireRole('operator');

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

  return router;
}
