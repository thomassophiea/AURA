import { fetchXcc } from './xccClient.js';

export class DriftMonitor {
  #lastTopologies = null; // Map<id, {name, vlanid}>
  #lastApProfiles = null; // Map<apSerial, profileId>
  #alerts = [];
  #authToken = null;
  #controllerUrl = null;
  #fetchFn = null;
  #timer = null;
  #authExpired = false;
  #lastPollAt = null;

  configure({ authToken, controllerUrl, fetchFn } = {}) {
    this.#authToken = authToken;
    this.#controllerUrl = controllerUrl;
    this.#fetchFn = fetchFn ?? null;
    this.#authExpired = false;
  }

  async poll() {
    if (!this.#controllerUrl) return;
    const opts = {
      authToken: this.#authToken,
      controllerUrl: this.#controllerUrl,
      fetchFn: this.#fetchFn,
    };

    let topologies, aps;
    try {
      [topologies, aps] = await Promise.all([
        fetchXcc('/v1/topologies', opts),
        fetchXcc('/v1/aps', opts),
      ]);
    } catch (err) {
      if (err.message.startsWith('401')) {
        this.#authExpired = true;
        this.stopPolling();
      }
      console.warn('[DriftMonitor] poll failed:', err.message);
      return;
    }

    this.#lastPollAt = new Date().toISOString();
    const topoArr = Array.isArray(topologies) ? topologies : [];
    const apArr = Array.isArray(aps?.data) ? aps.data : Array.isArray(aps) ? aps : [];

    const currentTopos = new Map(topoArr.map(t => [t.id, { name: t.name, vlanid: t.vlanid }]));
    const currentAps = new Map(apArr.map(a => [a.apSerialNum, a.apAssignedProfileId ?? a.profileId ?? '']));

    if (this.#lastTopologies !== null) {
      for (const [id, info] of this.#lastTopologies) {
        if (!currentTopos.has(id)) {
          this.#alerts.push({
            type: 'topology_removed',
            detail: `VLAN ${info.vlanid} (${info.name}) removed`,
            detectedAt: this.#lastPollAt,
          });
        }
      }
      for (const [id, info] of currentTopos) {
        if (!this.#lastTopologies.has(id)) {
          this.#alerts.push({
            type: 'topology_added',
            detail: `VLAN ${info.vlanid} (${info.name}) added`,
            detectedAt: this.#lastPollAt,
          });
        }
      }
    }

    if (this.#lastApProfiles !== null) {
      for (const [serial, profileId] of this.#lastApProfiles) {
        const current = currentAps.get(serial);
        if (current !== undefined && current !== profileId) {
          this.#alerts.push({
            type: 'ap_profile_changed',
            detail: `${serial}: profile ${profileId} → ${current}`,
            detectedAt: this.#lastPollAt,
          });
        }
      }
    }

    this.#lastTopologies = currentTopos;
    this.#lastApProfiles = currentAps;
  }

  startPolling(intervalMs = 60_000) {
    this.stopPolling();
    this.#timer = setInterval(() => this.poll(), intervalMs);
  }

  stopPolling() {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  getAlerts() {
    return [...this.#alerts];
  }

  clearAlerts() {
    this.#alerts = [];
  }

  getStatus() {
    return {
      polling: this.#timer !== null,
      lastPollAt: this.#lastPollAt,
      alertCount: this.#alerts.length,
      authExpired: this.#authExpired,
    };
  }
}

export const driftMonitor = new DriftMonitor();
