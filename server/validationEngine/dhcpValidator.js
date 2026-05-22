export function validateDhcp(topology) {
  if (!topology) {
    return { result: 'fail', evidence: 'No topology provided for DHCP check' };
  }
  const { name, dhcpMode, dhcpServers } = topology;
  if (!dhcpMode || dhcpMode === 'DHCPNone') {
    return {
      result: 'warn',
      evidence: `topology '${name}': dhcpMode=${dhcpMode ?? 'unset'} — no DHCP configured on this VLAN`,
    };
  }
  if (dhcpMode === 'DHCPRelay' && (!dhcpServers || String(dhcpServers).trim() === '')) {
    return {
      result: 'warn',
      evidence: `topology '${name}': dhcpMode=DHCPRelay but dhcpServers is empty`,
    };
  }
  return {
    result: 'pass',
    evidence: `topology '${name}': dhcpMode=${dhcpMode} dhcpServers='${dhcpServers ?? 'local'}'`,
  };
}
