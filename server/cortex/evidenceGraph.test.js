import { describe, it, expect } from 'vitest';
import {
  CONFIDENCE,
  EPISTEMIC,
  DOMAIN,
  domainOf,
  SOURCE_FAMILY,
  sourceFamilyOf,
  digestToolResult,
  plumbingState,
  buildEvidenceGraph,
  classifyConfidence,
  deriveImpact,
  cortexStandard,
  buildConfidenceBlock,
} from './evidenceGraph.js';

/** Build a ledger entry the way the investigation runtime does. */
const entry = (tool, payload, ok = true) => ({
  tool,
  ok,
  digest: digestToolResult(tool, payload),
});

const cleanPlumbing = {
  basis: 'observed',
  dhcp: { associatedClients: 40, withoutIpv4: 0, share: 0 },
  dns: { clientsMeasured: 30, p50Ms: 12 },
  vlan: { danglingTopologies: [] },
};

describe('domainOf', () => {
  it('maps classifier taxonomies to fault domains', () => {
    expect(domainOf('Coverage / Weak Signal')).toBe(DOMAIN.RF);
    expect(domainOf('Capacity / WiFi Interference')).toBe(DOMAIN.CAPACITY);
    expect(domainOf('Roaming / Failed to Fast Roam')).toBe(DOMAIN.ROAMING);
    expect(domainOf('DHCP / No Address')).toBe(DOMAIN.ADDRESSING);
  });

  it('returns null rather than guessing for an unknown taxonomy', () => {
    expect(domainOf('Something Unmapped')).toBeNull();
  });
});

describe('sourceFamilyOf', () => {
  it('puts every MuTable-derived tool in ONE family', () => {
    // The anti-corroboration rule: diagnoseClient and getSiteOverview read the
    // same table, so agreement between them is one measurement seen twice.
    const families = ['diagnoseClient', 'getSiteOverview', 'compareClientToPeers'].map(
      sourceFamilyOf
    );
    expect(new Set(families).size).toBe(1);
  });

  it('keeps genuinely different reads in different families', () => {
    expect(sourceFamilyOf('checkBackendServices')).not.toBe(sourceFamilyOf('getRfHealth'));
  });
});

describe('digestToolResult', () => {
  it('keeps severity and taxonomy but drops the free text', () => {
    const d = digestToolResult('diagnoseClient', {
      basis: 'observed',
      findings: [
        { severity: 'critical', taxonomy: 'Coverage / Weak Signal', summary: 'a sentence', evidence: 'rss -83' },
      ],
    });
    expect(d.findings).toEqual([
      { severity: 'critical', taxonomy: 'Coverage / Weak Signal', domain: DOMAIN.RF },
    ]);
    expect(JSON.stringify(d)).not.toMatch(/a sentence/);
  });

  it('records a capability gap as such', () => {
    const d = digestToolResult('getRfHealth', { basis: 'unknown', unavailable: true });
    expect(d.unavailable).toBe(true);
  });

  it('carries the lifecycle verdict without the fifteen-stage ladder', () => {
    const d = digestToolResult('diagnoseClient', {
      lifecycle: {
        lastSuccessfulStage: 'association',
        firstFailingStage: 'dhcp',
        failureDomain: 'DHCP',
        stages: new Array(15).fill({ status: 'ok' }),
      },
    });
    expect(d.lifecycle.firstFailingStage).toBe('dhcp');
    expect(d.lifecycle.stages).toBeUndefined();
  });
});

describe('plumbingState', () => {
  it('reports not-run when no plumbing read is present', () => {
    expect(plumbingState([digestToolResult('getRfHealth', { basis: 'observed' })])).toMatchObject({
      ran: false,
      clean: null,
    });
  });

  it('a clean preflight is a result', () => {
    const s = plumbingState([digestToolResult('checkBackendServices', cleanPlumbing)]);
    expect(s).toMatchObject({ ran: true, clean: true });
  });

  it('does not read zero measured DNS clients as fast DNS', () => {
    // A null metric is NOT MEASURED. Not zero, not healthy.
    const s = plumbingState([
      digestToolResult('checkBackendServices', {
        ...cleanPlumbing,
        dns: { clientsMeasured: 0, p50Ms: null },
      }),
    ]);
    expect(s.issues.some((i) => i.domain === DOMAIN.NAMING)).toBe(false);
  });

  it('flags associated clients with no address as an addressing issue', () => {
    const s = plumbingState([
      digestToolResult('checkBackendServices', {
        ...cleanPlumbing,
        dhcp: { associatedClients: 40, withoutIpv4: 7, share: 0.175 },
      }),
    ]);
    expect(s.clean).toBe(false);
    expect(s.issues[0].domain).toBe(DOMAIN.ADDRESSING);
  });
});

describe('classifyConfidence', () => {
  it('is INSUFFICIENT when nothing succeeded', () => {
    const g = buildEvidenceGraph([{ tool: 'diagnoseClient', ok: false }]);
    expect(classifyConfidence(g).level).toBe(CONFIDENCE.INSUFFICIENT);
  });

  it('is INSUFFICIENT — not healthy — when reads succeeded but no finding came back', () => {
    const g = buildEvidenceGraph([entry('checkBackendServices', cleanPlumbing)]);
    const c = classifyConfidence(g);
    expect(c.level).toBe(CONFIDENCE.INSUFFICIENT);
    expect(c.ceilings[0]).toMatch(/met expectations/);
  });

  it('caps an RF verdict at POSSIBLE when the plumbing preflight never ran', () => {
    // The single most expensive mistake in wireless: diagnosing RF first
    // because the complaint mentioned Wi-Fi.
    const g = buildEvidenceGraph([
      entry('diagnoseClient', {
        basis: 'observed',
        findings: [{ severity: 'critical', taxonomy: 'Coverage / Weak Signal' }],
      }),
    ]);
    const c = classifyConfidence(g);
    expect(c.level).toBe(CONFIDENCE.POSSIBLE);
    expect(c.ceilings.join(' ')).toMatch(/plumbing preflight was not run/i);
  });

  it('raises an RF verdict to HIGH once a clean preflight licenses it', () => {
    const g = buildEvidenceGraph([
      entry('checkBackendServices', cleanPlumbing),
      entry('diagnoseClient', {
        basis: 'observed',
        findings: [{ severity: 'critical', taxonomy: 'Coverage / Weak Signal' }],
      }),
    ]);
    const c = classifyConfidence(g);
    expect(c.level).toBe(CONFIDENCE.HIGH);
    expect(c.raised.join(' ')).toMatch(/preflight ran and was clean/i);
  });

  it('does not treat two reads of the same table as two agreeing sources', () => {
    const g = buildEvidenceGraph([
      entry('diagnoseClient', {
        findings: [{ severity: 'critical', taxonomy: 'Capacity / WiFi Interference' }],
      }),
      entry('getSiteOverview', {
        worstClients: [{ findings: [{ taxonomy: 'Capacity / WiFi Interference' }] }],
        clientsWithFindings: 6,
        scorableClients: 40,
      }),
    ]);
    expect(g.domains[0].independentSources).toBe(1);
  });

  it('CONFIRMS when the connection ladder localises the break', () => {
    const g = buildEvidenceGraph([
      entry('checkBackendServices', cleanPlumbing),
      entry('diagnoseClient', {
        findings: [{ severity: 'critical', taxonomy: 'DHCP / No Address' }],
        lifecycle: { lastSuccessfulStage: 'association', firstFailingStage: 'dhcp', failureDomain: 'DHCP' },
      }),
    ]);
    const c = classifyConfidence(g);
    expect(c.level).toBe(CONFIDENCE.CONFIRMED);
    expect(c.epistemic).toBe(EPISTEMIC.CONFIRMED_CAUSE);
  });

  it('a failed read clamps the level even when everything else agrees', () => {
    const g = buildEvidenceGraph([
      entry('checkBackendServices', cleanPlumbing),
      entry('diagnoseClient', {
        findings: [{ severity: 'critical', taxonomy: 'DHCP / No Address' }],
        lifecycle: { firstFailingStage: 'dhcp', failureDomain: 'DHCP' },
      }),
      { tool: 'getRfHealth', ok: false },
    ]);
    const c = classifyConfidence(g);
    // CONFIRMED would otherwise have been earned by the lifecycle stage.
    expect(c.level).toBe(CONFIDENCE.LIKELY);
    expect(c.ceilings.join(' ')).toMatch(/read\(s\) failed/);
  });

  it('a cohort below three cannot support a population claim', () => {
    const g = buildEvidenceGraph([
      entry('checkBackendServices', cleanPlumbing),
      entry('getSiteOverview', {
        clientsWithFindings: 4,
        scorableClients: 12,
        worstClients: [{ findings: [{ taxonomy: 'Coverage / Weak Signal' }] }],
      }),
      entry('compareClientToPeers', { peers: [{}, {}] }),
    ]);
    const c = classifyConfidence(g);
    expect(c.level).toBe(CONFIDENCE.POSSIBLE);
    expect(c.ceilings.join(' ')).toMatch(/cohort was 2/);
  });

  it('a capability gap caps confidence at LIKELY', () => {
    const g = buildEvidenceGraph([
      entry('checkBackendServices', cleanPlumbing),
      entry('diagnoseClient', {
        findings: [{ severity: 'critical', taxonomy: 'Coverage / Weak Signal' }],
        lifecycle: { firstFailingStage: 'rf', failureDomain: 'Coverage' },
      }),
      entry('getRfHealth', { basis: 'unknown', unavailable: true }),
    ]);
    expect(classifyConfidence(g).level).toBe(CONFIDENCE.LIKELY);
  });
});

describe('deriveImpact', () => {
  it('uses scorable clients as the denominator, not raw rows', () => {
    // Rows with placeholder signal values are not clients that are fine; they
    // are not measurements, and using them inflates the denominator.
    const impact = deriveImpact([
      digestToolResult('getSiteOverview', {
        clientsWithFindings: 13,
        scorableClients: 47,
        clientCount: 120,
      }),
    ]);
    expect(impact).toMatchObject({ affected: 13, total: 47, unit: 'clients' });
  });

  it('is null when nothing measured a population', () => {
    expect(deriveImpact([digestToolResult('getCapabilities', { basis: 'observed' })])).toBeNull();
  });
});

describe('cortexStandard', () => {
  const graph = buildEvidenceGraph([
    entry('checkBackendServices', cleanPlumbing),
    entry('diagnoseClient', {
      findings: [{ severity: 'critical', taxonomy: 'Coverage / Weak Signal' }],
    }),
    entry('getSiteOverview', { clientsWithFindings: 12, scorableClients: 47 }),
  ]);

  it('answers what/who/how-widespread from the graph', () => {
    const std = cortexStandard(graph);
    expect(std.whatIsWrong.answered).toBe(true);
    expect(std.whoIsAffected.value.affected).toBe(12);
    expect(std.howWidespread.value).toBe('12 of 47 clients');
  });

  it('marks onset as an API gap when no history source was read', () => {
    const std = cortexStandard(graph);
    expect(std.whenDidItStart.answered).toBe(false);
    expect(std.whenDidItStart.reason).toBe('api_gap');
    expect(std.whenDidItStart.detail).toMatch(/3-hour window/);
  });

  it('does not claim a fix worked when nothing was executed', () => {
    const std = cortexStandard(graph);
    expect(std.didTheFixWork.answered).toBe(false);
    expect(std.didTheFixWork.reason).toBe('not_applicable');
  });
});

describe('buildConfidenceBlock', () => {
  it('tells the model the level is the runtime\'s, not its own', () => {
    const graph = buildEvidenceGraph([
      entry('checkBackendServices', cleanPlumbing),
      entry('diagnoseClient', { findings: [{ severity: 'warning', taxonomy: 'Coverage / Weak Signal' }] }),
    ]);
    const block = buildConfidenceBlock(graph);
    expect(block).toMatch(/derived from the evidence ledger by the runtime, not by you/);
    expect(block).toMatch(/do not raise it/i);
  });

  it('is empty when there is no evidence to describe', () => {
    expect(buildConfidenceBlock(buildEvidenceGraph([]))).toBe('');
  });
});

describe('SOURCE_FAMILY covers every tool', () => {
  it('has an entry for each diagnostic tool', async () => {
    // Rule 2 of the contract: tools reading the same table are ONE source. A
    // tool with no entry falls back to `tool:<name>`, becomes its own family,
    // and silently manufactures corroboration — every verdict it agrees with
    // inflates. correlateProblem and reconcileConfiguration were both missing,
    // and correlateProblem reads the same MuTable as getSiteOverview.
    const { TOOL_ACTIVITY } = await import('./diagnosticTools.js');
    const missing = Object.keys(TOOL_ACTIVITY).filter((t) => !SOURCE_FAMILY[t]);
    expect(missing).toEqual([]);
  });

  it('keeps the two AURA-internal surfaces in the right families', () => {
    // Service levels are computed from the SAME monitoring samples the history
    // tools read, so they must not count as a second source.
    expect(SOURCE_FAMILY.getServiceLevels).toBe(SOURCE_FAMILY.getMetricHistory);
    // Sentinel actively probes RADIUS, DHCP and DNS itself rather than reading
    // Gateway telemetry, so it is genuinely independent and may corroborate.
    expect(SOURCE_FAMILY.getInfrastructureAlerts).toBe('infra-probe');
    expect(SOURCE_FAMILY.getInfrastructureAlerts).not.toBe(SOURCE_FAMILY.getSiteOverview);
  });
});
