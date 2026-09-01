/**
 * Private Credentials — the unified home for AURA's per-user Wi-Fi credential
 * mechanisms: Pre-Shared Keys (WPA2 PPSK) and Private SAE (WPA3). One family,
 * one nav entry, two protocol tabs.
 *
 * This is a presentation-layer union only. The two features keep their own
 * services, stores and API surfaces (/api/v1/ppsk and /api/v1/private-sae) —
 * the protocols genuinely differ (passphrase policy, device binding model,
 * key-file semantics), so the tabs host the existing pages in embedded mode
 * rather than pretending the mechanisms are identical. Legacy view ids
 * `configure-ppsk` / `configure-private-sae` deep-link to the matching tab.
 */
import { useEffect, useState } from 'react';
import { KeyRound, ShieldOff } from 'lucide-react';
import { Badge } from '../../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { consumeConfigureTabHint } from '../catalog/configureNav';
import { PpskPage } from '../ppsk';
import { PrivateSaePage } from '../privateSae';

export type PrivateCredentialType = 'ppsk' | 'psae';

const TAB_VALUES: PrivateCredentialType[] = ['ppsk', 'psae'];

export interface PrivateCredentialsPageProps {
  /** Preselect a protocol tab (used by the legacy deep-link view ids). */
  initialType?: PrivateCredentialType;
}

export function PrivateCredentialsPage({ initialType }: PrivateCredentialsPageProps) {
  const [tab, setTab] = useState<string>(
    () => initialType ?? consumeConfigureTabHint(TAB_VALUES) ?? 'ppsk'
  );

  // Server-side gate mirror (/api/settings/public → PRIVATE_SAE_ENABLED).
  // null = unknown (endpoint unreachable): render the page as before rather
  // than falsely reporting the feature disabled.
  const [saeEnabled, setSaeEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/settings/public', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (alive && s && typeof s.privateSaeEnabled === 'boolean') {
          setSaeEnabled(s.privateSaeEnabled);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-4 p-6">
      <div>
        <p className="text-xs text-muted-foreground">Configuration / Private Credentials</p>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Private Credentials</h1>
            <Badge variant="outline" className="font-normal text-muted-foreground">
              Organization
            </Badge>
            <Badge
              variant="outline"
              className="border-amber-500/50 text-amber-600 dark:text-amber-400"
            >
              Experimental
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Per-user Wi-Fi credentials without enterprise 802.1X — Pre-Shared Keys on
            WPA2-Personal, Private SAE on WPA3-Personal. Same use case, different protocols.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="ppsk">Pre-Shared Keys (WPA2)</TabsTrigger>
          <TabsTrigger value="psae">Private SAE (WPA3)</TabsTrigger>
        </TabsList>
        <TabsContent value="ppsk">
          <PpskPage embedded />
        </TabsContent>
        <TabsContent value="psae">
          {saeEnabled === false ? (
            <div className="mt-4 flex flex-col items-center gap-2 rounded-md border border-border bg-muted/40 px-6 py-12 text-center">
              <ShieldOff className="h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">Private SAE is not enabled on this deployment</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Set <code className="font-mono text-xs">PRIVATE_SAE_ENABLED=true</code> on the AURA
                service to activate per-user WPA3-SAE credentials. Pre-Shared Keys (WPA2) remain
                fully available.
              </p>
            </div>
          ) : (
            <PrivateSaePage embedded />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default PrivateCredentialsPage;
