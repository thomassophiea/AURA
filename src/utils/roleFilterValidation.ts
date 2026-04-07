export interface L2Filter {
  name: string;
  action: 'FILTERACTION_ALLOW' | 'FILTERACTION_DENY';
  macAddress: string;
}

export interface L3SrcDestFilter {
  name: string;
  action: 'FILTERACTION_ALLOW' | 'FILTERACTION_DENY';
  cosId: string | null;
  srcIp: string;
  srcPort: string;
  dstIp: string;
  dstPort: string;
  protocol: string;
}

export function buildDefaultL2Filter(): L2Filter {
  return {
    name: '',
    action: 'FILTERACTION_ALLOW',
    macAddress: '',
  };
}

export function buildDefaultL3SrcDestFilter(): L3SrcDestFilter {
  return {
    name: '',
    action: 'FILTERACTION_ALLOW',
    cosId: null,
    srcIp: '',
    srcPort: 'any',
    dstIp: '',
    dstPort: 'any',
    protocol: 'any',
  };
}
