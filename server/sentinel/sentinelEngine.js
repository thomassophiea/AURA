import { AlertStore } from './alertStore.js';
import { runRadiusReachabilityCheck } from './checks/radiusReachabilityCheck.js';
import { runDhcpReachabilityCheck } from './checks/dhcpReachabilityCheck.js';
import { runClientDhcpFailureCheck } from './checks/clientDhcpFailureCheck.js';
import { runVlanTrunkCheck } from './checks/vlanTrunkCheck.js';

const DEFAULT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export class SentinelEngine {
  #alertStore = new AlertStore();
  #authToken = null;
  #controllerUrl = null;
  #fetchFn = null;
  #timer = null;
  #authExpired = false;
  #lastPollAt = null;
  #polling = false;
  #checkStatus = {
    vlan_trunk: { status: 'idle', lastRunAt: null, error: null },
    dhcp_reachability: { status: 'idle', lastRunAt: null, error: null },
    radius_reachability: { status: 'idle', lastRunAt: null, error: null },
    client_dhcp_failure: { status: 'idle', lastRunAt: null, error: null },
  };

  configure({ authToken, controllerUrl, fetchFn } = {}) {
    if (authToken) this.#authToken = authToken;
    if (controllerUrl) this.#controllerUrl = controllerUrl;
    if (fetchFn) this.#fetchFn = fetchFn;
    this.#authExpired = false;
  }

  #getOpts() {
    return {
      authToken: this.#authToken,
      controllerUrl: this.#controllerUrl,
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

    for (const { name, fn } of checks) {
      try {
        this.#checkStatus[name].status = 'running';
        const alerts = await fn(opts);
        const activeIds = new Set();

        for (const alert of alerts) {
          this.#alertStore.upsert(alert);
          activeIds.add(alert.id);
        }

        // Auto-resolve alerts from this check that were not seen
        this.#alertStore.resolveAbsent(name, activeIds);

        this.#checkStatus[name] = {
          status: 'ok',
          lastRunAt: new Date().toISOString(),
          error: null,
          alertCount: alerts.length,
        };
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

  getStatus() {
    return {
      configured: !!this.#controllerUrl,
      polling: this.#timer !== null,
      lastPollAt: this.#lastPollAt,
      authExpired: this.#authExpired,
      activeAlerts: this.#alertStore.getActive().length,
      checks: { ...this.#checkStatus },
    };
  }

  destroy() {
    this.stopPolling();
    this.#alertStore.destroy();
  }
}

export const sentinelEngine = new SentinelEngine();
