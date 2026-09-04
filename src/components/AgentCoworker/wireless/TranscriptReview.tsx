import { useEffect, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { apiService } from '@/services/api';
import type { ParsedWirelessIntent, WirelessConfigurationIntent, SecurityMode } from '@/types/wirelessAssistant';
import { WirelessIntentSummary } from './WirelessIntentSummary';

const SECURITY_OPTIONS: Array<{ value: SecurityMode; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'wpa2_personal', label: 'WPA2-Personal' },
  { value: 'wpa3_personal', label: 'WPA3-Personal' },
  { value: 'wpa2_enterprise', label: 'WPA2-Enterprise' },
  { value: 'wpa3_enterprise', label: 'WPA3-Enterprise' },
  { value: 'owe', label: 'OWE (Enhanced Open)' },
];

interface SiteOption {
  id: string;
  name: string;
}

interface TranscriptReviewProps {
  transcript: string;
  parsedIntent: ParsedWirelessIntent;
  onEditTranscript: (text: string) => void;
  onUpdateIntent: (patch: Partial<WirelessConfigurationIntent>, password?: string) => void;
}

/**
 * "What you said" (editable raw transcript) + "AURA interpreted" (structured
 * fields) + inline prompts for anything the parser flagged as missing.
 * Editing the transcript re-parses from scratch; editing a missing field
 * patches the intent directly without re-parsing free text.
 */
export function TranscriptReview({
  transcript,
  parsedIntent,
  onEditTranscript,
  onUpdateIntent,
}: TranscriptReviewProps) {
  const [draft, setDraft] = useState(transcript);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [password, setPassword] = useState('');

  useEffect(() => setDraft(transcript), [transcript]);

  useEffect(() => {
    if (!parsedIntent.missingFields.includes('siteId')) return;
    let cancelled = false;
    apiService
      .getSites()
      .then((raw: Array<{ id: string; name?: string; siteName?: string }>) => {
        if (cancelled) return;
        setSites(raw.map((s) => ({ id: s.id, name: s.name ?? s.siteName ?? s.id })));
      })
      .catch(() => {
        // Site list is a convenience picker — leave it empty on failure,
        // the operator can still type the site name in the transcript.
      });
    return () => {
      cancelled = true;
    };
  }, [parsedIntent.missingFields]);

  const { missingFields } = parsedIntent;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">What you said</span>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft.trim() && draft !== transcript) onEditTranscript(draft);
          }}
          className="text-sm"
          rows={2}
          aria-label="Editable transcript"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">AURA interpreted</span>
        <WirelessIntentSummary intent={parsedIntent.intent} missingFields={missingFields} />
      </div>

      {missingFields.includes('siteId') && (
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-amber-400 font-medium">Site (required — never inferred)</span>
          <select
            className="h-8 px-2 rounded bg-background border border-border text-sm"
            defaultValue=""
            onChange={(e) => {
              const site = sites.find((s) => s.id === e.target.value);
              if (site) onUpdateIntent({ siteId: site.id, siteName: site.name });
            }}
            aria-label="Select site"
          >
            <option value="" disabled>
              Select a site…
            </option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {missingFields.includes('security.mode') && (
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-amber-400 font-medium">Security mode (required)</span>
          <select
            className="h-8 px-2 rounded bg-background border border-border text-sm"
            defaultValue=""
            onChange={(e) => onUpdateIntent({ security: { mode: e.target.value as SecurityMode } })}
            aria-label="Select security mode"
          >
            <option value="" disabled>
              Select security…
            </option>
            {SECURITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {missingFields.includes('security.credentialReference') && (
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-amber-400 font-medium">Passphrase (required, ≥8 characters)</span>
          <div className="flex gap-2">
            <input
              type="password"
              className="h-8 px-2 flex-1 rounded bg-background border border-border text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="WLAN passphrase"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={password.length < 8}
              onClick={() => onUpdateIntent({}, password)}
            >
              Set
            </Button>
          </div>
        </label>
      )}
    </div>
  );
}
