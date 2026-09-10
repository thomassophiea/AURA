/**
 * Attributed findings — the difference between a number and a diagnosis.
 *
 * A tool that returns "RSS -86 dBm" hands the model a number with no
 * expectation attached, and the model has to invent a threshold to judge it.
 * Measured consequence: asked "are any clients having problems", the model read
 * a fleet containing a client at -86 dBm / RFQI 1 and answered "no client is
 * currently flagged as having a problem" — because nothing in the payload
 * flagged it.
 *
 * So findings are computed here, against stated thresholds, and every finding
 * names its taxonomy leaf (Coverage / Weak Signal, Capacity / WiFi
 * Interference, Roaming / Failed to Fast Roam). Attribution is the half that
 * survives being turned into a score later; a bare percentage cannot be
 * retrofitted with causes.
 *
 * THRESHOLDS ARE DESIGN PRACTICE, NOT PHYSICS. They are declared, exported and
 * commented so they can be argued with — which is exactly what an SLE
 * expectation is supposed to invite.
 */

import { signal, rtt, airtimeSplit, percentile } from './gatewayEvidence.js';
import { parseFastTransition } from './gatewayEvidence.js';

/**
 * The expectations the tooling scores against today.
 *
 * `target` is ordinary enterprise WLAN design practice (roaming/voice-grade).
 * `floor` is the point below which the link is not usefully usable.
 */
export const THRESHOLDS = {
  coverage: {
    rssTarget: -67, // dBm — voice/roaming design target
    rssFloor: -75, // dBm — at or past the edge of usable coverage
    snrTarget: 25, // dB
    snrFloor: 15, // dB
    rfqiTarget: 3.5, // of 5
    rfqiFloor: 2, // of 5
  },
  capacity: {
    // "At least 30% airtime available" is the usual capacity expectation.
    availableFloor: 30, // %
    coChannelWarn: 20, // % of airtime lost to other Wi-Fi on our channel
    nonWifiWarn: 20, // % lost to non-Wi-Fi energy
  },
  latency: {
    wirelessWarnMs: 30,
    networkWarnMs: 100,
    dnsWarnMs: 250,
  },
  stability: {
    downlinkLossWarn: 0.02, // 2%
  },
  roaming: {
    // Rate, not raw count: muEvent returns multi-day history, so a count
    // compared against a 3-hour assumption cries wolf.
    roamsPerHourWarn: 10,
  },
};

export const SEVERITY = { CRITICAL: 'critical', WARNING: 'warning', INFO: 'info' };

const RANK = { critical: 3, warning: 2, info: 1 };

function finding(severity, taxonomy, summary, evidence, recommendation) {
  return { severity, taxonomy, summary, evidence, recommendation };
}

/**
 * Score one client row (plus optional event history) into attributed findings.
 *
 * @param {object} row      newest MuTable row
 * @param {object} [opts]
 * @param {object[]} [opts.events]   muEvent timeline
 * @param {number[]} [opts.rssSeries] all RSS samples, for a sustained view
 * @param {object} [opts.apRadio]     the ApTable row for this client's radio
 * @returns {object[]} findings, most severe first
 */
export function scoreClient(row, { events = [], rssSeries = [], apRadio = null } = {}) {
  const out = [];
  const { rss, snr } = signal(row);
  const rfqi = Number.isFinite(Number(row.RFQI)) ? Number(row.RFQI) : null;
  const t = THRESHOLDS.coverage;

  // A row without a usable signal reading is an idle/stale placeholder. Scoring
  // it invents an incident, so it is excluded rather than reported as broken.
  if (rss === null || snr === null) {
    return out;
  }

  const sustainedRss = rssSeries.length >= 3 ? percentile(rssSeries, 50) : null;
  const rssForVerdict = sustainedRss ?? rss;

  // ── Coverage vs contention. The PAIR decides, not either metric alone. ──
  const weakSignal = rssForVerdict <= t.rssFloor || snr <= t.snrFloor;
  const poorQuality = rfqi !== null && rfqi <= t.rfqiFloor;

  if (weakSignal) {
    const ev = [`RSS ${Math.round(rssForVerdict)} dBm`, `SNR ${snr} dB`];
    if (rfqi !== null) ev.push(`RFQI ${rfqi}/5`);
    if (sustainedRss !== null) ev.push(`median of ${rssSeries.length} samples`);
    ev.push(`floors: ${t.rssFloor} dBm / ${t.snrFloor} dB`);
    out.push(
      finding(
        SEVERITY.CRITICAL,
        'Coverage / Weak Signal',
        'At or past the edge of usable coverage.',
        ev,
        'This is an AP placement or transmit-power problem. Nothing on the channel plan will fix it.'
      )
    );
  } else if (poorQuality) {
    // Healthy signal with poor link quality is contention, and the fix is the
    // opposite of the coverage fix — moving the AP makes it worse.
    const contended =
      apRadio && airtimeSplit(apRadio).available !== null
        ? airtimeSplit(apRadio).available < THRESHOLDS.capacity.availableFloor
        : null;
    out.push(
      finding(
        SEVERITY.CRITICAL,
        'Coverage / Link Quality',
        contended === true
          ? 'Poor link quality on a healthy signal, and the radio is contended — this is contention, not range.'
          : 'Poor link quality despite a usable signal — range or contention.',
        [
          `RSS ${Math.round(rssForVerdict)} dBm`,
          `SNR ${snr} dB`,
          `RFQI ${rfqi}/5 (floor ${t.rfqiFloor})`,
          ...(contended === true ? ['the serving radio has less than 30% airtime available'] : []),
          ...(contended === null ? ['airtime for the serving radio was not read'] : []),
        ],
        contended === true
          ? 'Work the channel plan — check co-channel neighbours on this radio.'
          : "Check the serving radio's channel utilization before moving anything."
      )
    );
  } else if (rssForVerdict < t.rssTarget || snr < t.snrTarget || (rfqi !== null && rfqi < t.rfqiTarget)) {
    out.push(
      finding(
        SEVERITY.WARNING,
        'Coverage / Below Design Target',
        'Usable, but under the roaming/voice design target.',
        [
          `RSS ${Math.round(rssForVerdict)} dBm`,
          `SNR ${snr} dB`,
          ...(rfqi !== null ? [`RFQI ${rfqi}/5`] : []),
          `targets: ${t.rssTarget} dBm / ${t.snrTarget} dB / ${t.rfqiTarget} RFQI`,
        ],
        'Acceptable for data. Marginal for voice or seamless roaming.'
      )
    );
  }

  // ── DHCP outcome: associated, measurable RF, no address. ──
  if (!row.IP) {
    out.push(
      finding(
        SEVERITY.CRITICAL,
        'DHCP / No Address',
        'Associated with a usable radio but holding no IPv4 address.',
        [`RSS ${Math.round(rss)} dBm`, `SNR ${snr} dB`, 'no IP in client telemetry'],
        'Association is layer 2; an address is not. Investigate DHCP, the VLAN path, or a role ' +
          'blocking DHCP — not RF. Pool exhaustion is not visible from the Gateway.'
      )
    );
  }

  // ── Latency, split by cause. Whichever dominates IS the answer. ──
  const wireless = rtt(row.WirelessRTT);
  const network = rtt(row.NetworkRTT);
  const dns = rtt(row.DNSRTT);
  const lat = THRESHOLDS.latency;

  if (network !== null && network > lat.networkWarnMs && (wireless === null || wireless < network / 3)) {
    out.push(
      finding(
        SEVERITY.WARNING,
        'Throughput / Upstream Latency',
        'Latency is upstream of the AP, not over the air.',
        [
          `networkRTT ${network} ms`,
          wireless !== null ? `wirelessRTT ${wireless} ms` : 'wirelessRTT not measured',
        ],
        'No amount of AP or RF work will fix this. Look upstream of the Gateway.'
      )
    );
  }
  if (wireless !== null && wireless > lat.wirelessWarnMs) {
    out.push(
      finding(
        SEVERITY.WARNING,
        'Throughput / Wireless Latency',
        'Elevated over-the-air latency.',
        [`wirelessRTT ${wireless} ms (warn above ${lat.wirelessWarnMs} ms)`],
        'Consistent with contention or a weak link; check the serving radio.'
      )
    );
  }
  if (dns !== null && dns > lat.dnsWarnMs) {
    out.push(
      finding(
        SEVERITY.WARNING,
        'DNS / Slow Resolution',
        'Name resolution is slow. Users experience this as "the wifi is broken".',
        [`dnsRTT ${dns} ms (warn above ${lat.dnsWarnMs} ms)`],
        'Check the DNS servers this VLAN hands out. The radio is not the problem.'
      )
    );
  }

  // ── Downlink loss. DLRetryAttempts is 0 fleet-wide on this build. ──
  const lost = Number(row.DLLostPkts);
  const rx = Number(row.RxPkts);
  if (Number.isFinite(lost) && Number.isFinite(rx) && rx > 0) {
    const ratio = lost / (rx + lost);
    if (ratio > THRESHOLDS.stability.downlinkLossWarn) {
      out.push(
        finding(
          SEVERITY.WARNING,
          'Stability / Downlink Loss',
          'Measurable downlink packet loss.',
          [`${(ratio * 100).toFixed(2)}% of downlink packets lost`, `${lost} packets`],
          'Retry counters are inert on this build, so loss is the usable signal.'
        )
      );
    }
  }

  // ── Roaming, by rate over the observed span. ──
  const roams = events.filter((e) => e.type === 'Roaming');
  if (roams.length >= 2) {
    const ts = roams.map((e) => Number(e.timestamp)).filter((n) => Number.isFinite(n) && n > 0);
    const spanHours = ts.length >= 2 ? (Math.max(...ts) - Math.min(...ts)) / 3_600_000 : null;
    const rate = spanHours ? roams.length / Math.max(spanHours, 0.25) : null;
    const noFt = roams.filter((e) => parseFastTransition(e.details) === 'None').length;

    if (rate !== null && rate >= THRESHOLDS.roaming.roamsPerHourWarn) {
      out.push(
        finding(
          SEVERITY.CRITICAL,
          'Roaming / Excessive Roaming',
          'The client is ping-ponging between APs.',
          [
            `${roams.length} roams over ${spanHours.toFixed(1)} h`,
            `${rate.toFixed(1)} roams/hour (warn at ${THRESHOLDS.roaming.roamsPerHourWarn})`,
            ...(noFt ? [`${noFt} with FT[None]`] : []),
          ],
          'Each roam costs a stall. Check the signal differential between the APs involved.'
        )
      );
    }
    if (noFt === roams.length && roams.length >= 3) {
      out.push(
        finding(
          SEVERITY.WARNING,
          'Roaming / Failed to Fast Roam',
          'Every roam reported FT[None] — fast transition is not being used.',
          [`${roams.length} roams, all FT[None]`],
          'Each roam pays a full re-authentication. Check 802.11r on this WLAN. ' +
            'Roam duration itself is not reported by this Gateway.'
        )
      );
    }
  }

  // ── Authentication problems, observed. ──
  const authProblems = events.filter((e) => e.type === 'Auth Problem');
  if (authProblems.length) {
    out.push(
      finding(
        SEVERITY.CRITICAL,
        'Authentication / Auth Problem',
        'The Gateway logged authentication problems for this client.',
        [
          `${authProblems.length} "Auth Problem" event(s)`,
          `most recent ${new Date(Number(authProblems.at(-1).timestamp)).toISOString()}`,
        ],
        'The Gateway records that authentication failed but not why — it exposes no RADIUS ' +
          'reject reason. Confirm credentials or test the auth path directly.'
      )
    );
  }

  return out.sort((a, b) => RANK[b.severity] - RANK[a.severity]);
}

/**
 * Score one ApTable radio row into airtime/AP findings.
 */
export function scoreRadio(row, { neighbours = [] } = {}) {
  const out = [];
  const split = airtimeSplit(row);
  const cap = THRESHOLDS.capacity;

  if (split.noise === null) {
    out.push(
      finding(
        SEVERITY.WARNING,
        'AP Health / Radio Disabled',
        'This radio is off the air.',
        ['noise floor reads 0, which means the radio is off rather than the band being quiet'],
        'An adopted AP with a radio off is serving nobody on that band.'
      )
    );
    return out;
  }

  if (split.available !== null && split.available < cap.availableFloor) {
    const parts = [];
    if (split.ownClients !== null) parts.push(`${split.ownClients}% our own clients`);
    if (split.coChannel !== null) parts.push(`${split.coChannel}% co-channel Wi-Fi`);
    if (split.nonWifi !== null) parts.push(`${split.nonWifi}% non-Wi-Fi`);

    // Attribute to the dominant consumer rather than just reporting "busy".
    const dominant =
      split.coChannel >= split.nonWifi && split.coChannel >= split.ownClients
        ? 'Capacity / WiFi Interference'
        : split.nonWifi >= split.ownClients
          ? 'Capacity / Non-WiFi Interference'
          : 'Capacity / Client Load';

    const offenders = neighbours
      .sort((a, b) => Number(b.Rss) - Number(a.Rss))
      .slice(0, 3)
      .map((n) => `${n.NeighborName ?? 'unknown'} (${n.SSID ?? '?'}) ${n.Rss} dBm`);

    out.push(
      finding(
        SEVERITY.CRITICAL,
        dominant,
        `Only ${split.available}% airtime available (expectation is at least ${cap.availableFloor}%).`,
        [...parts, ...(offenders.length ? [`loudest neighbours: ${offenders.join('; ')}`] : [])],
        dominant === 'Capacity / WiFi Interference'
          ? 'Co-channel contention — work the channel plan, not AP placement.'
          : dominant === 'Capacity / Non-WiFi Interference'
            ? 'Non-Wi-Fi energy on this channel. Move the channel or find the emitter.'
            : 'This radio is genuinely busy with our own clients. Add capacity.'
      )
    );
  } else if (split.coChannel !== null && split.coChannel >= cap.coChannelWarn) {
    out.push(
      finding(
        SEVERITY.WARNING,
        'Capacity / WiFi Interference',
        `${split.coChannel}% of airtime is going to other Wi-Fi on this channel.`,
        [`co-channel ${split.coChannel}%`, `available ${split.available}%`],
        'Not yet service-affecting, but it is the first thing to fix if this radio degrades.'
      )
    );
  }

  return out.sort((a, b) => RANK[b.severity] - RANK[a.severity]);
}

/** Roll findings up into a one-line verdict for a fleet view. */
export function summariseFindings(findings) {
  const critical = findings.filter((f) => f.severity === SEVERITY.CRITICAL).length;
  const warning = findings.filter((f) => f.severity === SEVERITY.WARNING).length;
  if (!findings.length) {
    return {
      verdict: 'no findings',
      critical: 0,
      warning: 0,
      note:
        'No finding is a real result, not a failure to look — it means the measured values met ' +
        'the stated expectations.',
    };
  }
  return {
    verdict: critical ? 'critical findings present' : 'warnings only',
    critical,
    warning,
    taxonomyLeaves: [...new Set(findings.map((f) => f.taxonomy))],
  };
}
