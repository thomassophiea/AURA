import { AlertStore } from './alertStore.js';
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
        for (const alert of alerts) {
          this.#alertStore.upsert(alert);
          activeIds.add(alert.id);
        }

        // Auto-resolve alerts from this check that were not seen
        this.#alertStore.resolveAbsent(name, activeIds);

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
          this.stopPolling();
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

  startPolling(intervalMs = DEFAULT_INTERVAL_MS) {
    this.stopPolling();
    this.#timer = setInterval(() => this.poll(), intervalMs);
    // Run immediately
    this.poll();
  }

  stopPolling() {
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
  }

  getEvidence(checkName) {
    if (checkName) return this.#checkEvidence[checkName] ?? null;
    return { ...this.#checkEvidence };
  }

  getStatus() {
    return {
      configured: !!this.#controllerUrl,
      polling: this.#timer !== null,
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
  }

  getTrend(checkName) {
    return this.#trendStore[checkName] ?? [];
  }

  getAllTrends() {
    return { ...this.#trendStore };
  }

  destroy() {
    this.stopPolling();
    this.#alertStore.destroy();
  }
}

export const sentinelEngine = new SentinelEngine();
