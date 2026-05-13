export function scoreConfidence(evidence, rootCause) {
  const hasClientData = evidence.client && Object.values(evidence.client).some(v => v != null);
  const hasApData = evidence.ap && Object.values(evidence.ap).some(v => v != null);
  const hasEvents = (evidence.events ?? []).length > 0;
  const hasSmartRf = !!evidence.smartRf;
  const missingCount = (evidence.missingData ?? []).length;
  const dataPoints = [hasClientData, hasApData, hasEvents, hasSmartRf].filter(Boolean).length;

  if (rootCause.category === 'UNKNOWN') {
    if (dataPoints === 0 || missingCount >= 3) return 'Low';
    return 'Medium';
  }

  // Known root cause — score by data completeness
  let score = 2; // base for known category
  score += dataPoints;
  score -= Math.min(missingCount, 2);

  if (score >= 4) return 'High';
  if (score >= 2) return 'Medium';
  return 'Low';
}
