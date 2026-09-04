import type { WirelessConfigurationIntent } from '@/types/wirelessAssistant';

const SECURITY_LABEL: Record<string, string> = {
  open: 'Open',
  wpa2_personal: 'WPA2-Personal',
  wpa3_personal: 'WPA3-Personal',
  wpa2_enterprise: 'WPA2-Enterprise',
  wpa3_enterprise: 'WPA3-Enterprise',
  owe: 'OWE (Enhanced Open)',
};

const ACTION_LABEL: Record<string, string> = {
  create_wlan: 'Create WLAN',
  update_wlan: 'Update WLAN',
  delete_wlan: 'Delete WLAN',
  assign_wlan: 'Assign WLAN',
  schedule_wlan: 'Schedule WLAN',
  validate_only: 'Investigate (read-only)',
};

interface Row {
  label: string;
  value: string | undefined;
  missing?: boolean;
}

/** "AURA interpreted" — the structured fields the parser extracted, field by field. */
export function WirelessIntentSummary({
  intent,
  missingFields = [],
}: {
  intent: WirelessConfigurationIntent;
  missingFields?: string[];
}) {
  const rows: Row[] = [
    { label: 'Action', value: ACTION_LABEL[intent.action] ?? intent.action },
    { label: 'Site', value: intent.siteName, missing: missingFields.includes('siteId') },
    { label: 'WLAN name', value: intent.wlanName, missing: missingFields.includes('wlanName') },
    { label: 'SSID', value: intent.ssid },
    { label: 'VLAN', value: intent.vlanId != null ? String(intent.vlanId) : undefined },
    {
      label: 'Security',
      value: intent.security?.mode ? SECURITY_LABEL[intent.security.mode] : undefined,
      missing: missingFields.includes('security.mode'),
    },
    {
      label: 'Credential',
      value: intent.security?.credentialReference ? 'Captured (not shown)' : undefined,
      missing: missingFields.includes('security.credentialReference'),
    },
    {
      label: 'AP scope',
      value: intent.accessPointIds?.length ? `${intent.accessPointIds.length} selected AP(s)` : 'All APs at site',
    },
  ];

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className={row.missing ? 'text-amber-400 font-medium' : 'text-foreground/90'}>
            {row.value ?? (row.missing ? 'Not specified — required' : '—')}
          </dd>
        </div>
      ))}
    </dl>
  );
}
