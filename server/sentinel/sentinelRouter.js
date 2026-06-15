import { Router, json as expressJson } from 'express';
import { sentinelEngine } from './sentinelEngine.js';

export function createSentinelRouter() {
  const router = Router();
  const jsonBody = expressJson();

  // GET /sentinel/status — engine status + per-check health
  router.get('/sentinel/status', (_req, res) => {
    res.json(sentinelEngine.getStatus());
  });

  // GET /sentinel/alerts — active alerts (filter: ?severity=critical&check=vlan_trunk)
  router.get('/sentinel/alerts', (req, res) => {
    const { severity, check } = req.query;
    res.json({ alerts: sentinelEngine.getAlerts({ severity, check }) });
  });

  // GET /sentinel/alerts/all — active + recently resolved
  router.get('/sentinel/alerts/all', (req, res) => {
    const { severity, check } = req.query;
    res.json({ alerts: sentinelEngine.getAllAlerts({ severity, check }) });
  });

  // GET /sentinel/evidence/:checkId — detailed evidence from last run of a check
  router.get('/sentinel/evidence/:checkId', (req, res) => {
    const evidence = sentinelEngine.getEvidence(req.params.checkId);
    if (!evidence) {
      return res.json({ evidence: null, message: 'No evidence available. Run a poll first.' });
    }
    res.json({ evidence });
  });

  // GET /sentinel/evidence — all check evidence
  router.get('/sentinel/evidence', (_req, res) => {
    res.json({ evidence: sentinelEngine.getEvidence() });
  });

  // POST /sentinel/configure — set auth token + controller URL, start polling
  router.post('/sentinel/configure', jsonBody, (req, res) => {
    const { authToken, controllerUrl, intervalMs, siteId } = req.body ?? {};
    // Also accept from headers (same pattern as validation engine)
    const token = authToken ?? req.headers['x-controller-auth'] ?? req.headers['authorization'];
    const url = controllerUrl ?? req.headers['x-controller-url'] ?? process.env.CAMPUS_CONTROLLER_URL;

    sentinelEngine.configure({ authToken: token, controllerUrl: url, siteId: siteId ?? null });
    sentinelEngine.startPolling(intervalMs);

    res.json({ ok: true, status: sentinelEngine.getStatus() });
  });

  // POST /sentinel/poll — trigger immediate poll
  router.post('/sentinel/poll', jsonBody, async (req, res) => {
    // Accept auth from headers if not already configured
    const token = req.headers['x-controller-auth'] ?? req.headers['authorization'];
    const url = req.headers['x-controller-url'] ?? process.env.CAMPUS_CONTROLLER_URL;
    const { siteId } = req.body ?? {};
    if (token || url || siteId) {
      sentinelEngine.configure({ authToken: token, controllerUrl: url, siteId: siteId ?? undefined });
    }

    const results = await sentinelEngine.poll();
    res.json({ results, status: sentinelEngine.getStatus() });
  });

  // POST /sentinel/stop — stop background polling
  router.post('/sentinel/stop', (_req, res) => {
    sentinelEngine.stopPolling();
    res.json({ ok: true, status: sentinelEngine.getStatus() });
  });

  // DELETE /sentinel/alerts — clear all alerts
  router.delete('/sentinel/alerts', (_req, res) => {
    sentinelEngine.clearAlerts();
    res.json({ cleared: true });
  });

  return router;
}
