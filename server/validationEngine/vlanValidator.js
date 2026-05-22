export function validateVlanExists(topologies, vlanId) {
  if (!Array.isArray(topologies)) {
    return {
      result: 'fail',
      topology: null,
      evidence: 'GET /v1/topologies → response is not an array',
    };
  }
  const match = topologies.find(t => t.vlanid === vlanId);
  if (!match) {
    return {
      result: 'fail',
      topology: null,
      evidence: `GET /v1/topologies → no topology with vlanid=${vlanId} (${topologies.length} checked)`,
    };
  }
  return {
    result: 'pass',
    topology: match,
    evidence: `GET /v1/topologies → id=${match.id} name='${match.name}' vlanid=${match.vlanid}`,
  };
}
