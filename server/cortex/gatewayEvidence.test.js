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
