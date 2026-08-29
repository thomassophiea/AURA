import { AlertStore } from './alertStore.js';
import * as repo from './sentinelRepository.js';
import { getServiceSession } from './sentinelServiceAuth.js';
import { dispatchWebhook, buildAlertPayload, isValidWebhookUrl } from './sentinelWebhook.js';
import { runRadiusReachabilityCheck } from './checks/radiusReachabilityCheck.js';
import { runDhcpReachabilityCheck } from './checks/dhcpReachabilityCheck.js';
import { runClientDhcpFailureCheck } from './checks/clientDhcpFailureCheck.js';
import { runVlanTrunkCheck } from './checks/vlanTrunkCheck.js';
import { runDnsReachabilityCheck } from './checks/dnsReachabilityCheck.js';
import { runCertExpiryCheck } from './checks/certExpiryCheck.js';
import { runFirmwareConsistencyCheck } from './checks/firmwareConsistencyCheck.js';
import { runApStatusCheck } from './checks/apStatusCheck.js';

const DEFAULT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const MAX_TREND_POINTS = 100;

export class SentinelEngine {
  #alertStore = new AlertStore();
  #authToken = null;
  #controllerUrl = null;
  #siteId = null;
  #fetchFn = null;
  #timer = null;
  #intervalMs = null;
  // A schedule restored from Postgres (or suspended by auth expiry) that
  // resumes as soon as fresh controller auth arrives via configure().
  #pendingIntervalMs = null;
  #webhookUrl = process.env.SENTINEL_WEBHOOK_URL ?? null;
  // Minimum severity routed to the webhook ('warning' routes both, 'critical'
  // routes criticals only).
  #webhookMinSeverity = 'warning';
  #authExpired = false;
  #lastPollAt = null;
  #polling = false;
  #trendStore = {};
  #checkStatus = {
    vlan_trunk: { status: 'idle', lastRunAt: null, error: null },
    dhcp_reachability: { status: 'idle', lastRunAt: null, error: null },
    radius_reachability: { status: 'idle', lastRunAt: null, error: null },
    client_dhcp_failure: { status: 'idle', lastRunAt: null, error: null },
    dns_reachability: { status: 'idle', lastRunAt: null, error: null },
    cert_expiry: { status: 'idle', lastRunAt: null, error: null },
    firmware_consistency: { status: 'idle', lastRunAt: null, error: null },
    ap_status: { status: 'idle', lastRunAt: null, error: null },
  };
  #checkEvidence = {};

  configure({ authToken, controllerUrl, siteId, fetchFn } = {}) {
    if (authToken) this.#authToken = authToken;
    if (controllerUrl) this.#controllerUrl = controllerUrl;
    if (siteId !== undefined) this.#siteId = siteId || null;
    if (fetchFn) this.#fetchFn = fetchFn;
    this.#authExpired = false;

    // Resume a persisted/suspended schedule the moment auth is available
    // again. Not immediate: the request that carried the auth usually follows
    // with its own poll, which must not collide with a timer-fired one.
    if (this.#pendingIntervalMs && this.#authToken && this.#controllerUrl && !this.#timer) {
      this.startPolling(this.#pendingIntervalMs, { immediate: false });
    }
  }

  /**
   * Restore persisted state (alerts, trends, schedule) at boot. Returns true
   * when something was restored. Safe without a database — resolves false.
   */
  async hydrate() {
    const state = await repo.loadSentinelState();
    if (!state) return false;
    this.#alertStore.seed(state.alerts);
    for (const [check, entries] of Object.entries(state.trends)) {
      this.#trendStore[check] = entries;
    }
    if (state.config?.webhookUrl) this.#webhookUrl = state.config.webhookUrl;
    if (state.config?.webhookMinSeverity) {
      this.#webhookMinSeverity = state.config.webhookMinSeverity;
    }
    if (state.config?.intervalMs) {
      this.#pendingIntervalMs = state.config.intervalMs;
      if (state.config.siteId) this.#siteId = state.config.siteId;

      // With a service account the schedule needs nobody's browser: adopt the
      // deployment's controller and start polling right away. Without one it
      // stays pending until a request arrives carrying auth.
      this.#controllerUrl ??= process.env.CAMPUS_CONTROLLER_URL ?? null;
      if (this.#controllerUrl && getServiceSession(this.#controllerUrl)) {
        this.startPolling(this.#pendingIntervalMs, { immediate: true });
      }
    }
    return state.alerts.length > 0 || !!state.config;
  }

  #getOpts() {
    return {
      authToken: this.#authToken,
      controllerUrl: this.#controllerUrl,
      siteId: this.#siteId,
      fetchFn: this.#fetchFn ?? null,
    };
  }

  /**
   * The token to poll with. A configured service account wins: it re-mints
   * itself and keeps scheduled polls alive long after any browser session
   * expired. Falls back to the last browser-provided token.
   */
  async #resolveAuthToken() {
    const service = getServiceSession(this.#controllerUrl);
    if (service?.hasCredentials()) {
      try {
        return `Bearer ${await service.getToken()}`;
      } catch {
        // Bad or unreachable service credentials — the browser token may
        // still work, so this is a fallback rather than a failure.
      }
    }
    return this.#authToken;
  }

  async poll() {
    if (!this.#controllerUrl) return { error: 'not_configured' };
    if (this.#polling) return { error: 'poll_in_progress' };

    this.#polling = true;
    const opts = { ...this.#getOpts(), authToken: await this.#resolveAuthToken() };
    const results = {};
    const notifiable = [];

    const checks = [
      { name: 'radius_reachability', fn: runRadiusReachabilityCheck },
      { name: 'dhcp_reachability', fn: runDhcpReachabilityCheck },
      { name: 'client_dhcp_failure', fn: runClientDhcpFailureCheck },
      { name: 'vlan_trunk', fn: runVlanTrunkCheck },
      { name: 'dns_reachability', fn: runDnsReachabilityCheck },
      { name: 'cert_expiry', fn: runCertExpiryCheck },
      { name: 'firmware_consistency', fn: runFirmwareConsistencyCheck },
      { name: 'ap_status', fn: runApStatusCheck },
    ];

    // Mark ALL checks as running upfront so the UI shows them all spinning
    for (const { name } of checks) {
      this.#checkStatus[name] = { ...this.#checkStatus[name], status: 'running' };
    }

    for (const { name, fn } of checks) {
      try {
        const result = await fn(opts);

        // Checks return { alerts, evidence } or plain alerts array (backwards compat)
        const alerts = Array.isArray(result) ? result : result.alerts ?? [];
        const evidence = Array.isArray(result) ? null : result.evidence ?? null;

        const activeIds = new Set();
        const storedAlerts = [];
        for (const alert of alerts) {
          // New or reopened actionable alerts are the webhook-worthy events;
          // an alert merely still present is not news.
          const before = this.#alertStore.getById(alert.id);
          const stored = this.#alertStore.upsert(alert);
          if (stored) {
            storedAlerts.push(stored);
            const routable =
              stored.severity === 'critical' ||
              (stored.severity === 'warning' && this.#webhookMinSeverity !== 'critical');
            if (routable && (!before || before.resolvedAt)) {
              notifiable.push(stored);
            }
          }
          activeIds.add(alert.id);
        }

        // Auto-resolve alerts from this check that were not seen
        this.#alertStore.resolveAbsent(name, activeIds);

        // Mirror to Postgres, best-effort — persistence trouble never fails a poll.
        repo
          .syncCheckAlerts(name, storedAlerts)
          .catch((e) => console.warn(`[Sentinel] alert persistence failed: ${e.message}`));

        if (evidence) {
          this.#checkEvidence[name] = {
            ...evidence,
            collectedAt: new Date().toISOString(),
            ...(this.#siteId ? { siteScoped: true } : {}),
          };
        }

        this.#checkStatus[name] = {
          status: 'ok',
          lastRunAt: new Date().toISOString(),
          error: null,
          alertCount: alerts.length,
        };
        this.#pushTrend(name, { ts: new Date().toISOString(), alertCount: alerts.length, status: 'ok' });
        results[name] = { ok: true, alerts: alerts.length };
      } catch (err) {
        if (err.message?.startsWith('401')) {
          this.#authExpired = true;
          // Suspend rather than forget: the schedule resumes automatically
          // when the next request arrives with fresh controller auth.
          this.#pendingIntervalMs = this.#intervalMs ?? this.#pendingIntervalMs;
          this.stopPolling({ forget: false });
          this.#polling = false;
          return { error: 'auth_expired' };
        }
        console.warn(`[Sentinel] ${name} failed:`, err.message);
        this.#checkStatus[name] = {
          status: 'error',
          lastRunAt: new Date().toISOString(),
          error: err.message,
        };
        this.#pushTrend(name, { ts: new Date().toISOString(), alertCount: 0, status: 'error' });
        results[name] = { ok: false, error: err.message };
      }
    }

    this.#lastPollAt = new Date().toISOString();
    this.#polling = false;

    // Route new/reopened actionable alerts, one POST per poll cycle.
    if (notifiable.length > 0 && this.#webhookUrl) {
      const payload = buildAlertPayload({
        alerts: notifiable,
        controllerUrl: this.#controllerUrl,
        siteId: this.#siteId,
      });
      dispatchWebhook(this.#webhookUrl, payload).then((r) => {
        if (!r.ok) console.warn(`[Sentinel] webhook dispatch failed: ${r.error ?? r.status}`);
      });
    }

    return results;
  }

  // ── Acknowledgement ──

  acknowledgeAlert(id, by = null) {
    const alert = this.#alertStore.acknowledge(id, by);
    if (alert) {
      repo
        .setAcknowledged(id, alert.acknowledgedAt, alert.acknowledgedBy)
        .catch((e) => console.warn(`[Sentinel] ack persistence failed: ${e.message}`));
    }
    return alert;
  }

  unacknowledgeAlert(id) {
    const alert = this.#alertStore.unacknowledge(id);
    if (alert) {
      repo
        .setAcknowledged(id, null, null)
        .catch((e) => console.warn(`[Sentinel] ack persistence failed: ${e.message}`));
    }
    return alert;
  }

  // ── Webhook routing ──

  getWebhookUrl() {
    return this.#webhookUrl;
  }

  getWebhookMinSeverity() {
    return this.#webhookMinSeverity;
  }

  /** Set (http/https) or clear (null/empty) the alert webhook. Returns false on an invalid URL. */
  setWebhookUrl(url, minSeverity) {
    const next = url ? String(url).trim() : null;
    if (next && !isValidWebhookUrl(next)) return false;
    if (minSeverity !== undefined) {
      if (!['warning', 'critical'].includes(minSeverity)) return false;
      this.#webhookMinSeverity = minSeverity;
    }
    this.#webhookUrl = next;
    repo
      .saveWebhookUrl(next, this.#webhookMinSeverity)
      .catch((e) => console.warn(`[Sentinel] webhook persistence failed: ${e.message}`));
    return true;
  }

  /** Send a test event so a receiver can be verified before relying on it. */
  async testWebhook() {
    if (!this.#webhookUrl) return { ok: false, error: 'no webhook configured' };
    const payload = buildAlertPayload({
      alerts: this.#alertStore.getActive().filter((a) => a.severity !== 'info'),
      controllerUrl: this.#controllerUrl,
      siteId: this.#siteId,
      event: 'sentinel.test',
    });
    return dispatchWebhook(this.#webhookUrl, payload);
  }

  startPolling(intervalMs = DEFAULT_INTERVAL_MS, { immediate = true } = {}) {
    this.#clearTimer();
    this.#pendingIntervalMs = null;
    this.#intervalMs = intervalMs;
    this.#timer = setInterval(() => this.poll(), intervalMs);
    if (immediate) this.poll();
    repo
      .saveSchedule(intervalMs, this.#siteId)
      .catch((e) => console.warn(`[Sentinel] schedule persistence failed: ${e.message}`));
  }

  /**
   * Stop background polling. With `forget: false` the schedule survives in
   * Postgres and as a pending interval (used for auth expiry and shutdown);
   * the default is a deliberate user stop, which erases it everywhere.
   */
  stopPolling({ forget = true } = {}) {
    this.#clearTimer();
    this.#intervalMs = null;
    if (forget) {
      this.#pendingIntervalMs = null;
      repo
        .clearSchedule()
        .catch((e) => console.warn(`[Sentinel] schedule persistence failed: ${e.message}`));
    }
  }

  #clearTimer() {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  getAlerts({ severity, check } = {}) {
    let alerts = this.#alertStore.getActive();
    if (severity) alerts = alerts.filter((a) => a.severity === severity);
    if (check) alerts = alerts.filter((a) => a.checkName === check);
    return alerts;
  }

  getAllAlerts({ severity, check } = {}) {
    let alerts = this.#alertStore.getAll();
    if (severity) alerts = alerts.filter((a) => a.severity === severity);
    if (check) alerts = alerts.filter((a) => a.checkName === check);
    return alerts;
  }

  clearAlerts() {
    this.#alertStore.clear();
    repo
      .clearAllAlerts()
      .catch((e) => console.warn(`[Sentinel] alert persistence failed: ${e.message}`));
  }

  getEvidence(checkName) {
    if (checkName) return this.#checkEvidence[checkName] ?? null;
    return { ...this.#checkEvidence };
  }

  getStatus() {
    return {
      configured: !!this.#controllerUrl,
      polling: this.#timer !== null,
      // Active interval, or the restored/suspended one awaiting fresh auth —
      // either way, the schedule the UI should display.
      intervalMs: this.#intervalMs ?? this.#pendingIntervalMs,
      siteId: this.#siteId,
      webhookConfigured: !!this.#webhookUrl,
      lastPollAt: this.#lastPollAt,
      authExpired: this.#authExpired,
      activeAlerts: this.#alertStore.getActive().length,
      checks: { ...this.#checkStatus },
    };
  }

  #pushTrend(checkName, entry) {
    if (!this.#trendStore[checkName]) this.#trendStore[checkName] = [];
    this.#trendStore[checkName].push(entry);
    if (this.#trendStore[checkName].length > MAX_TREND_POINTS) {
      this.#trendStore[checkName].shift();
    }
    repo
      .recordTrend(checkName, entry)
      .catch((e) => console.warn(`[Sentinel] trend persistence failed: ${e.message}`));
  }

  getTrend(checkName) {
    return this.#trendStore[checkName] ?? [];
  }

  getAllTrends() {
    return { ...this.#trendStore };
  }

  destroy() {
    // Shutdown, not a user stop — the persisted schedule must survive it.
    this.stopPolling({ forget: false });
    this.#alertStore.destroy();
  }
}

export const sentinelEngine = new SentinelEngine();
