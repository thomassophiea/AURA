import { Loader2 } from 'lucide-react';

/**
 * The engine performs create -> bind -> read-back -> verify as one
 * server-side round trip (server/cortex/wlanProvisioningEngine.js), so this
 * is a single busy state rather than a multi-step tracker — the result
 * itself (VerificationResult) is what proves what actually happened.
 */
export function ProvisioningProgress() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      Provisioning — creating the service, binding radios, and verifying live broadcast…
    </div>
  );
}
