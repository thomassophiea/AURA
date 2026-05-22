import { Router, json as expressJson } from 'express';
import { fetchXcc } from './xccClient.js';
import { validateVlanExists } from './vlanValidator.js';
import { validateDhcp } from './dhcpValidator.js';
import { resolveLldpForVlan } from './lldpTopologyResolver.js';
import { analyzeRfCapacity } from './rfCapacityAnalyzer.js';
import { aggregateConfidence } from './confidenceAggregator.js';
import { driftMonitor } from './driftMonitor.js';
import { rollbackEngine } from './rollbackEngine.js';

function getOpts(req, fetchFn) {
  return {
    authToken: req.headers['x-controller-auth'] ?? req.headers['authorization'] ?? null,
    controllerUrl: req.headers['x-controller-url'] ?? process.env.CAMPUS_CONTROLLER_URL ?? '',
    fetchFn: fetchFn ?? undefined,
  };
}

function apSerial(ap) {
  return ap.apSerialNum ?? ap.serialNumber ?? ap.id;
}

function toArray(val) {
  return Array.isArray(val?.data) ? val.data : Array.isArray(val) ? val : [];
}

export function createValidationRouter({ fetchFn } = {}) {
  const router = Router();
  const jsonBody = expressJson();

  // POST /validate/intent — full pre-provision validation
  router.post('/validate/intent', jsonBody, async (req, res) => {
    const { intent } = req.body ?? {};
    if (!Number.isInteger(intent?.vlan)) {
      return res.status(400).json({ error: 'intent.vlan must be an integer' });
    }

    const opts = getOpts(req, fetchFn);
    const checks = [];
    const multipliers = {};

    try {
      // Parallel fetch: topologies and APs
      const [topologies, aps] = await Promise.all([
        fetchXcc('/v1/topologies', opts),
        fetchXcc('/v1/aps', opts),
      ]);

      // Step a: VLAN exists check
      const vlanResult = validateVlanExists(topologies, intent.vlan);
      checks.push({ name: 'vlan_exists', result: vlanResult.result, evidence: vlanResult.evidence });

      // Step b: DHCP check if topology found
      if (vlanResult.topology) {
        const dhcpResult = validateDhcp(vlanResult.topology);
        checks.push({ name: 'dhcp_scope', result: dhcpResult.result, evidence: dhcpResult.evidence });
      }

      // Step c: LLDP switch trunk check
      try {
        const apList = toArray(aps).slice(0, 15);

        const lldpByAp = await Promise.all(
          apList.map(async (ap) => {
            const serial = apSerial(ap);
            try {
              const neighbors = await fetchXcc(`/v1/aps/${encodeURIComponent(serial)}/lldp`, opts);
              return { apSerial: serial, neighbors: Array.isArray(neighbors) ? neighbors : [] };
            } catch {
              return { apSerial: serial, neighbors: [] };
            }
          }),
        );

        const trunkResult = resolveLldpForVlan(lldpByAp, intent.vlan);
        checks.push({ name: 'switch_trunk', result: trunkResult.result, evidence: trunkResult.evidence });

        const trunkedCount = lldpByAp.filter(({ neighbors }) =>
          neighbors.some((n) => {
            const tagged = n.vlanMembership?.tagged ?? [];
            const untagged = n.vlanMembership?.untagged ?? [];
            return tagged.includes(intent.vlan) || untagged.includes(intent.vlan);
          }),
        ).length;

        if (trunkedCount >= 3) {
          multipliers.operationalPattern = true;
        }
      } catch (err) {
        console.warn('[ValidationEngine] LLDP step failed:', err.message);
        checks.push({
          name: 'switch_trunk',
          result: 'warn',
          evidence: `LLDP unavailable: ${err.message}`,
        });
      }

      // Step d: RF capacity check
      try {
        const profiles = await fetchXcc('/v3/profiles', opts);
        const profileList = toArray(profiles);
        const { ssidResult, bandResult } = analyzeRfCapacity(profileList, intent.security);
        checks.push({ name: 'ssid_count_limit', result: ssidResult.result, evidence: ssidResult.evidence });
        checks.push({ name: 'band_compatibility', result: bandResult.result, evidence: bandResult.evidence });
      } catch (err) {
        console.warn('[ValidationEngine] RF capacity step failed:', err.message);
        // Continue without these checks
      }

      // Step e: Aggregate confidence
      const confidence = aggregateConfidence(checks, multipliers);

      // Wire drift monitor with current credentials (no-op until startPolling is called)
      driftMonitor.configure(opts);

      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const provisioningToken = `vtok_${Date.now().toString(36)}`;
      const recommendation =
        confidence.band === 'HIGH'
          ? 'Infrastructure validated. Proceed with provisioning.'
          : confidence.band === 'MEDIUM'
          ? 'Can provision with approval. Review warnings before proceeding.'
          : 'Provisioning blocked. Resolve issues before retrying.';

      return res.json({
        intent,
        checks,
        confidence,
        recommendation,
        provisioningToken,
        expiresAt,
      });
    } catch (err) {
      console.error('[ValidationEngine] Controller unreachable:', err.message);
      return res.json({
        intent,
        checks: [],
        confidence: { score: 0, band: 'LOW', blockingFailures: [], warnings: ['Controller unreachable: ' + err.message] },
        recommendation: 'Provisioning blocked. Controller is unreachable.',
        provisioningToken: null,
        expiresAt: null,
      });
    }
  });

  // GET /validate/vlan/:vlanId — single VLAN + DHCP check
  router.get('/validate/vlan/:vlanId', async (req, res) => {
    const vlanId = Number(req.params.vlanId);
    if (!Number.isInteger(vlanId)) {
      return res.status(400).json({ error: 'vlanId must be an integer' });
    }

    const opts = getOpts(req, fetchFn);
    try {
      const topologies = await fetchXcc('/v1/topologies', opts);
      const vlanResult = validateVlanExists(topologies, vlanId);
      const dhcp = vlanResult.topology ? validateDhcp(vlanResult.topology) : null;
      return res.json({ ...vlanResult, dhcp });
    } catch (err) {
      return res.status(503).json({ error: err.message });
    }
  });

  // GET /validate/topology — LLDP topology snapshot
  router.get('/validate/topology', async (req, res) => {
    const opts = getOpts(req, fetchFn);
    try {
      const aps = await fetchXcc('/v1/aps', opts);
      const apList = toArray(aps).slice(0, 15);

      const lldp = await Promise.all(
        apList.map(async (ap) => {
          const serial = apSerial(ap);
          try {
            const neighbors = await fetchXcc(`/v1/aps/${encodeURIComponent(serial)}/lldp`, opts);
            return { apSerial: serial, neighbors: Array.isArray(neighbors) ? neighbors : [] };
          } catch {
            return { apSerial: serial, neighbors: [], error: 'lldp_fetch_failed' };
          }
        }),
      );

      return res.json({ lldp, timestamp: new Date().toISOString() });
    } catch (err) {
      return res.status(503).json({ error: err.message });
    }
  });

  // GET /drift — return current drift alerts + status
  router.get('/drift', (_req, res) => {
    res.json({
      alerts: driftMonitor.getAlerts(),
      status: driftMonitor.getStatus(),
    });
  });

  // DELETE /drift — clear drift alerts
  router.delete('/drift', (_req, res) => {
    driftMonitor.clearAlerts();
    return res.json({ cleared: true });
  });

  // POST /rollback/:auditId — return snapshot for rollback
  router.post('/rollback/:auditId', jsonBody, (req, res) => {
    const snap = rollbackEngine.get(req.params.auditId);
    if (!snap) {
      return res.status(404).json({ error: 'No snapshot found for auditId' });
    }
    return res.json({ auditId: req.params.auditId, snapshot: snap });
  });

  return router;
}
