const SIX_GHZ = /6\s*ghz/i;

export function analyzeRfCapacity(profiles, targetSecurity) {
  const ssidCounts = [];
  let bandWarned = false;

  for (const profile of profiles ?? []) {
    // Count SSIDs per radio index
    const perRadio = {};
    for (const entry of profile.radioIfList ?? []) {
      perRadio[entry.index] = (perRadio[entry.index] ?? 0) + 1;
    }
    const maxSsids = Object.values(perRadio).length > 0 ? Math.max(...Object.values(perRadio)) : 0;
    ssidCounts.push({ name: profile.name, maxSsids });

    // Band compatibility: WPA2-PSK on 6 GHz is silently dropped (gotchas.md)
    if (!bandWarned && targetSecurity === 'WPA2-PSK') {
      for (const radio of profile.radios ?? []) {
        if (SIX_GHZ.test(radio.radioName ?? '')) {
          bandWarned = true;
          break;
        }
      }
    }
  }

  // SSID count result
  const blockedProfiles = ssidCounts.filter(p => p.maxSsids >= 8);
  const warnProfiles = ssidCounts.filter(p => p.maxSsids === 7);

  let ssidResult;
  if (blockedProfiles.length > 0) {
    ssidResult = {
      result: 'block',
      evidence: `${blockedProfiles.length} profile(s) at 8/8 SSIDs/radio: ${blockedProfiles.map(p => p.name).join(', ')}`,
    };
  } else if (warnProfiles.length > 0) {
    ssidResult = {
      result: 'warn',
      evidence: `${warnProfiles.length} profile(s) at 7/8 SSIDs/radio: ${warnProfiles.map(p => p.name).join(', ')}`,
    };
  } else {
    const avg = ssidCounts.length > 0
      ? (ssidCounts.reduce((s, p) => s + p.maxSsids, 0) / ssidCounts.length).toFixed(1)
      : 0;
    ssidResult = {
      result: 'pass',
      evidence: `${ssidCounts.length} profile(s) checked; avg ${avg} SSIDs/radio`,
    };
  }

  const bandResult = bandWarned
    ? { result: 'warn', evidence: 'WPA2-PSK on a 6 GHz radio will be silently dropped (gotchas.md §Profile/radio binding)' }
    : { result: 'pass', evidence: 'Band/security compatibility OK' };

  return { ssidResult, bandResult };
}
