/**
 * Cortex capability registry — what evidence this Gateway can actually produce.
 *
 * The registry exists so the agent never repeatedly attempts an impossible
 * query, and — more importantly — so Cortex can say "I do not have that data"
 * instead of letting the model fill the hole with something plausible.
 *
 * Availability is one of:
 *   'available'    a named field, in a call that returned real data
 *   'derived'      needs 2+ fields or a time comparison; we do the derivation
 *   'partial'      works for some entities and not others (measured, not guessed)
 *   'inert'        the feature exists but is switched off on this box
 *   'unavailable'  looked for, not found. Do not invent an endpoint for it.
 *
 * The DEFAULTS below are the measured baseline for Campus Controller
 * 10.20.1.0-020R (lab VE6120, probed 2026-09-10). `probe()` re-measures the
 * handful of things that genuinely vary per box, so a different build or a
 * differently-configured Gateway does not inherit this box's verdicts.
 */

/**
 * @typedef {'available'|'derived'|'partial'|'inert'|'unavailable'} Availability
 * @typedef {{ availability: Availability, source: string, note?: string,
 *             taxonomy?: string }} Capability
 */

/** @type {Record<string, Capability>} */
export const DEFAULT_CAPABILITIES = {
  // ── client identity & state ────────────────────────────────────────────
  'client.list': {
    availability: 'available',
    source: 'flex(MuTable)',
    taxonomy: 'Client inventory',
  },
  'client.signal': {
    availability: 'available',
    source: 'MuTable.Rss + MuTable.SNR',
    taxonomy: 'Coverage / Weak Signal',
  },
  'client.link_quality': {
    availability: 'available',
    source: 'MuTable.RFQI (1-5)',
    taxonomy: 'Coverage / Link Quality',
  },
  'client.latency_split': {
    availability: 'available',
    source: 'MuTable.WirelessRTT / NetworkRTT / DNSRTT',
    note: '65535 means not measured and is suppressed, not scored',
    taxonomy: 'Throughput / Latency',
  },
  'client.throughput': {
    availability: 'available',
    source: 'MuTable.ThroughputBps / Rx / Tx',
    taxonomy: 'Throughput',
  },
  'client.downlink_loss': {
    availability: 'available',
    source: 'MuTable.DLLostPkts vs RxPkts',
    note: 'DLRetryAttempts is 0 for every client on this build — use loss, not retries',
    taxonomy: 'Stability / Downlink loss',
  },
  'client.role': {
    availability: 'available',
    source: 'MuTable.RoleName + RoleUUID',
    taxonomy: 'Network access / Role',
  },
  'client.ip': {
    availability: 'available',
    source: 'MuTable.IP',
    taxonomy: 'Network access / DHCP outcome',
  },
  'client.wlan': {
    availability: 'available',
    source: 'MuTable.SSID + RFSUUID',
  },
  'client.ap': {
    availability: 'available',
    source: 'MuTable.ApName + ApSerial + RadioID',
  },
  'client.capability': {
    availability: 'available',
    source: 'MuTable.Dot11Capability + 11Protocol + 11nAdvanced',
    taxonomy: 'Device Capability',
  },
  'client.hostname': {
    availability: 'partial',
    source: 'MuTable.Hostname',
    note: 'Frequently an empty string — resolution cannot depend on it',
  },
  'client.username': {
    availability: 'partial',
    source: 'MuTable.Username',
    note: 'Empty unless 802.1X/PPSK supplied an identity; empty on PSK networks',
  },

  // ── client history / lifecycle ─────────────────────────────────────────
  'client.timeline': {
    availability: 'available',
    source: 'report(station, mac, ["muEvent"])',
    note: 'statNames: Association, Disassociation, Roaming, "Auth Problem"',
    taxonomy: 'Time to Connect / Successful Connect',
  },
  'client.events_rest': {
    availability: 'unavailable',
    source: '/v1/stations/events/{mac}',
    note: 'Returns 500 "This feature is disabled." on this build. muEvent is the only timeline.',
  },
  'client.baseline': {
    availability: 'available',
    source: 'report(station, mac, ["baseliningRss","baseliningRFQI",...])',
    note: "The Gateway's own learned envelope — a better anomaly signal than a global threshold",
  },
  'client.roaming': {
    availability: 'available',
    source: 'muEvent Roaming events, with FT[...] and the radio pair in Details',
    taxonomy: 'Roaming / Excessive Roaming, Failed to Fast Roam',
  },
  'client.roam_duration': {
    availability: 'unavailable',
    source: '—',
    note: 'The roam record says whether FT was used, never how long the roam took',
    taxonomy: 'Roaming / Slow roam',
  },
  'client.connect_phase_timings': {
    availability: 'unavailable',
    source: '—',
    note: 'No per-phase durations. We can count connect failures, not time association/auth/DHCP.',
    taxonomy: 'Time to Connect',
  },

  // ── authentication ─────────────────────────────────────────────────────
  'client.auth_problem_events': {
    availability: 'available',
    source: 'muEvent statName "Auth Problem"',
    taxonomy: 'Authentication',
  },
  'client.radius_reject_reason': {
    availability: 'unavailable',
    source: '—',
    note: 'No per-client RADIUS reject reason in REST. An auth-stage failure can be located, not explained.',
    taxonomy: 'Authentication / RADIUS',
  },
  'auth.server_health': {
    availability: 'inert',
    source: 'report(site) radius widgets: authFailVsIssued, serverDownHist, radiusHealthTable',
    note: 'Widget family exists but no RADIUS server is configured on this Gateway to drive it',
  },
  'auth.active_test': {
    availability: 'unavailable',
    source: 'CLI radtest',
    note: 'The only active auth test on the platform is CLI-side; not reachable over REST',
  },

  // ── DHCP / DNS / NTP / VLAN (the backend preflight) ────────────────────
  'backend.dhcp_outcome': {
    availability: 'derived',
    source: 'MuTable: associated + measurable RF + no IP',
    note: 'Cleanest backend signal available: good radio, no address',
    taxonomy: 'DHCP',
  },
  'backend.dhcp_pool_state': {
    availability: 'unavailable',
    source: '—',
    note: 'Gateway exposes pool configuration, never live lease counts. Exhaustion is not visible.',
  },
  'backend.dns': {
    availability: 'available',
    source: 'MuTable.DNSRTT',
    taxonomy: 'DNS',
  },
  'backend.ntp': {
    availability: 'derived',
    source: 'Gateway telemetry timestamps vs this host clock',
    note: 'An inference. Confirm with CLI `show time`. Skew breaks 802.1X and captive portal with no RF symptom.',
  },
  'backend.vlan_resolution': {
    availability: 'derived',
    source: "service.defaultTopology resolved against /v1/topologies; apVlanStatus per AP",
    note: 'A dangling topology reference passes no traffic and warns nowhere',
    taxonomy: 'Network access / VLAN',
  },
  'client.vlan': {
    availability: 'derived',
    source: 'MuTable.RFSUUID -> service.defaultTopology -> topology.vlanid',
    note: 'MuTable carries no VLAN column; the VLAN is resolved through the service',
  },

  // ── RF / capacity ──────────────────────────────────────────────────────
  'rf.airtime_split': {
    availability: 'available',
    source: 'flex(ApTable): clientData / ChannelUtilizationAdjusted / interference / available',
    note: 'The four shares sum to 100 — verified on 45/45 rows, which is what makes attribution safe',
    taxonomy: 'Capacity / WiFi + non-WiFi Interference',
  },
  'rf.noise': {
    availability: 'available',
    source: 'ApTable.Noise',
    note: 'Noise 0 means the radio is off, not a quiet floor',
  },
  'rf.neighbours': {
    availability: 'available',
    source: 'flex(SmartRfNeighborTable)',
    note: '150 rows on a 6-AP lab; names the co-channel offenders',
    taxonomy: 'Interference source identification',
  },
  'rf.ifstats': {
    availability: 'partial',
    source: '/v1/aps/ifstats',
    note: 'Measured: 200 fleet-wide, 500 for AP5010-LAB. Never rely on it — ApTable is the stable route.',
  },
  'rf.smartrf_history': {
    availability: 'partial',
    source: 'report(ap) smartRFChannelInspector*, smartRFMitigation*',
    note: 'Widgets present; idle on this box — no mitigation events recorded',
  },

  // ── AP / infrastructure ────────────────────────────────────────────────
  'ap.status': {
    availability: 'available',
    source: '/v1/aps/query status + /v1/state/aps operationalStatus',
    taxonomy: 'AP Health / Connected-Disconnected',
  },
  'ap.disconnect_reason': {
    availability: 'unavailable',
    source: 'entityStatus.troubles[]',
    note: 'Measured empty even on a critical AP. Nearest signals are tunnel status and sysUptime.',
  },
  'ap.tunnel_state': {
    availability: 'available',
    source: '/v1/state/aps/{serial} controllerApTunnelStatus[]',
  },
  'ap.radio_state': {
    availability: 'available',
    source: 'AP radios[]: channel Off/null + txPower 0 + adminState',
    taxonomy: 'AP Health / Radio Disabled',
  },
  'ap.power': {
    availability: 'available',
    source: 'ethPowerStatus + currentPowerLevel + ApTable.PowerConsumption',
    taxonomy: 'AP Health / Low Power',
  },
  'ap.ethernet_errors': {
    availability: 'unavailable',
    source: 'IfStatsElement.inErrors/outErrors',
    note: 'Only reachable through the unreliable ifstats route for APs',
  },

  // ── configuration ──────────────────────────────────────────────────────
  'config.services': { availability: 'available', source: '/v1/services' },
  'config.topologies': { availability: 'available', source: '/v1/topologies' },
  'config.roles': { availability: 'available', source: '/v3/roles' },
  'config.aaa_policies': { availability: 'available', source: '/v1/aaapolicy' },
  'config.profiles': { availability: 'available', source: '/v3/profiles' },
  'config.sites': { availability: 'available', source: '/v3/sites' },
  'config.audit_log': {
    availability: 'available',
    source: '/v1/auditlogs?startTime=<ms>&endTime=<ms>',
    note: 'BOTH params required as epoch ms, or 422. start/end and fromTime/toTime are rejected.',
  },

  // ── scoring layer ──────────────────────────────────────────────────────
  'sle.qoe_scores': {
    availability: 'inert',
    source: 'siteQoE / apQoE / ApQoETable / SiteQoETable',
    note: '"enable": false and empty tables on this build. SLE answers are computed from raw telemetry.',
  },
  'sle.impact_attribution': {
    availability: 'unavailable',
    source: '/v3/sites/{id}/report/impact',
    note: 'Hard 404 despite being in the OpenAPI spec',
  },

  // ── things nothing on the platform answers ─────────────────────────────
  'client.internet_reachability': {
    availability: 'unavailable',
    source: '—',
    note: 'Nothing tests reachability past the Gateway. Needs a real client on the SSID.',
  },
  'client.arp': { availability: 'unavailable', source: '—' },
  'l2.storm_control': {
    availability: 'inert',
    source: 'report l2port page: l2portUnicast/Multicast/Broadcast',
    note: 'Requires an L2 port to report against',
  },
};

const USABLE = new Set(['available', 'derived', 'partial']);

export class CapabilityRegistry {
  #caps;
  #probedAt = null;

  constructor(overrides = {}) {
    this.#caps = { ...DEFAULT_CAPABILITIES };
    for (const [k, v] of Object.entries(overrides)) {
      this.#caps[k] = { ...this.#caps[k], ...v };
    }
  }

  get(key) {
    return this.#caps[key] ?? { availability: 'unavailable', source: 'unknown capability' };
  }

  /** True when the capability can produce evidence at all. */
  isUsable(key) {
    return USABLE.has(this.get(key).availability);
  }

  /**
   * The line Cortex must say instead of guessing. Returns null when the
   * capability is usable.
   */
  explainGap(key) {
    const cap = this.get(key);
    if (USABLE.has(cap.availability)) return null;
    const reason =
      cap.availability === 'inert'
        ? 'the feature exists on this Gateway but is not enabled or configured'
        : 'this Gateway does not expose that data';
    return `${reason}${cap.note ? ` — ${cap.note}` : ''} (looked at: ${cap.source})`;
  }

  /** Everything the agent may attempt, for the system prompt. */
  usableKeys() {
    return Object.keys(this.#caps).filter((k) => USABLE.has(this.#caps[k].availability));
  }

  /** Everything it must not attempt, so it stops trying. */
  unusableKeys() {
    return Object.keys(this.#caps).filter((k) => !USABLE.has(this.#caps[k].availability));
  }

  snapshot() {
    return { probedAt: this.#probedAt, capabilities: { ...this.#caps } };
  }

  /**
   * Re-measure the capabilities that genuinely vary between boxes, so a
   * different build does not silently inherit the lab's verdicts.
   *
   * Deliberately small: probing everything on every session would cost more
   * than it informs. These five are the ones observed to differ.
   */
  async probe(evidence, { session } = {}) {
    const set = (key, availability, note) => {
      this.#caps[key] = { ...this.#caps[key], availability, ...(note ? { note } : {}) };
    };

    // MuTable is load-bearing: if it fails, almost nothing else is answerable.
    const mu = await evidence.clients().catch(() => ({ ok: false, rows: [] }));
    if (!mu.ok) {
      for (const k of Object.keys(this.#caps)) {
        if (this.#caps[k].source?.includes('MuTable')) {
          set(k, 'unavailable', `flex(MuTable) failed: ${mu.error ?? 'unknown'}`);
        }
      }
    } else {
      const withHostname = mu.rows.filter((r) => r.Hostname).length;
      const withUsername = mu.rows.filter((r) => r.Username).length;
      set(
        'client.hostname',
        withHostname === 0 ? 'unavailable' : withHostname < mu.rows.length ? 'partial' : 'available',
        `${withHostname}/${mu.rows.length} rows carry a hostname`
      );
      set(
        'client.username',
        withUsername === 0 ? 'unavailable' : withUsername < mu.rows.length ? 'partial' : 'available',
        `${withUsername}/${mu.rows.length} rows carry a username`
      );
    }

    const ap = await evidence.radios().catch(() => ({ ok: false, rows: [] }));
    if (!ap.ok) set('rf.airtime_split', 'unavailable', `flex(ApTable) failed: ${ap.error ?? 'unknown'}`);

    const nb = await evidence.neighbours().catch(() => ({ ok: false, rows: [] }));
    if (!nb.ok || nb.rows.length === 0) {
      set('rf.neighbours', nb.ok ? 'inert' : 'unavailable', 'neighbour table empty or unreadable');
    }

    // Audit log: proves the param shape on this build.
    const audit = await evidence.auditLogs({ hours: 1 }).catch(() => ({ ok: false }));
    if (!audit.ok) set('config.audit_log', 'unavailable', 'audit log route rejected the request');

    // QoE: confirm it is still dark rather than assuming.
    if (session?.get) {
      const qoe = await session.get('/v1/report/sites/qoe').catch(() => ({ ok: false }));
      if (qoe?.ok && qoe.data?.enable === true) {
        set('sle.qoe_scores', 'available', 'QoE scoring is enabled on this Gateway');
      }
    }

    this.#probedAt = new Date().toISOString();
    return this.snapshot();
  }
}
