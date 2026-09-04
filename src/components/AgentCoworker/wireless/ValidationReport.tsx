import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { WirelessValidationReport } from '@/types/wirelessAssistant';

const CHECK_LABEL: Record<string, string> = {
  site_exists: 'Site exists',
  wlan_name_conflict: 'No WLAN name conflict',
  vlan_exists: 'VLAN/topology exists',
  dhcp_scope: 'DHCP scope',
  switch_trunk: 'Switch trunk carries VLAN',
  ap_model_support: 'AP scope available',
  ssid_count_limit: 'SSID/radio capacity',
  band_compatibility: 'Radio/security compatibility',
};

interface ValidationReportProps {
  report: WirelessValidationReport | null;
  isValidating: boolean;
  onValidate: () => void;
  canValidate: boolean;
}

export function ValidationReportView({ report, isValidating, onValidate, canValidate }: ValidationReportProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Live validation</span>
        <Button type="button" size="sm" disabled={!canValidate || isValidating} onClick={onValidate}>
          {isValidating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {report ? 'Re-validate' : 'Validate'}
        </Button>
      </div>

      {report && (
        <>
          <div className="flex items-center gap-2">
            <StatusBadge status={report.confidence.band} label={`${report.confidence.band} · ${report.confidence.score}/100`} />
            {report.expiresAt && (
              <span className="text-[11px] text-muted-foreground">
                Valid until {new Date(report.expiresAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            {report.checks.map((check) => (
              <div key={check.name} className="flex items-start gap-2 text-xs">
                <StatusBadge
                  status={check.result}
                  label={check.result.toUpperCase()}
                  className="mt-0.5 shrink-0"
                />
                <span className="text-foreground/80">
                  <span className="font-medium">{CHECK_LABEL[check.name] ?? check.name}</span> — {check.evidence}
                </span>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">{report.recommendation}</p>

          {report.confidence.blockingIssues.length > 0 && (
            <p className="text-xs text-red-400">
              Blocked: {report.confidence.blockingIssues.map((n) => CHECK_LABEL[n] ?? n).join(', ')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
