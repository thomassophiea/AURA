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
import { useState } from 'react';
import { KeyRound } from 'lucide-react';
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
          <PrivateSaePage embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default PrivateCredentialsPage;
