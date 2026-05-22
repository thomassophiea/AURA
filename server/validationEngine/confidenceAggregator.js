const CONTRIBUTIONS = {
  vlan_exists: { pass: 15, warn: 0, fail: -25, blocking: true },
  dhcp_scope: { pass: 10, warn: 2, fail: -15, blocking: false },
  switch_trunk: { pass: 12, warn: 2, fail: -10, blocking: false },
  ap_model_support: { pass: 8, warn: 0, fail: -20, blocking: true },
  ssid_count_limit: { pass: 8, warn: 3, fail: -20, blocking: true },
  rf_capacity: { pass: 5, warn: 2, fail: -5, blocking: false },
  band_compatibility: { pass: 5, warn: 0, fail: -8, blocking: false },
};

export function aggregateConfidence(checks, multipliers = {}) {
  // Hard limit: any 'block' result → BLOCK immediately
  const hardBlocks = checks.filter(c => c.result === 'block');
  if (hardBlocks.length > 0) {
    return {
      score: 0,
      band: 'BLOCK',
      blockingFailures: hardBlocks.map(c => c.name),
      warnings: [],
    };
  }

  let score = 50;
  const warnings = [];

  for (const check of checks) {
    const contrib = CONTRIBUTIONS[check.name];
    if (!contrib) continue;
    score += contrib[check.result] ?? 0;
    if (check.result === 'warn') warnings.push(check.name);
  }

  // Blocking check gate: cap at 40 if any blocking check failed
  const blockingFailures = checks
    .filter(c => CONTRIBUTIONS[c.name]?.blocking && c.result === 'fail')
    .map(c => c.name);

  if (blockingFailures.length > 0) {
    return { score: 40, band: 'LOW', blockingFailures, warnings };
  }

  // Multipliers (only when no blocking failures)
  if (multipliers.operationalPattern) score *= 1.20;
  if (multipliers.identicalService) score *= 1.10;

  score = Math.min(100, Math.round(score));
  const band = score >= 80 ? 'HIGH' : score >= 60 ? 'MEDIUM' : 'LOW';

  return { score, band, blockingFailures: [], warnings };
}
