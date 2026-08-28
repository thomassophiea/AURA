import { AlertStore } from './alertStore.js';
import * as repo from './sentinelRepository.js';
import { runRadiusReachabilityCheck } from './checks/radiusReachabilityCheck.js';
import { runDhcpReachabilityCheck } from './checks/dhcpReachabilityCheck.js';
import { runClientDhcpFailureCheck } from './checks/clientDhcpFailureCheck.js';
import { runVlanTrunkCheck } from './checks/vlanTrunkCheck.js';

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
  #authExpired = false;
  #lastPollAt = null;
  #polling = false;
  #trendStore = {};
  #checkStatus = {
    vlan_trunk: { status: 'idle', lastRunAt: null, error: null },
    dhcp_reachability: { status: 'idle', lastRunAt: null, error: null },
    radius_reachability: { status: 'idle', lastRunAt: null, error: null },
    client_dhcp_failure: { status: 'idle', lastRunAt: null, error: null },
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
    if (state.config?.intervalMs) {
      this.#pendingIntervalMs = state.config.intervalMs;
      if (state.config.siteId) this.#siteId = state.config.siteId;
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

  async poll() {
    if (!this.#controllerUrl) return { error: 'not_configured' };
    if (this.#polling) return { error: 'poll_in_progress' };

    this.#polling = true;
    const opts = this.#getOpts();
    const results = {};

    const checks = [
      { name: 'radius_reachability', fn: runRadiusReachabilityCheck },
      { name: 'dhcp_reachability', fn: runDhcpReachabilityCheck },
      { name: 'client_dhcp_failure', fn: runClientDhcpFailureCheck },
      { name: 'vlan_trunk', fn: runVlanTrunkCheck },
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
          const stored = this.#alertStore.upsert(alert);
          if (stored) storedAlerts.push(stored);
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
    return results;
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
