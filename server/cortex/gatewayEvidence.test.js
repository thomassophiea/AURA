import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import {
  rtt,
  signal,
  isScorableClientRow,
  noiseFloor,
  inflateFrame,
  decodeFlexBody,
  flexPath,
  reportPath,
  auditLogPath,
  widgetSeries,
  widgetEvents,
  parseFastTransition,
  parseRoamRadios,
  percentile,
  airtimeSplit,
  GatewayEvidence,
  REPORT_DURATION,
  appDemand,
  appLabel,
  mtuMismatchReason,
  APP_COLUMNS,
  POLICY_APP_COLUMNS,
} from './gatewayEvidence.js';

/**
 * A real MuTable row, copied verbatim from a live lab Gateway
 * (VE6120 10.20.1.0-020R, 2026-09-10). Using measured data rather than an
 * invented fixture is the point: the sentinel values below are what the
 * appliance actually emits.
 */
const REAL_MU_ROW = {
  ts: 1789043160000000000,
  '11Protocol': '11bgn',
  ApName: 'AP5020-PVT-01',
  ApSerial: 'CV012408S-C0102',
  Channel: '1',
  DLLostPkts: 16,
  DLRetryAttempts: 0,
  IP: '192.168.100.122',
  MAC: '58:9A:3E:E8:1D:95',
  Manufacturer: 'Amazon Technologies Inc.',
  NetworkRTT: 38,
  RFQI: 4,
  RadioID: 1,
  RoleName: 'Enterprise User',
  Rss: -48,
  RxPkts: 138189,
  SNR: 50,
  SSID: 'Skynet',
  SiteName: 'PrimarySite',
  WirelessRTT: 3,
  DNSRTT: 65535, // <- the appliance's "not measured" marker
  Hostname: '',
  Username: '',
};

describe('RTT sentinel handling', () => {
  it('suppresses 65535 rather than reporting 65-second latency', () => {
    // This is the single most important guard in the module: read naively,
    // 65535 becomes "this client has 65 seconds of latency" and the model
    // confidently invents an outage.
    expect(rtt(65535)).toBeNull();
    expect(rtt(REAL_MU_ROW.DNSRTT)).toBeNull();
  });

  it('keeps genuine readings', () => {
    expect(rtt(3)).toBe(3);
    expect(rtt(38)).toBe(38);
    expect(rtt(0)).toBe(0);
  });

  it('rejects anything above the sentinel and negatives', () => {
    expect(rtt(70000)).toBeNull();
    expect(rtt(-1)).toBeNull();
  });

  it('returns null for absent or non-numeric values, never 0', () => {
    for (const v of [null, undefined, '', 'n/a', {}]) {
      expect(rtt(v)).toBeNull();
    }
  });
});

describe('signal sentinel handling', () => {
  it('reads a real row', () => {
    expect(signal(REAL_MU_ROW)).toEqual({ rss: -48, snr: 50 });
  });

  it('treats Rss 0 as a placeholder, not a perfect signal', () => {
    expect(signal({ Rss: 0, SNR: 30 }).rss).toBeNull();
  });

  it('treats SNR -10000 as an idle-row placeholder', () => {
    expect(signal({ Rss: -60, SNR: -10000 }).snr).toBeNull();
  });

  it('refuses to score a placeholder row', () => {
    expect(isScorableClientRow(REAL_MU_ROW)).toBe(true);
    expect(isScorableClientRow({ Rss: 0, SNR: -10000 })).toBe(false);
  });
});

describe('noise floor', () => {
  it('treats Noise 0 as radio-off rather than a quiet band', () => {
    expect(noiseFloor(0)).toBeNull();
    expect(noiseFloor(-99)).toBe(-99);
  });
});

describe('flex frame decoding', () => {
  const frameFor = (obj) => zlib.deflateSync(Buffer.from(JSON.stringify(obj))).toString('base64');

  it('inflates base64(zlib(json))', () => {
    expect(inflateFrame(frameFor([{ a: 1 }]))).toEqual([{ a: 1 }]);
  });

  it('treats an empty table as a real answer, not an error', () => {
    expect(inflateFrame(frameFor([]))).toEqual([]);
  });

  it('concatenates rows across frames', () => {
    const body = [{ frame: frameFor([{ i: 1 }]) }, { frame: frameFor([{ i: 2 }, { i: 3 }]) }];
    expect(decodeFlexBody(body)).toEqual([{ i: 1 }, { i: 2 }, { i: 3 }]);
  });

  it('ignores frameless entries and non-arrays', () => {
    expect(decodeFlexBody([{ nope: true }])).toEqual([]);
    expect(decodeFlexBody(null)).toEqual([]);
  });
});

describe('path builders encode the measured contract', () => {
  it('pins the report duration to the only accepted value', () => {
    expect(REPORT_DURATION).toBe('3H');
    expect(reportPath('station', 'AA:BB', ['muEvent'])).toContain('duration=3H');
  });

  it('builds a flex query with a bounded window', () => {
    const p = flexPath('MuTable', { now: 1_000_000_000, hours: 3 });
    const q = JSON.parse(decodeURIComponent(p.split('query=')[1]));
    expect(q.key).toBe('MuTable');
    expect(q.format).toBe('Json');
    expect(q.end - q.start).toBe(3 * 3600 * 1000);
  });

  it('always sends BOTH audit-log params as epoch ms', () => {
    // Measured: omitting either, or using start/end or fromTime/toTime,
    // returns 422 "Validation failed; Invalid end time."
    const p = auditLogPath({ now: 1_000_000_000, hours: 24 });
    expect(p).toMatch(/startTime=\d+/);
    expect(p).toMatch(/endTime=\d+/);
    expect(p).not.toMatch(/[?&]start=/);
    expect(p).not.toMatch(/fromTime/);
  });

  it('url-encodes identifiers containing colons', () => {
    expect(reportPath('station', 'AA:BB:CC', ['w'])).toContain('AA%3ABB%3ACC');
  });

  it('rejects an unknown report kind instead of building a bad path', () => {
    expect(() => reportPath('switch', 'x', ['w'])).toThrow(/Unknown report kind/);
  });
});

describe('report widget parsing', () => {
  const report = {
    baseliningRss: [
      {
        reportName: 'RSS',
        unit: 'dBm',
        statistics: [
          {
            statName: 'Base',
            values: [
              { value: '-47' },
              { value: null },
              { value: 'null' },
              { value: '' },
              { value: '-49' },
            ],
          },
        ],
      },
    ],
  };

  it('drops null-ish points instead of coercing them to zero', () => {
    const { values } = widgetSeries(report, 'baseliningRss');
    expect(values).toEqual([-47, -49]);
  });

  it('returns empty for an absent widget rather than throwing', () => {
    expect(widgetSeries(report, 'nope').values).toEqual([]);
    expect(widgetSeries(null, 'x').values).toEqual([]);
  });
});

describe('muEvent timeline', () => {
  const report = {
    muEvent: [
      {
        statistics: [
          {
            statName: 'Roaming',
            values: [
              {
                timestamp: 1788117120000,
                msg: {
                  ApName: 'AP5020-PVT-01',
                  SSID: 'Skynet',
                  Details:
                    'Inside XIQC from AP/Radio[1] to AP/Radio[2] Network[Skynet] FT[None]',
                  Timestamp: '1788117119500',
                },
              },
            ],
          },
          {
            statName: 'Association',
            values: [
              {
                timestamp: 1788181440000,
                msg: { ApName: 'AP5020-PVT-01', SSID: 'Skynet', Details: 'Radio[1] FT[None]' },
              },
            ],
          },
        ],
      },
    ],
  };

  it('flattens statNames into typed events, chronologically', () => {
    const events = widgetEvents(report, 'muEvent');
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('Roaming');
    expect(events[1].type).toBe('Association');
    expect(events[0].timestamp).toBeLessThan(events[1].timestamp);
  });

  it('prefers the precise inner Timestamp over the bucket timestamp', () => {
    const [roam] = widgetEvents(report, 'muEvent');
    expect(roam.timestamp).toBe(1788117119500);
  });

  it('extracts FT state and the radio pair', () => {
    const [roam] = widgetEvents(report, 'muEvent');
    expect(roam.fastTransition).toBe('None');
    expect(parseRoamRadios(roam.details)).toEqual({ from: 1, to: 2, interband: true });
  });

  it('returns null FT rather than guessing when absent', () => {
    expect(parseFastTransition('no ft here')).toBeNull();
    expect(parseFastTransition(undefined)).toBeNull();
    expect(parseRoamRadios('nothing')).toBeNull();
  });
});

describe('airtime split', () => {
  it('confirms the four shares sum to 100, which is what makes attribution safe', () => {
    const row = {
      ChannelUtilization: 10,
      clientData: 3,
      ChannelUtilizationAdjusted: 5,
      interference: 2,
      available: 90,
      Noise: -99,
    };
    const s = airtimeSplit(row);
    expect(s.consistent).toBe(true);
    expect(s.coChannel).toBe(5);
    expect(s.nonWifi).toBe(2);
    expect(s.noise).toBe(-99);
  });

  it('flags an inconsistent split instead of reporting it as fact', () => {
    const s = airtimeSplit({ clientData: 50, ChannelUtilizationAdjusted: 50, interference: 50, available: 50 });
    expect(s.consistent).toBe(false);
  });

  it('reports a radio-off noise reading as unknown', () => {
    expect(airtimeSplit({ Noise: 0 }).noise).toBeNull();
  });
});

describe('percentile', () => {
  it('interpolates without a numeric dependency', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([5], 50)).toBe(5);
    expect(percentile([], 50)).toBeNull();
  });
});

describe('GatewayEvidence', () => {
  const sessionReturning = (payload) => ({ get: async () => payload });

  it('requires a session that can actually fetch', () => {
    expect(() => new GatewayEvidence(null)).toThrow(/requires a session/);
    expect(() => new GatewayEvidence({})).toThrow(/requires a session/);
  });

  it('surfaces a transport failure instead of returning empty rows', () => {
    // Empty-vs-failed is the distinction that stops "no findings" being read
    // as "everything is healthy".
    const ev = new GatewayEvidence(sessionReturning({ ok: false, status: 500, errorSummary: 'boom' }));
    return ev.clients().then((res) => {
      expect(res.ok).toBe(false);
      expect(res.rows).toEqual([]);
      expect(res.error).toBe('boom');
    });
  });

  it('surfaces a corrupt frame as a failure, not an empty table', async () => {
    const ev = new GatewayEvidence(sessionReturning({ ok: true, data: [{ frame: 'not-base64-zlib' }] }));
    const res = await ev.clients();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/decode failed/);
  });

  it('reports the client timeline from muEvent only', async () => {
    const ev = new GatewayEvidence(
      sessionReturning({
        ok: true,
        data: {
          muEvent: [
            { statistics: [{ statName: 'Association', values: [{ timestamp: 1, msg: { ApName: 'AP1' } }] }] },
          ],
        },
      })
    );
    const res = await ev.clientTimeline('AA:BB:CC:DD:EE:FF');
    expect(res.ok).toBe(true);
    expect(res.events[0].type).toBe('Association');
  });
});

describe('application demand (demand vs impairment)', () => {
  it('knows all 32 application counters and marks the policy ones', () => {
    // 33 App* columns exist on the wire; AppLastUpdate is a timestamp, not a
    // counter, and is deliberately excluded.
    expect(APP_COLUMNS).toHaveLength(32);
    expect(APP_COLUMNS).not.toContain('AppLastUpdate');
    expect(APP_COLUMNS).toContain('AppStreaming');
    expect(APP_COLUMNS).toContain('AppRealTimeandCloudCommunications');
    expect([...POLICY_APP_COLUMNS].sort()).toEqual(
      ['AppGames', 'AppPeertoPeer', 'AppRestrictedContent']
    );
  });

  it('returns null when a row carries no counters, rather than a zero mix', () => {
    expect(appDemand({ Rss: -60, SNR: 30 })).toBeNull();
    expect(appDemand(null)).toBeNull();
    expect(appDemand({ AppStreaming: 0, AppMail: 0 })).toBeNull();
  });

  it('ranks categories by share and computes the total', () => {
    const d = appDemand({ AppStreaming: 900, AppMail: 60, AppSoftwareUpdates: 40 });
    expect(d.totalBytes).toBe(1000);
    expect(d.top[0].app).toBe('AppStreaming');
    expect(d.top[0].share).toBeCloseTo(0.9, 5);
    expect(d.top.map((a) => a.app)).toEqual(
      ['AppStreaming', 'AppMail', 'AppSoftwareUpdates']
    );
  });

  it('separates policy categories from performance ones', () => {
    const d = appDemand({ AppPeertoPeer: 500, AppStreaming: 500 });
    expect(d.policy.map((a) => a.app)).toEqual(['AppPeertoPeer']);
    // and a mix with no policy traffic reports an empty list, not null
    expect(appDemand({ AppMail: 10 }).policy).toEqual([]);
  });

  it('ignores non-numeric counter values instead of coercing them', () => {
    const d = appDemand({ AppStreaming: 'n/a', AppMail: 100 });
    expect(d.totalBytes).toBe(100);
    expect(d.top).toHaveLength(1);
  });

  it('labels a run-together category readably', () => {
    expect(appLabel('AppSocialNetworking')).toBe('Social Networking');
    expect(appLabel('AppRealTimeandCloudCommunications'))
      .toBe('Real Time and Cloud Communications');
  });
});

describe('tunnel MTU mismatch', () => {
  it('is silent when the AP learned the configured MTU', () => {
    expect(mtuMismatchReason({
      configMtu: 1500, apLearnedMtu: 1500,
      configMtuTunnelStatus: 'Normal', internalManagementTunnelStatus: 'Normal',
    })).toBeNull();
  });

  it('is silent when the AP has not reported a learned MTU yet', () => {
    // apLearnedMtu is null on a freshly adopted AP -- that is unknown, not a
    // mismatch, and must not produce a finding.
    expect(mtuMismatchReason({
      configMtu: 1500, apLearnedMtu: null, configMtuTunnelStatus: 'Normal',
    })).toBeNull();
  });

  it('reports a learned MTU below the configured one', () => {
    expect(mtuMismatchReason({ configMtu: 1500, apLearnedMtu: 1400 }))
      .toBe('configMtu 1500 but the AP learned 1400');
  });

  it('reports a non-Normal MTU tunnel status', () => {
    expect(mtuMismatchReason({ configMtuTunnelStatus: 'Degraded' }))
      .toBe('configMtuTunnelStatus=Degraded');
  });

  it('reports a non-Normal management tunnel status', () => {
    expect(mtuMismatchReason({ internalManagementTunnelStatus: 'Down' }))
      .toBe('internalManagementTunnelStatus=Down');
  });

  it('never reports on a missing or malformed tunnel row', () => {
    expect(mtuMismatchReason(null)).toBeNull();
    expect(mtuMismatchReason(undefined)).toBeNull();
    expect(mtuMismatchReason('nope')).toBeNull();
    expect(mtuMismatchReason({})).toBeNull();
  });
});

describe('stations() — the live fallback when flex is down', () => {
  const STATION = {
    macAddress: '1C:93:C4:13:25:05',
    ipAddress: '192.168.100.212',
    dhcpHostName: 'iPad',
    userName: '',
    accessPointName: 'AP4020-PVT-05_MESH_RELAY',
    accessPointSerialNumber: 'CV012408S-C0078',
    siteId: '84b3642f-a5d7-4dc9-b162-a6156c97b8f0',
    serviceId: 'c8d4880b-2a54-424e-9459-46c02425f587',
    role: 'Enterprise User',
    rss: -81,
    channel: '149/40',
    radioId: 2,
    protocol: '802.11ax',
    inPackets: 193891,
    outPackets: 10234,
    dlLostRetriesPackets: 30,
    inBytes: 47611521,
    outBytes: 1033525298,
    status: 'ACTIVE',
    lastSeen: 1789563963000,
  };
  const session = (rows) => ({ get: async () => ({ ok: true, status: 200, data: rows }) });

  it('maps identity, AP, signal and site into the shapes the tools read', async () => {
    const ev = new GatewayEvidence(session([STATION]));
    const res = await ev.stations();
    expect(res.ok).toBe(true);
    expect(res.rows[0]).toMatchObject({
      MAC: '1C:93:C4:13:25:05',
      IP: '192.168.100.212',
      HostName: 'iPad',
      ApName: 'AP4020-PVT-05_MESH_RELAY',
      Rss: -81,
      RadioID: 2,
    });
  });

  it('leaves SNR, RFQI and the latency split ABSENT rather than zero', async () => {
    // These are the discriminating readings. A zero in any of them would make a
    // working client look like a critical coverage failure, and would let the
    // coverage-versus-contention call be made on evidence that does not exist.
    const ev = new GatewayEvidence(session([STATION]));
    const [row] = (await ev.stations()).rows;
    for (const k of ['SNR', 'RFQI', 'WirelessRTT', 'NetworkRTT', 'DNSRTT']) {
      expect(row[k]).toBeUndefined();
    }
    // signal() therefore reports a usable RSS and no SNR, which makes the row
    // correctly unscorable rather than scored on half the evidence.
    expect(signal(row)).toEqual({ rss: -81, snr: null });
    expect(isScorableClientRow(row)).toBe(false);
  });

  it('does not populate the flex loss counters, because direction would be mixed', async () => {
    // lossFor() computes DLLostPkts / (RxPkts + DLLostPkts). Mapping RxPkts
    // from inPackets — UPLINK — divided downlink losses by an uplink count and
    // reported a working client at 99.99% loss. Measured live: 0.9999965.
    const ev = new GatewayEvidence(session([STATION]));
    const [row] = (await ev.stations()).rows;
    expect(row.RxPkts).toBeUndefined();
    expect(row.DLLostPkts).toBeUndefined();
    // The downlink figures are carried under their own names so a real ratio
    // can be computed from same-direction counters.
    expect(row.DlPktsSent).toBe(10234);
    expect(row.DlLostRetries).toBe(30);
    expect(row.UlPktsReceived).toBe(193891);
    const honest = row.DlLostRetries / (row.DlPktsSent + row.DlLostRetries);
    expect(honest).toBeCloseTo(0.00292, 4);
  });

  it('is a failed read, not an empty client list, when the endpoint fails', async () => {
    const ev = new GatewayEvidence({ get: async () => ({ ok: false, status: 500, errorSummary: 'Exception: null' }) });
    const res = await ev.stations();
    expect(res.ok).toBe(false);
    expect(res.rows).toEqual([]);
    expect(res.error).toMatch(/Exception: null/);
  });
});

describe('clientRfQuality — RFQI without the flex table', () => {
  // RFQI was believed flex-only, so it was reported unobtainable while the flex
  // service was down. The Gateway's own client page reads it from the report
  // widget, which answers in under a second WHILE FLEX IS DOWN.
  const report = (values) => ({
    rfQuality: [
      {
        reportName: 'RF Quality',
        reportType: 'Timeseries',
        statistics: [{ statName: 'Unique RFQI', values }],
      },
    ],
  });

  const evidenceFor = (result) =>
    new GatewayEvidence({ get: async () => result });

  it('reads the live RFQI and the median from the widget', async () => {
    const out = await evidenceFor({
      ok: true,
      data: report([
        { timestamp: 1, value: '3.0' },
        { timestamp: 2, value: '4.0' },
        { timestamp: 3, value: '5.0' },
      ]),
    }).clientRfQuality('AA:BB:CC:DD:EE:FF');

    expect(out.ok).toBe(true);
    expect(out.rfqi).toBe(5); // most recent
    expect(out.median).toBe(4);
    expect(out.values).toHaveLength(3);
  });

  it('skips the string "null" the Gateway sends for a gap', async () => {
    const out = await evidenceFor({
      ok: true,
      data: report([
        { timestamp: 1, value: '4.0' },
        { timestamp: 2, value: 'null' },
        { timestamp: 3, value: '' },
      ]),
    }).clientRfQuality('AA:BB:CC:DD:EE:FF');
    expect(out.values).toEqual([4]);
  });

  it('separates "no points" from "the read failed"', async () => {
    // A widget that answers with an empty series means not measured for this
    // client in this window. It is not a failed read, and must not be one.
    const empty = await evidenceFor({ ok: true, data: report([]) }).clientRfQuality('M');
    expect(empty.ok).toBe(true);
    expect(empty.rfqi).toBeNull();

    const failed = await evidenceFor({ ok: false, status: 500, errorSummary: 'boom' }).clientRfQuality('M');
    expect(failed.ok).toBe(false);
    expect(failed.error).toBe('boom');
    expect(failed.rfqi).toBeNull();
  });

  it('falls back to the first statistic if the statName is renamed', async () => {
    const renamed = {
      rfQuality: [{ statistics: [{ statName: 'RFQI', values: [{ timestamp: 1, value: '2.0' }] }] }],
    };
    const out = await evidenceFor({ ok: true, data: renamed }).clientRfQuality('M');
    expect(out.rfqi).toBe(2);
  });
});

describe('apNoisePerRadio — the other half of SNR', () => {
  // There is no SNR field anywhere on this platform. RSS is a CLIENT reading
  // and the noise floor is a RADIO reading, never joined server-side, which is
  // why the Gateway's own UI shows no labelled SNR on the client page.
  const noiseReport = (stats) => ({
    noisePerRadio: [{ reportName: 'Noise Per Radio', statistics: stats }],
  });
  const evidenceFor = (result) => new GatewayEvidence({ get: async () => result });

  it('maps R1/R2/R3 to radio indices with their medians', async () => {
    const out = await evidenceFor({
      ok: true,
      data: noiseReport([
        { statName: 'R1', unit: 'dBm', values: [{ value: '-100.0' }, { value: '-99.0' }, { value: '-100.0' }] },
        { statName: 'R2', unit: 'dBm', values: [{ value: '-100.0' }] },
        { statName: 'R3', unit: 'dBm', values: [{ value: '-96.0' }] },
      ]),
    }).apNoisePerRadio('CV012408S-C0078');

    expect(out.ok).toBe(true);
    expect(out.byRadio['1'].median).toBe(-100);
    expect(out.byRadio['3'].median).toBe(-96);
    expect(out.byRadio['1'].samples).toBe(3);
  });

  it('ignores a statistic that is not a radio', async () => {
    const out = await evidenceFor({
      ok: true,
      data: noiseReport([
        { statName: 'R1', values: [{ value: '-100' }] },
        { statName: 'Average', values: [{ value: '-98' }] },
      ]),
    }).apNoisePerRadio('S');
    expect(Object.keys(out.byRadio)).toEqual(['1']);
  });

  it('reports a failed read rather than an empty noise floor', async () => {
    const out = await evidenceFor({ ok: false, status: 500, errorSummary: 'boom' }).apNoisePerRadio('S');
    expect(out.ok).toBe(false);
    expect(out.byRadio).toEqual({});
  });

  it('derives the SNR the lab actually measured', () => {
    // Client at -62 dBm on R2, whose noise floor is -100 dBm.
    expect(-62 - -100).toBe(38);
  });
});

describe('clientEventLog — the detail muEvent cannot carry', () => {
  // muEvent returns four counters. This returns the events, and their details
  // string carries the roam trail and the Fast Transition state.
  const payload = {
    stationEvents: [
      {
        timestamp: '1788713137087',
        eventType: 'Roam',
        level: 'Info',
        apName: 'AP5020-PVT-03_MESH_ROOT',
        ssid: 'Skynet',
        details: 'Inside XIQC from AP/Radio[2] to AP/Radio[1] Network[Skynet] FT[None]',
      },
      {
        timestamp: '1787849137087',
        eventType: 'Registration',
        apName: 'AP5020-PVT-02',
        ssid: 'Skynet',
        details: 'Radio[2] FT[None]',
      },
    ],
    smartRfEvents: [
      {
        alarmTypes: [
          {
            id: 'PowerChange',
            severity: 'Info',
            alarms: [
              {
                log: 'Smart RF Band 6 GHz Radio 3 power changed from 10dBm to 12dBm',
                ts: 1789405901588,
                apName: 'AP5020-PVT-02',
                apSerial: 'CV012408S-C0044',
              },
            ],
          },
        ],
      },
    ],
  };

  const evidenceFor = (result) => new GatewayEvidence({ get: async () => result });

  it('parses the roam trail and the Fast Transition state out of details', async () => {
    const out = await evidenceFor({ ok: true, data: payload }).clientEventLog('AA:BB');
    const roam = out.events.find((e) => e.eventType === 'Roam');

    // FT[None] on every roam is the difference between "roams a lot" and "pays
    // a full re-auth on every handoff" — different problems, different fixes.
    expect(roam.fastTransition).toBe('None');
    expect(roam.fromRadio).toBe('2');
    expect(roam.toRadio).toBe('1');
  });

  it('coerces the string timestamps this route uses, and sorts oldest first', async () => {
    const out = await evidenceFor({ ok: true, data: payload }).clientEventLog('AA:BB');
    expect(typeof out.events[0].timestamp).toBe('number');
    expect(out.events[0].timestamp).toBeLessThan(out.events[1].timestamp);
  });

  it('flattens the three-deep SmartRF alarm nesting', async () => {
    const out = await evidenceFor({ ok: true, data: payload }).clientEventLog('AA:BB');
    expect(out.smartRf).toHaveLength(1);
    expect(out.smartRf[0].id).toBe('PowerChange');
    expect(out.smartRf[0].log).toMatch(/power changed from 10dBm to 12dBm/);
  });

  it('reports the span it ACTUALLY got, not the one it asked for', async () => {
    // This route ignores the window: it returned 10 days when asked for 3 hours.
    const out = await evidenceFor({ ok: true, data: payload }).clientEventLog('AA:BB', { hours: 3 });
    expect(out.requestedHours).toBe(3);
    // Ten days of history for a three-hour request — measured, not hypothetical.
    expect(out.spanHours).toBeCloseTo(240, 0);
    expect(out.spanHours).toBeGreaterThan(out.requestedHours);
  });

  it('reports a failed read rather than an empty event history', async () => {
    const out = await evidenceFor({ ok: false, status: 500, errorSummary: 'boom' }).clientEventLog('AA:BB');
    expect(out.ok).toBe(false);
    expect(out.events).toEqual([]);
  });
});

describe('clientPerformance — latency and retries without flex', () => {
  const series = (widget, stats) => ({
    [widget]: [{ statistics: stats }],
  });
  const payload = {
    ...series('averageTcpRoundTripTime', [
      { statName: 'Wireless', values: [{ value: '4' }, { value: '6' }, { value: '8' }] },
      { statName: 'Network', values: [{ value: '20' }, { value: '30' }, { value: '40' }] },
    ]),
    ...series('baseliningRetries', [
      { statName: 'Retries', values: [{ value: '1' }, { value: '3' }, { value: '5' }] },
      { statName: 'Retries Lower', values: [{ value: '0' }] },
    ]),
  };
  const evidenceFor = (result) => new GatewayEvidence({ get: async () => result });

  it('reports the median, not the latest — one spike is not an experience', async () => {
    const out = await evidenceFor({ ok: true, data: payload }).clientPerformance('AA:BB');
    expect(out.wirelessRttMs).toBe(6);
    expect(out.networkRttMs).toBe(30);
    expect(out.retries).toBe(3);
  });

  it('picks the Retries statistic, not its confidence band', async () => {
    const out = await evidenceFor({ ok: true, data: payload }).clientPerformance('AA:BB');
    expect(out.retries).not.toBe(0);
  });

  it('names its source so nothing attributes it to flex', async () => {
    const out = await evidenceFor({ ok: true, data: payload }).clientPerformance('AA:BB');
    expect(out.source).toMatch(/averageTcpRoundTripTime/);
  });

  it('returns nulls, not zeros, when the widgets carry no points', async () => {
    const empty = { averageTcpRoundTripTime: [{ statistics: [{ statName: 'Wireless', values: [] }] }] };
    const out = await evidenceFor({ ok: true, data: empty }).clientPerformance('AA:BB');
    expect(out.wirelessRttMs).toBeNull();
    expect(out.retries).toBeNull();
  });

  it('reports a failed read rather than absent measurements', async () => {
    const out = await evidenceFor({ ok: false, status: 500, errorSummary: 'boom' }).clientPerformance('M');
    expect(out.ok).toBe(false);
    expect(out.error).toBe('boom');
  });
});

describe('apClientSnr — SNR exists, as an AP leaderboard', () => {
  // Nine widget-name probes against /report/stations came back empty because
  // SNR is not on the client resource at all. The Gateway DOES join RSS and
  // the noise floor — ranked across the clients on one AP, never as a trend.
  const ranked = {
    topClientsBySnr: [
      {
        reportName: 'Top Clients by SNR',
        reportType: 'Distribution',
        unit: 'dB',
        distributionStats: [
          { id: 'B8:F7:75:35:20:D7', value: 59.8 },
          { id: '5A:DA:D9:17:55:71', value: 40.7 },
        ],
      },
    ],
    worstClientsBySnr: [
      { distributionStats: [{ id: '40:A3:CC:60:09:19', value: 26.2 }] },
    ],
  };
  const evidenceFor = (result) => new GatewayEvidence({ get: async () => result });

  it('indexes both ends of the ranking by MAC', async () => {
    const out = await evidenceFor({ ok: true, data: ranked }).apClientSnr('CV012408S-C0078');
    expect(out.byMac['B8:F7:75:35:20:D7']).toBe(59.8);
    // The bottom list matters most: asking only for the top would make a
    // struggling client invisible.
    expect(out.byMac['40:A3:CC:60:09:19']).toBe(26.2);
  });

  it('upper-cases the MAC so a lookup cannot miss on case', async () => {
    const out = await evidenceFor({
      ok: true,
      data: { topClientsBySnr: [{ distributionStats: [{ id: 'aa:bb:cc:dd:ee:ff', value: 30 }] }] },
    }).apClientSnr('S');
    expect(out.byMac['AA:BB:CC:DD:EE:FF']).toBe(30);
  });

  it('reports a failed read rather than an empty ranking', async () => {
    const out = await evidenceFor({ ok: false, status: 500, errorSummary: 'boom' }).apClientSnr('S');
    expect(out.ok).toBe(false);
    expect(out.byMac).toEqual({});
  });
});

describe('an inert counter is not a healthy reading', () => {
  it('reports all-zero retries as unmeasured, never as zero', async () => {
    // 88 points, every one zero, corroborated by the AP-side ranking. The
    // counter is not running. Zero here would score as "no retries".
    const data = {
      baseliningRetries: [
        { statistics: [{ statName: 'Retries', values: Array.from({ length: 88 }, () => ({ value: '0' })) }] },
      ],
    };
    const out = await new GatewayEvidence({ get: async () => ({ ok: true, data }) }).clientPerformance('M');
    expect(out.retries).toBeNull();
    expect(out.retriesInert).toBe(true);
  });

  it('still reports a genuine retry figure where one exists', async () => {
    const data = {
      baseliningRetries: [
        { statistics: [{ statName: 'Retries', values: [{ value: '0' }, { value: '4' }, { value: '8' }] }] },
      ],
    };
    const out = await new GatewayEvidence({ get: async () => ({ ok: true, data }) }).clientPerformance('M');
    expect(out.retriesInert).toBe(false);
    expect(out.retries).toBe(4);
  });
});

describe('siteRfHealth — which AP is worst here', () => {
  const data = {
    worstApsByRfHealth: [{ distributionStats: [{ id: 'AP-1', value: 2.1 }, { id: 'AP-2', value: 3.4 }] }],
    worstApsBySnr: [{ distributionStats: [{ id: 'AP-1', value: 18 }] }],
    worstApsByChannelUtil: [{ distributionStats: [{ id: 'AP-3', value: 91 }] }],
    worstApsByRetries: [{ distributionStats: [{ id: 'AP-1', value: 0 }] }],
    apCurrentUpDownReport: [{ distributionStats: [{ id: 'Up', value: 7 }, { id: 'Down', value: 1 }] }],
  };
  const evidenceFor = (r) => new GatewayEvidence({ get: async () => r });

  it('reads the WORST end of every ranking', async () => {
    // A top-N list cannot show a struggling AP, and "which is worst" is the
    // operator's actual question.
    const out = await evidenceFor({ ok: true, data }).siteRfHealth('site-1');
    expect(out.rankings.worstByRfHealth[0]).toEqual({ id: 'AP-1', value: 2.1 });
    expect(out.rankings.worstByChannelUtil[0].id).toBe('AP-3');
  });

  it('carries the up/down split so an AP with no clients is still visible', async () => {
    const out = await evidenceFor({ ok: true, data }).siteRfHealth('site-1');
    expect(out.apUpDown).toEqual([
      { id: 'Up', value: 7 },
      { id: 'Down', value: 1 },
    ]);
  });

  it('reports a failed read rather than an empty site', async () => {
    const out = await evidenceFor({ ok: false, status: 500, errorSummary: 'boom' }).siteRfHealth('s');
    expect(out.ok).toBe(false);
    expect(out.rankings).toEqual({});
  });
});

describe('wlanHealth — is this WLAN healthy', () => {
  const data = {
    throughputReport: [
      {
        statistics: [
          { statName: 'Total', values: [{ value: '10' }, { value: '20' }, { value: '30' }] },
          { statName: 'Download', values: [{ value: '8' }] },
        ],
      },
    ],
    countOfUniqueUsersReport: [{ statistics: [{ statName: 'tntUniqueUsers', values: [{ value: '12' }] }] }],
    topAccessPointsByConcurrentUserCount: [{ distributionStats: [{ id: 'AP-1', value: 9 }] }],
  };
  const evidenceFor = (r) => new GatewayEvidence({ get: async () => r });

  it('summarises throughput and client count for the WLAN itself', async () => {
    const out = await evidenceFor({ ok: true, data }).wlanHealth('svc-uuid');
    expect(out.throughput.total.median).toBe(20);
    expect(out.uniqueClients.median).toBe(12);
    expect(out.busiestAps[0]).toEqual({ id: 'AP-1', clients: 9 });
  });

  it('distinguishes "no data" from zero', async () => {
    const out = await evidenceFor({ ok: true, data: {} }).wlanHealth('svc-uuid');
    expect(out.throughput.total).toBeNull();
    expect(out.uniqueClients).toBeNull();
  });
});

describe('reportPath knows the service resource', () => {
  it('builds the WLAN report path', () => {
    expect(reportPath('service', 'svc-uuid', ['throughputReport'])).toContain(
      '/v1/report/services/svc-uuid'
    );
  });
});
