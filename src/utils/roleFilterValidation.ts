export function buildDefaultL2Filter() {
  return {
    name: '',
    action: 'FILTERACTION_ALLOW' as const,
    macAddress: '',
  };
}

export function buildDefaultL3SrcDestFilter() {
  return {
    name: '',
    action: 'FILTERACTION_ALLOW' as const,
    cosId: null as string | null,
    srcIp: '',
    srcPort: 'any',
    dstIp: '',
    dstPort: 'any',
    protocol: 'any',
  };
}
