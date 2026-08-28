/**
 * AP firmware consistency check.
 *
 * A hardware type running mixed software versions is how sites drift into
 * "works on this AP, not that one" tickets. /v1/aps carries softwareVersion
 * and hardwareType for every AP, so this check groups by hardware type and
 * warns when a type runs more than one version.
 */

import { fetchXcc } from '../../validationEngine/xccClient.js';

function toArray(val) {
  return Array.isArray(val?.data) ? val.data : Array.isArray(val) ? val : [];
}

export async function runFirmwareConsistencyCheck(opts) {
  const aps = toArray(await fetchXcc('/v1/aps', opts));

  // hardwareType -> version -> [apName]
  const byType = new Map();
  for (const ap of aps) {
    const type = ap.hardwareType ?? ap.platformName ?? 'Unknown';
    const version = ap.softwareVersion ?? 'unknown';
    const name = ap.apName ?? ap.hostname ?? ap.serialNumber ?? 'unknown AP';
    if (!byType.has(type)) byType.set(type, new Map());
    const versions = byType.get(type);
    if (!versions.has(version)) versions.set(version, []);
    versions.get(version).push(name);
  }

  const alerts = [];
  const distribution = [];

  for (const [type, versions] of byType) {
    for (const [version, names] of versions) {
      distribution.push({ hardwareType: type, version, apCount: names.length, aps: names.join(', ') });
    }
    if (versions.size > 1) {
      // The minority version(s) are the drift; name them explicitly.
      const sorted = [...versions.entries()].sort((a, b) => b[1].length - a[1].length);
      const [majorityVersion] = sorted[0];
      const outliers = sorted
        .slice(1)
        .map(([v, names]) => `${names.join(', ')} on ${v}`)
        .join('; ');
      alerts.push({
        id: `firmware_consistency:${type}`,
        severity: 'warning',
        checkName: 'firmware_consistency',
        message: `${type} APs run ${versions.size} different firmware versions — majority on ${majorityVersion}; ${outliers}`,
        target: type,
        context: {
          hardwareType: type,
          versions: [...versions.keys()],
          majorityVersion,
        },
      });
    }
  }

  distribution.sort(
    (a, b) => a.hardwareType.localeCompare(b.hardwareType) || a.version.localeCompare(b.version)
  );

  const mixedTypes = alerts.length;
  const evidence = {
    distribution,
    summary:
      aps.length === 0
        ? 'No APs found to compare.'
        : mixedTypes === 0
          ? `${aps.length} AP(s) across ${byType.size} hardware type(s) — every type on a single firmware version.`
          : `${mixedTypes} hardware type(s) running mixed firmware across ${aps.length} AP(s).`,
  };

  return { alerts, evidence };
}
