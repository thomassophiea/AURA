import { Router, json as expressJson } from 'express';
import { sentinelEngine } from './sentinelEngine.js';
import { getAlertAnalytics } from './sentinelRepository.js';
import { requireRole } from '../identity/identityRouter.js';
import { audit } from '../identity/identityStore.js';

export function createSentinelRouter() {
  const router = Router();
  const jsonBody = expressJson();
  // Mutations need at least operator; reads stay open to any authenticated caller.
  const operator = requireRole('operator');

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

  // GET /sentinel/trends — trend history for all checks
  router.get('/sentinel/trends', (_req, res) => {
    res.json({ trends: sentinelEngine.getAllTrends() });
  });

  // GET /sentinel/trends/:checkId — trend history for a single check
  router.get('/sentinel/trends/:checkId', (req, res) => {
    res.json({ trend: sentinelEngine.getTrend(req.params.checkId) });
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
  router.post('/sentinel/configure', operator, jsonBody, (req, res) => {
    const { authToken, controllerUrl, intervalMs, siteId } = req.body ?? {};
    // Also accept from headers (same pattern as validation engine)
    const token = authToken ?? req.headers['x-controller-auth'] ?? req.headers['authorization'];
    const url = controllerUrl ?? req.headers['x-controller-url'] ?? process.env.CAMPUS_CONTROLLER_URL;

    sentinelEngine.configure({ authToken: token, controllerUrl: url, siteId: siteId ?? null });
    sentinelEngine.startPolling(intervalMs);

    audit('sentinel.schedule', {
      actor: req.auraActor,
      source: req.auraActorSource,
      detail: { intervalMs: intervalMs ?? null, siteId: siteId ?? null },
    });
    res.json({ ok: true, status: sentinelEngine.getStatus() });
  });

  // POST /sentinel/poll — trigger immediate poll
  router.post('/sentinel/poll', operator, jsonBody, async (req, res) => {
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
  router.post('/sentinel/stop', operator, (req, res) => {
    sentinelEngine.stopPolling();
    audit('sentinel.schedule_stop', { actor: req.auraActor, source: req.auraActorSource });
    res.json({ ok: true, status: sentinelEngine.getStatus() });
  });

  // DELETE /sentinel/alerts — clear all alerts
  router.delete('/sentinel/alerts', operator, (req, res) => {
    sentinelEngine.clearAlerts();
    audit('sentinel.clear_alerts', { actor: req.auraActor, source: req.auraActorSource });
    res.json({ cleared: true });
  });

  // POST /sentinel/alerts/:id/ack — acknowledge one alert (body: { by? })
  router.post('/sentinel/alerts/:id/ack', operator, jsonBody, (req, res) => {
    // The acknowledging identity comes from the session, not the client body —
    // "who acked this" must not be spoofable.
    const alert = sentinelEngine.acknowledgeAlert(req.params.id, req.auraActor ?? null);
    if (!alert) return res.status(404).json({ error: 'alert not found' });
    audit('sentinel.ack', {
      actor: req.auraActor,
      source: req.auraActorSource,
      target: alert.target,
      detail: { alertId: alert.id, severity: alert.severity },
    });
    res.json({ alert });
  });

  // DELETE /sentinel/alerts/:id/ack — reverse an acknowledgement
  router.delete('/sentinel/alerts/:id/ack', operator, (req, res) => {
    const alert = sentinelEngine.unacknowledgeAlert(req.params.id);
    if (!alert) return res.status(404).json({ error: 'alert not found' });
    audit('sentinel.unack', {
      actor: req.auraActor,
      source: req.auraActorSource,
      target: alert.target,
      detail: { alertId: alert.id },
    });
    res.json({ alert });
  });

  // GET /sentinel/analytics?days=30 — MTTA/MTTR and alert volume history
  router.get('/sentinel/analytics', async (req, res) => {
    const analytics = await getAlertAnalytics({ days: Number(req.query.days) || 30 }).catch(
      () => null
    );
    if (!analytics) {
      return res.status(503).json({ error: 'alert history persistence unavailable' });
    }
    res.json(analytics);
  });

  // GET /sentinel/webhook — current alert-routing webhook
  router.get('/sentinel/webhook', (_req, res) => {
    res.json({
      url: sentinelEngine.getWebhookUrl(),
      minSeverity: sentinelEngine.getWebhookMinSeverity(),
    });
  });

  // POST /sentinel/webhook — set (body: { url, minSeverity? }) or clear (url: null/empty)
  router.post('/sentinel/webhook', operator, jsonBody, (req, res) => {
    const accepted = sentinelEngine.setWebhookUrl(req.body?.url ?? null, req.body?.minSeverity);
    if (!accepted) return res.status(400).json({ error: 'invalid webhook URL (http/https only)' });
    audit('sentinel.webhook', {
      actor: req.auraActor,
      source: req.auraActorSource,
      detail: { configured: Boolean(sentinelEngine.getWebhookUrl()) },
    });
    res.json({ url: sentinelEngine.getWebhookUrl() });
  });

  // POST /sentinel/webhook/test — send a test event to the configured webhook
  router.post('/sentinel/webhook/test', operator, async (_req, res) => {
    const result = await sentinelEngine.testWebhook();
    res.status(result.ok ? 200 : 502).json(result);
  });

  return router;
}
