export function resolveLldpForVlan(lldpByAp, vlanId) {
  if (!lldpByAp?.length) {
    return { result: 'warn', affectedAps: [], evidence: 'No LLDP data available for any AP' };
  }

  const failing = [];
  const indeterminate = [];

  for (const { apSerial, neighbors } of lldpByAp) {
    const active = (neighbors ?? []).filter(n => n.systemName || n.switchPort);
    if (!active.length) {
      indeterminate.push(`${apSerial}:no-neighbors`);
      continue;
    }
    const neighbor = active[0]; // check primary uplink neighbor
    if (!neighbor.vlanMembership) {
      // Extreme Switch Engine 4220 — never expose VLAN membership via LLDP
      indeterminate.push(`${apSerial}:no-vlanMembership`);
      continue;
    }
    const tagged = Array.isArray(neighbor.vlanMembership.tagged) ? neighbor.vlanMembership.tagged : [];
    const untagged = Array.isArray(neighbor.vlanMembership.untagged) ? neighbor.vlanMembership.untagged : [];
    if (!tagged.includes(vlanId) && !untagged.includes(vlanId)) {
      failing.push(`${apSerial}(port:${neighbor.switchPort})`);
    }
  }

  const total = lldpByAp.length;
  if (failing.length >= Math.ceil(total / 2)) {
    return {
      result: 'fail',
      affectedAps: failing,
      evidence: `${failing.length}/${total} APs missing VLAN ${vlanId} on uplink trunk: ${failing.join(', ')}`,
    };
  }
  if (failing.length > 0 || indeterminate.length > 0) {
    const affected = [...failing, ...indeterminate];
    return {
      result: 'warn',
      affectedAps: affected,
      evidence: `VLAN ${vlanId} trunk: ${failing.length} failing, ${indeterminate.length} indeterminate of ${total} APs`,
    };
  }
  return {
    result: 'pass',
    affectedAps: [],
    evidence: `All ${total} APs confirmed VLAN ${vlanId} on uplink trunks`,
  };
}
