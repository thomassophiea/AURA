/**
 * 802.11 Reason and Status Code Interpretations
 *
 * These codes are defined in IEEE 802.11 standard and are used
 * by wireless clients and APs to communicate disconnection reasons
 * and association status.
 */

/**
 * 802.11 Reason Codes (used in Deauthentication and Disassociation frames)
 */
export const REASON_CODES: Record<number, { short: string; description: string; severity: 'info' | 'warning' | 'error' }> = {
  0: { short: 'Reserved', description: 'Reserved reason code', severity: 'info' },
  1: { short: 'Unspecified', description: 'Unspecified reason', severity: 'warning' },
  2: { short: 'Auth Invalid', description: 'Previous authentication no longer valid', severity: 'warning' },
  3: { short: 'Leaving BSS', description: 'Station is leaving (or has left) the BSS', severity: 'info' },
  4: { short: 'Inactivity', description: 'Disassociated due to inactivity', severity: 'info' },
  5: { short: 'AP Overloaded', description: 'AP is unable to handle all associated stations', severity: 'warning' },
  6: { short: 'Class 2 Error', description: 'Class 2 frame received from non-authenticated station', severity: 'error' },
  7: { short: 'Class 3 Error', description: 'Class 3 frame received from non-associated station', severity: 'error' },
  8: { short: 'Left BSS', description: 'Disassociated because station is leaving BSS', severity: 'info' },
  9: { short: 'Not Authenticated', description: 'Station not authenticated with responding station', severity: 'warning' },
  10: { short: 'Power Cap Invalid', description: 'Disassociated - power capability unacceptable', severity: 'warning' },
  11: { short: 'Channel Invalid', description: 'Disassociated - supported channels unacceptable', severity: 'warning' },
  12: { short: 'Reserved', description: 'Reserved', severity: 'info' },
  13: { short: 'Invalid IE', description: 'Invalid information element', severity: 'error' },
  14: { short: 'MIC Failure', description: 'Message integrity code (MIC) failure', severity: 'error' },
  15: { short: '4-Way Timeout', description: '4-way handshake timeout', severity: 'error' },
  16: { short: 'Group Key Timeout', description: 'Group key handshake timeout', severity: 'error' },
  17: { short: 'IE Mismatch', description: 'Information element in 4-way handshake different from association', severity: 'error' },
  18: { short: 'Group Cipher Invalid', description: 'Invalid group cipher', severity: 'error' },
  19: { short: 'Pairwise Cipher Invalid', description: 'Invalid pairwise cipher', severity: 'error' },
  20: { short: 'AKMP Invalid', description: 'Invalid AKMP (authentication and key management protocol)', severity: 'error' },
  21: { short: 'RSN Version Unsupported', description: 'Unsupported RSN information element version', severity: 'error' },
  22: { short: 'RSN Cap Invalid', description: 'Invalid RSN information element capabilities', severity: 'error' },
  23: { short: '802.1X Auth Failed', description: 'IEEE 802.1X authentication failed', severity: 'error' },
  24: { short: 'Cipher Rejected', description: 'Cipher suite rejected due to security policy', severity: 'error' },
  25: { short: 'TDLS Teardown Unreachable', description: 'TDLS direct-link teardown - unreachable', severity: 'info' },
  26: { short: 'TDLS Teardown Unspecified', description: 'TDLS direct-link teardown - unspecified', severity: 'info' },
  27: { short: 'SSP Requested', description: 'Disassociated - SSP requested', severity: 'info' },
  28: { short: 'No SSP RSNIE', description: 'No SSP roaming agreement RSNIE', severity: 'warning' },
  29: { short: 'Bad SSP Cipher', description: 'Bad SSP cipher or AKMP', severity: 'error' },
  30: { short: 'Not Authorized', description: 'Station not authorized on this location', severity: 'warning' },
  31: { short: 'Service Change Precluded', description: 'Service change precludes TS', severity: 'warning' },
  32: { short: 'Unspecified QoS', description: 'Unspecified QoS-related reason', severity: 'warning' },
  33: { short: 'Insufficient Bandwidth', description: 'QAP lacks sufficient bandwidth for this QSTA', severity: 'warning' },
  34: { short: 'Excessive Missing ACKs', description: 'Too many frames lost due to poor channel conditions', severity: 'error' },
  35: { short: 'TXOP Limit Exceeded', description: 'QSTA is transmitting outside TXOPs', severity: 'warning' },
  36: { short: 'STA Leaving', description: 'Requested from peer QSTA - leaving QBSS', severity: 'info' },
  37: { short: 'STA No Longer Using', description: 'Requested from peer QSTA - mechanism no longer used', severity: 'info' },
  38: { short: 'Setup Required', description: 'Requested from peer - setup required', severity: 'info' },
  39: { short: 'Timeout', description: 'Requested from peer - timeout', severity: 'warning' },
  40: { short: 'Cipher Unsupported', description: 'Peer QSTA does not support cipher suite', severity: 'error' },
  45: { short: 'PMK R0 Rejected', description: 'Peerkey handshake rejected - PMK R0 not available', severity: 'error' },
  46: { short: 'TDLS Channel Switch', description: 'TDLS channel switch prohibited', severity: 'info' },
  47: { short: 'Not Authorized', description: 'Station not authorized to perform operation', severity: 'warning' },
  52: { short: 'Session Timeout', description: '802.1X session timeout', severity: 'info' },
  65535: { short: 'Vendor Specific', description: 'Vendor-specific reason code', severity: 'info' },
};

/**
 * 802.11 Status Codes (used in Authentication and Association response frames)
 */
export const STATUS_CODES: Record<number, { short: string; description: string; severity: 'success' | 'warning' | 'error' }> = {
  0: { short: 'Success', description: 'Successful', severity: 'success' },
  1: { short: 'Unspecified Failure', description: 'Unspecified failure', severity: 'error' },
  2: { short: 'TDLS Wakeup Rejected', description: 'TDLS wakeup schedule rejected', severity: 'warning' },
  3: { short: 'TDLS Wakeup Alternate', description: 'TDLS wakeup schedule rejected - alternate provided', severity: 'warning' },
  5: { short: 'Security Disabled', description: 'Security disabled', severity: 'warning' },
  6: { short: 'Lifetime Unacceptable', description: 'Unacceptable lifetime', severity: 'warning' },
  7: { short: 'Not Same BSS', description: 'Not in same BSS', severity: 'warning' },
  10: { short: 'Capabilities Mismatch', description: 'Cannot support all requested capabilities', severity: 'warning' },
  11: { short: 'Reassoc Denied', description: 'Reassociation denied - unable to confirm association exists', severity: 'error' },
  12: { short: 'Assoc Denied', description: 'Association denied - reason outside scope of standard', severity: 'error' },
  13: { short: 'Auth Algorithm', description: 'Responding station does not support authentication algorithm', severity: 'error' },
  14: { short: 'Auth Sequence', description: 'Authentication rejected - unexpected auth transaction sequence', severity: 'error' },
  15: { short: 'Auth Challenge', description: 'Authentication rejected - challenge failure', severity: 'error' },
  16: { short: 'Auth Timeout', description: 'Authentication rejected - timeout waiting for next frame', severity: 'error' },
  17: { short: 'Assoc AP Full', description: 'Association denied - AP unable to handle more stations', severity: 'warning' },
  18: { short: 'Rate Mismatch', description: 'Association denied - station does not support required rates', severity: 'error' },
  19: { short: 'Short Preamble', description: 'Association denied - station does not support short preamble', severity: 'warning' },
  20: { short: 'PBCC', description: 'Association denied - station does not support PBCC modulation', severity: 'warning' },
  21: { short: 'Channel Agility', description: 'Association denied - station does not support Channel Agility', severity: 'warning' },
  22: { short: 'Spectrum Mgmt', description: 'Association rejected - Spectrum Management required', severity: 'warning' },
  23: { short: 'Power Cap', description: 'Association rejected - power capability unacceptable', severity: 'warning' },
  24: { short: 'Channels', description: 'Association rejected - supported channels unacceptable', severity: 'warning' },
  25: { short: 'Short Slot', description: 'Association denied - station does not support short slot time', severity: 'warning' },
  26: { short: 'DSSS-OFDM', description: 'Association denied - station does not support DSSS-OFDM', severity: 'warning' },
  27: { short: 'No HT Support', description: 'Association denied - station does not support HT', severity: 'warning' },
  28: { short: 'PCO Transition', description: 'R0KH unreachable', severity: 'error' },
  29: { short: 'PCO Required', description: 'Association denied - PCO transition time not supported', severity: 'warning' },
  30: { short: 'Rejected Temporarily', description: 'Association denied temporarily - try again later', severity: 'warning' },
  31: { short: 'MFP Violation', description: 'Robust Management frame policy violation', severity: 'error' },
  32: { short: 'Unspecified QoS', description: 'Unspecified QoS failure', severity: 'error' },
  33: { short: 'Insufficient Bandwidth', description: 'Association denied - insufficient bandwidth for QoS', severity: 'warning' },
  34: { short: 'Poor Channel', description: 'Association denied - poor channel conditions', severity: 'warning' },
  35: { short: 'QoS Not Supported', description: 'Association denied - station does not support QoS', severity: 'warning' },
  37: { short: 'Request Declined', description: 'Request has been declined', severity: 'error' },
  38: { short: 'Invalid Parameters', description: 'Request unsuccessful - invalid parameters', severity: 'error' },
  39: { short: 'TS Rejected', description: 'TS not created - request cannot be honored', severity: 'error' },
  40: { short: 'Invalid IE', description: 'Invalid information element', severity: 'error' },
  41: { short: 'Group Cipher Invalid', description: 'Invalid group cipher', severity: 'error' },
  42: { short: 'Pairwise Cipher Invalid', description: 'Invalid pairwise cipher', severity: 'error' },
  43: { short: 'AKMP Invalid', description: 'Invalid AKMP', severity: 'error' },
  44: { short: 'RSN Version', description: 'Unsupported RSN version', severity: 'error' },
  45: { short: 'RSN Capabilities', description: 'Invalid RSN capabilities', severity: 'error' },
  46: { short: 'Cipher Rejected', description: 'Cipher suite rejected - security policy', severity: 'error' },
  47: { short: 'TS Pending', description: 'TS schedule conflict', severity: 'warning' },
  48: { short: 'DLS Not Allowed', description: 'Direct link not allowed in BSS', severity: 'warning' },
  49: { short: 'Dest Not Present', description: 'Destination STA not present in BSS', severity: 'warning' },
  50: { short: 'Dest Not QoS', description: 'Destination STA is not a QoS STA', severity: 'warning' },
  51: { short: 'Listen Interval', description: 'Association denied - listen interval too large', severity: 'warning' },
  52: { short: 'FT Invalid', description: 'Invalid FT action frame count', severity: 'error' },
  53: { short: 'PMKID Invalid', description: 'Invalid PMKID', severity: 'error' },
  54: { short: 'MDE Invalid', description: 'Invalid MDE', severity: 'error' },
  55: { short: 'FTE Invalid', description: 'Invalid FTE', severity: 'error' },
  72: { short: 'No VHT Support', description: 'Association denied - station does not support VHT', severity: 'warning' },
  77: { short: 'Denied PSK', description: 'Denied due to external password failure', severity: 'error' },
  92: { short: 'No HE Support', description: 'Association denied - station does not support HE (Wi-Fi 6)', severity: 'warning' },
};

/**
 * Get human-readable reason code interpretation
 */
export function getReasonCodeInfo(code: number | undefined | null): { short: string; description: string; severity: 'info' | 'warning' | 'error' } | null {
  if (code === undefined || code === null) return null;
  return REASON_CODES[code] || { short: `Code ${code}`, description: `Unknown reason code: ${code}`, severity: 'warning' };
}

/**
 * Get human-readable status code interpretation
 */
export function getStatusCodeInfo(code: number | undefined | null): { short: string; description: string; severity: 'success' | 'warning' | 'error' } | null {
  if (code === undefined || code === null) return null;
  return STATUS_CODES[code] || { short: `Code ${code}`, description: `Unknown status code: ${code}`, severity: 'warning' };
}

/**
 * Determine if a reason code indicates a failure/error condition
 */
export function isFailureReasonCode(code: number | undefined | null): boolean {
  if (code === undefined || code === null) return false;
  const info = REASON_CODES[code];
  if (!info) return false;
  return info.severity === 'error';
}

/**
 * Determine if a status code indicates a failure/error condition
 */
export function isFailureStatusCode(code: number | undefined | null): boolean {
  if (code === undefined || code === null) return false;
  // Status code 0 is success, anything else is a failure
  return code !== 0;
}

/**
 * Common roaming issue patterns
 */
export const ROAMING_ISSUES = {
  PING_PONG: 'ping-pong',
  STICKY_CLIENT: 'sticky-client',
  LATE_ROAM: 'late-roam',
  AUTH_FAILURE: 'auth-failure',
  POOR_HANDOFF: 'poor-handoff',
  BAND_BOUNCE: 'band-bounce',
  INTERBAND_ROAM: 'interband-roam',
} as const;

export type RoamingIssue = typeof ROAMING_ISSUES[keyof typeof ROAMING_ISSUES];

/**
 * Issue descriptions for display
 */
export const ISSUE_DESCRIPTIONS: Record<RoamingIssue, { title: string; description: string; severity: 'info' | 'warning' | 'error' }> = {
  [ROAMING_ISSUES.PING_PONG]: {
    title: 'Ping-Pong Roaming',
    description: 'Client is rapidly switching between APs, indicating coverage overlap issues or misconfigured roaming thresholds',
    severity: 'warning',
  },
  [ROAMING_ISSUES.STICKY_CLIENT]: {
    title: 'Sticky Client',
    description: 'Client stayed connected to AP with poor signal instead of roaming to a better AP',
    severity: 'warning',
  },
  [ROAMING_ISSUES.LATE_ROAM]: {
    title: 'Late Roaming',
    description: 'Client roamed at very weak signal level (below -75 dBm), indicating delayed roaming decision',
    severity: 'warning',
  },
  [ROAMING_ISSUES.AUTH_FAILURE]: {
    title: 'Authentication Failure',
    description: 'Client failed to authenticate during roaming attempt',
    severity: 'error',
  },
  [ROAMING_ISSUES.POOR_HANDOFF]: {
    title: 'Poor Handoff',
    description: 'Roaming completed but signal quality degraded significantly',
    severity: 'warning',
  },
  [ROAMING_ISSUES.BAND_BOUNCE]: {
    title: 'Band Bounce',
    description: 'Client is frequently switching between frequency bands (2.4/5/6 GHz)',
    severity: 'info',
  },
  [ROAMING_ISSUES.INTERBAND_ROAM]: {
    title: 'Interband Roaming',
    description: 'Client changed frequency bands on the same access point. This indicates band steering issues, poor 5GHz coverage, or interference causing the client to fall back to a less optimal band.',
    severity: 'error',
  },
};
