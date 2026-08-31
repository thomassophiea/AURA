/**
 * Configure → Cloud Captive Portal.
 *
 * One portal object, opened in full: grouped section navigation (Access,
 * Guest form, Experience, Legal & privacy) with a live guest preview beside
 * it — the preview renders the portal's own page copy, so what the operator
 * sees is what the guest gets. Modeled on the Captive Web Portal golden
 * design; adapted to the single running portal this deployment manages.
 *
 * The portal stores and validates everything; this page shows the stored
 * overrides beside the *effective* values, because "what did I set" and
 * "what is actually running" are different questions when the service
 * environment provides the fallbacks. Email transport and the secure WLAN
 * stay read-only here — they name credentials, and credentials stay on the
 * service environment and the gateway.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '../../ui/alert';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import { Skeleton } from '../../ui/skeleton';
import { cn } from '../../ui/utils';
import {
  getPortalConfig,
  updatePortalConfig,
  PortalConfigError,
  type PortalConfigView,
} from '../../../services/portalConfigService';
import {
  changedSettings,
  formFromView,
  updateFromForm,
  validationIssues,
  type FormState,
} from './portalFormModel';
import { GuestFieldsSection, SecureAccessSection, SponsorshipSection } from './editorSections';
import { LanguagesSection, LegalPrivacySection } from './factSections';
import { GuestPreview } from './GuestPreview';

const GROUPS = [
  { id: 'access', label: 'Access' },
  { id: 'guestForm', label: 'Guest form' },
  { id: 'experience', label: 'Experience' },
  { id: 'legal', label: 'Legal & privacy' },
] as const;

type GroupId = (typeof GROUPS)[number]['id'];

function statusChips(view: PortalConfigView) {
  const secure = view.effective.secureAccess;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="default">Portal connected</Badge>
      <Badge variant={view.effective.emailTransport ? 'outline' : 'secondary'}>
        Email: {view.effective.emailTransport ?? 'none'}
      </Badge>
      {secure && (
        <Badge variant="outline">
          Secure access:{' '}
          {!secure.configured ? 'not configured' : secure.enabled ? 'offered' : 'off'}
        </Badge>
      )}
      {view.preview && <Badge variant="outline">{view.preview.locales.length} languages</Badge>}
    </div>
  );
}

export function CloudPortalPage() {
  const [view, setView] = useState<PortalConfigView | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [initialForm, setInitialForm] = useState<FormState | null>(null);
  const [group, setGroup] = useState<GroupId>('access');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<PortalConfigError | null>(null);
  const [saveError, setSaveError] = useState<PortalConfigError | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const adopt = useCallback((next: PortalConfigView) => {
    const nextForm = formFromView(next);
    setView(next);
    setForm(nextForm);
    setInitialForm(nextForm);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getPortalConfig();
      if (mountedRef.current) adopt(data);
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof PortalConfigError) {
        setLoadError(err);
      } else {
        setLoadError(new PortalConfigError(0, 'Portal configuration could not be loaded'));
      }
      setView(null);
      setForm(null);
      setInitialForm(null);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [adopt]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const changes = useMemo(
    () => (form && initialForm ? changedSettings(form, initialForm) : []),
    [form, initialForm]
  );
  const dirty = changes.length > 0;

  const issues = useMemo(() => (form && view ? validationIssues(form, view) : []), [form, view]);
  const blocked = issues.some((i) => i.severity === 'error');

  const save = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await updatePortalConfig(updateFromForm(form));
      if (mountedRef.current) adopt(next);
      toast.success('Saved Cloud Captive Portal configuration');
    } catch (err) {
      if (err instanceof PortalConfigError) {
        if (mountedRef.current) setSaveError(err);
        toast.error('Failed to save Cloud Captive Portal configuration', {
          description: err.message,
        });
      } else {
        toast.error('Failed to save Cloud Captive Portal configuration', {
          description: 'Unexpected error',
        });
      }
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [form, adopt]);

  const patch = useCallback((partial: Partial<FormState>) => {
    setForm((current) => (current ? { ...current, ...partial } : current));
  }, []);

  if (loadError?.isNotConfigured) {
    return (
      <Alert>
        <AlertTitle>Cloud Captive Portal is not connected</AlertTitle>
        <AlertDescription>
          Set <code>CWP_INTERNAL_API_URL</code> and <code>CWP_INTERNAL_API_TOKEN</code> on the AURA
          service so it can reach the captive portal&apos;s internal API. Guest access itself is
          unaffected — the portal keeps running on its own configuration.
        </AlertDescription>
      </Alert>
    );
  }
  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>
          {loadError.isPortalUnavailable
            ? 'Captive portal service unavailable'
            : 'Portal configuration could not be loaded'}
        </AlertTitle>
        <AlertDescription>
          {loadError.detail ?? loadError.message}{' '}
          <button className="underline" onClick={() => void refresh()}>
            Retry
          </button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="space-y-1">
            <h2 className="text-lg font-medium">Cloud Captive Portal</h2>
            <p className="text-sm text-muted-foreground">
              The guest consent experience for the captive web portal. Values left blank fall back
              to the portal service&apos;s own defaults; the preview renders the portal&apos;s real
              page copy.
            </p>
          </div>
          {view && statusChips(view)}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={loading || saving}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              size="sm"
              onClick={() => void save()}
              disabled={!dirty || blocked || saving || loading}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
          {dirty && (
            <p className="max-w-[280px] text-right text-xs text-muted-foreground">
              Changes: {changes.join(', ')}
            </p>
          )}
        </div>
      </div>

      {issues.length > 0 && view && (
        <Alert variant={blocked ? 'destructive' : 'warning'}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{blocked ? 'Fix before saving' : 'Worth knowing'}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4">
              {issues.map((issue) => (
                <li key={issue.text}>{issue.text}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {saveError && (
        <Alert variant="destructive">
          <AlertTitle>The portal rejected the configuration</AlertTitle>
          <AlertDescription>
            {saveError.details && saveError.details.length > 0 ? (
              <ul className="list-disc space-y-0.5 pl-4">
                {saveError.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : (
              saveError.message
            )}
          </AlertDescription>
        </Alert>
      )}

      {!view || !form || loading ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-9 w-1/2" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[176px_minmax(0,1fr)_364px]">
          <nav
            aria-label="Portal configuration sections"
            className="lg:sticky lg:top-4 lg:self-start"
          >
            <ul className="flex gap-1 overflow-x-auto lg:flex-col">
              {GROUPS.map((g) => (
                <li key={g.id}>
                  <button
                    onClick={() => setGroup(g.id)}
                    aria-current={group === g.id ? 'page' : undefined}
                    className={cn(
                      'w-full whitespace-nowrap rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                      group === g.id
                        ? 'bg-accent font-medium text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    )}
                  >
                    {g.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <Card>
            <CardContent className="space-y-6 p-4">
              {group === 'access' && (
                <>
                  <SponsorshipSection view={view} form={form} patch={patch} />
                  <SecureAccessSection view={view} form={form} patch={patch} />
                </>
              )}
              {group === 'guestForm' && (
                <GuestFieldsSection view={view} form={form} patch={patch} />
              )}
              {group === 'experience' && <LanguagesSection view={view} />}
              {group === 'legal' && <LegalPrivacySection view={view} />}
              {view.stored.updatedAt && (
                <p className="text-xs text-muted-foreground">
                  Last saved {new Date(view.stored.updatedAt).toLocaleString()}
                  {view.stored.updatedBy ? ` by ${view.stored.updatedBy}` : ''}.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="lg:sticky lg:top-4 lg:self-start">
            <Card>
              <CardContent className="p-4">
                <GuestPreview view={view} form={form} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
