export type RootCauseCategory =
  | 'CLIENT_SPECIFIC'
  | 'COVERAGE'
  | 'RF_CONGESTION'
  | 'INTERFERENCE'
  | 'ROAMING'
  | 'AUTHENTICATION'
  | 'DHCP_OR_VLAN'
  | 'AP_INFRASTRUCTURE'
  | 'WLAN_CONFIG'
  | 'SITE_SYSTEMIC'
  | 'UNKNOWN';

export interface CortexWirelessAnswer {
  id: string;
  question: string;
  narrative: string;
  rootCause: { category: RootCauseCategory; explanation: string };
  confidence: 'High' | 'Medium' | 'Low';
  apiEvidenceUsed: string[];
  followUpChips: string[];
  requiresConfirmation?: { action: string; description: string; confirmationToken: string };
  missingData?: string[];
}

export const ROOT_CAUSE_LABELS: Record<RootCauseCategory, string> = {
  CLIENT_SPECIFIC: 'Client-Specific Issue',
  COVERAGE: 'Coverage Gap',
  RF_CONGESTION: 'RF Congestion',
  INTERFERENCE: 'RF Interference',
  ROAMING: 'Roaming Issue',
  AUTHENTICATION: 'Authentication Failure',
  DHCP_OR_VLAN: 'DHCP / VLAN Issue',
  AP_INFRASTRUCTURE: 'AP Infrastructure',
  WLAN_CONFIG: 'WLAN Configuration',
  SITE_SYSTEMIC: 'Site-Wide Issue',
  UNKNOWN: 'Unknown',
};

export const ROOT_CAUSE_COLORS: Record<RootCauseCategory, string> = {
  CLIENT_SPECIFIC: 'bg-blue-900/60 text-blue-300',
  COVERAGE: 'bg-orange-900/60 text-orange-300',
  RF_CONGESTION: 'bg-yellow-900/60 text-yellow-300',
  INTERFERENCE: 'bg-yellow-900/60 text-yellow-300',
  ROAMING: 'bg-purple-900/60 text-purple-300',
  AUTHENTICATION: 'bg-red-900/60 text-red-300',
  DHCP_OR_VLAN: 'bg-red-900/60 text-red-300',
  AP_INFRASTRUCTURE: 'bg-red-900/60 text-red-300',
  WLAN_CONFIG: 'bg-pink-900/60 text-pink-300',
  SITE_SYSTEMIC: 'bg-red-900/60 text-red-300',
  UNKNOWN: 'bg-white/10 text-white/50',
};

export const CONFIDENCE_COLORS: Record<string, string> = {
  High: 'bg-green-900/60 text-green-300',
  Medium: 'bg-yellow-900/60 text-yellow-300',
  Low: 'bg-red-900/60 text-red-300',
};

export const ALL_FOLLOW_UP_CHIPS = [
  'Show client timeline',
  'Show impacted clients',
  'Show AP RF stats',
  'Show Smart RF history',
  'Check WLAN config',
  'Check AAA policy',
  'Compare previous 24 hours',
  'Locate AP',
  'Run packet capture',
  'Download logs',
  'Reboot AP',
] as const;

export type FollowUpChip = (typeof ALL_FOLLOW_UP_CHIPS)[number];
