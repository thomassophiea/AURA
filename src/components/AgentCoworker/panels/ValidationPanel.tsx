import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Loader2, Copy, Check } from 'lucide-react';
import { cn } from '../../ui/utils';
import { apiService } from '../../../services/api';

interface ValidationCheck {
  name: string;
  passed: boolean;
  detail: string;
}

interface ValidationResult {
  confidence: number;
  band: 'HIGH' | 'MEDIUM' | 'LOW';
  checks: ValidationCheck[];
  recommendation: string;
  provisioningToken: string;
  expiresAt: string;
}

const BAND_STYLES: Record<ValidationResult['band'], string> = {
  HIGH: 'text-green-300 bg-green-900/30 border-green-700/40',
  MEDIUM: 'text-amber-300 bg-amber-900/30 border-amber-700/40',
  LOW: 'text-red-300 bg-red-900/30 border-red-700/40',
};

interface ValidationPanelProps {
  initialSsid?: string;
  initialVlanId?: number;
}

export function ValidationPanel({ initialSsid, initialVlanId }: ValidationPanelProps = {}) {
  const [ssidName, setSsidName] = useState(initialSsid ?? '');
  const [vlanId, setVlanId] = useState(initialVlanId != null ? String(initialVlanId) : '');
  const [security, setSecurity] = useState<'WPA2' | 'WPA3' | 'WPA3_TRANSITION' | 'OPEN'>('WPA3');
  const [site, setSite] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialSsid !== undefined) setSsidName(initialSsid);
  }, [initialSsid]);

  useEffect(() => {
    if (initialVlanId !== undefined) setVlanId(String(initialVlanId));
  }, [initialVlanId]);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleValidate() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const token = apiService.getAccessToken();
      const resp = await fetch('/api/validate/intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          intent: {
            action: 'provision-ssid',
            ssidName,
            vlanId: Number(vlanId),
            securityType: security,
            site: site || undefined,
          },
        }),
      });
      if (!resp.ok) {
        const msg = await resp.text().catch(() => 'Request failed');
        throw new Error(`Validation failed: ${msg}`);
      }
      setResult(await resp.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setLoading(false);
    }
  }

  function copyToken() {
    if (!result) return;
    navigator.clipboard.writeText(result.provisioningToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="vp-ssid" className="text-xs text-muted-foreground">
            SSID Name
          </label>
          <input
            id="vp-ssid"
            aria-label="SSID Name"
            className="h-8 px-2.5 rounded bg-background border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={ssidName}
            onChange={(e) => setSsidName(e.target.value)}
            placeholder="e.g. Corp-WiFi"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="vp-vlan" className="text-xs text-muted-foreground">
            VLAN ID
          </label>
          <input
            id="vp-vlan"
            aria-label="VLAN ID"
            type="number"
            className="h-8 px-2.5 rounded bg-background border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={vlanId}
            onChange={(e) => setVlanId(e.target.value)}
            placeholder="e.g. 10"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="vp-security" className="text-xs text-muted-foreground">
            Security
          </label>
          <select
            id="vp-security"
            aria-label="Security"
            className="h-8 px-2.5 rounded bg-background border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={security}
            onChange={(e) => setSecurity(e.target.value as typeof security)}
          >
            <option value="WPA3">WPA3</option>
            <option value="WPA3_TRANSITION">WPA3 Transition</option>
            <option value="WPA2">WPA2</option>
            <option value="OPEN">Open</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="vp-site" className="text-xs text-muted-foreground">
            Site (optional)
          </label>
          <input
            id="vp-site"
            aria-label="Site"
            className="h-8 px-2.5 rounded bg-background border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="e.g. main"
          />
        </div>

        <button
          onClick={handleValidate}
          disabled={loading || !ssidName}
          className={cn(
            'h-8 px-4 rounded text-sm font-medium transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:opacity-40 disabled:cursor-not-allowed'
          )}
        >
          {loading ? (
            <span className="flex items-center gap-2 justify-center">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Validating…
            </span>
          ) : (
            'Validate'
          )}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-900/20 border border-red-700/40 rounded px-3 py-2">
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'px-2 py-0.5 rounded text-xs font-semibold border',
                BAND_STYLES[result.band]
              )}
            >
              {result.band}
            </span>
            <span className="text-xs text-muted-foreground">{result.confidence}/100</span>
          </div>

          <div className="flex flex-col gap-1.5">
            {result.checks.map((check, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                {check.passed ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                )}
                <span className={check.passed ? 'text-foreground/80' : 'text-red-400'}>
                  <span className="font-medium">{check.name}</span> — {check.detail}
                </span>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">{result.recommendation}</p>

          <button
            onClick={copyToken}
            className="flex items-center gap-2 h-7 px-3 rounded text-xs bg-secondary hover:bg-secondary/80 transition-colors self-start"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied!' : 'Copy Token'}
          </button>
        </div>
      )}
    </div>
  );
}
