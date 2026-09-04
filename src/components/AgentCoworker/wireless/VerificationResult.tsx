import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import type { WirelessProvisioningResult } from '@/types/wirelessAssistant';

const STATUS_COPY: Record<WirelessProvisioningResult['status'], string> = {
  completed: 'Completed — the WLAN is live and verified broadcasting.',
  degraded: 'Degraded — the WLAN was created but could not be fully verified. Review the details below.',
  partial: 'Partial — the WLAN was created but one or more profile bindings failed.',
  failed: 'Failed — no changes were left in an unverified state; see the reason below.',
};

/**
 * Honest, evidence-backed outcome. Never claims success without the
 * read-back/verification evidence the engine actually collected.
 */
export function VerificationResult({
  result,
  onStartOver,
}: {
  result: WirelessProvisioningResult;
  onStartOver: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <StatusBadge status={result.status} label={result.status.toUpperCase()} />
        {result.serviceName && <span className="text-xs text-foreground/80">{result.serviceName}</span>}
      </div>

      <p className="text-xs text-muted-foreground">{STATUS_COPY[result.status]}</p>

      {result.reason && <p className="text-xs text-red-400">Reason: {result.reason}</p>}
      {result.error && <p className="text-xs text-red-400">{result.error}</p>}

      {result.profileResults && result.profileResults.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Profile bindings</span>
          {result.profileResults.map((p) => (
            <div key={p.profileId} className="flex items-center gap-2 text-xs">
              <StatusBadge status={p.status} label={p.status} />
              <span className="text-foreground/80">
                {p.name}
                {p.boundIndices?.length ? ` — radios ${p.boundIndices.join(', ')}` : ''}
                {p.silentlyDropped?.length ? ` (silently dropped: ${p.silentlyDropped.join(', ')})` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {result.verification && result.verification.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Live broadcast verification</span>
          {result.verification.map((v) => (
            <div key={v.apSerial} className="flex items-center gap-2 text-xs">
              <StatusBadge status={v.broadcasting ? 'healthy' : 'critical'} label={v.broadcasting ? 'ON AIR' : 'NOT SEEN'} />
              <span className="text-foreground/80">{v.apSerial}</span>
            </div>
          ))}
        </div>
      )}

      {result.notes && result.notes.length > 0 && (
        <ul className="list-disc list-inside text-xs text-amber-400">
          {result.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}

      <Button type="button" size="sm" variant="secondary" onClick={onStartOver} className="self-start">
        Start a new request
      </Button>
    </div>
  );
}
