/**
 * One radio column in the AP editor Radios tab. Mode is read-only (from the
 * profile, gap 5). "Use RF Management Policy" is a select — N/A for bridge,
 * disabled for sensor (gap 8); when Smart RF is on the width/channel/power
 * cells collapse to policy + site links. Width is band-aware and hidden for
 * b/g (gap 9); channel/power are selects (gaps 6/7); 6 GHz + AFC adds fallback
 * channels (gap 10); 5 GHz adds DFS revert controls (gap 11).
 */
import React from 'react';
import { Button } from '../../ui/button';
import { Switch } from '../../ui/switch';
import { Badge } from '../../ui/badge';
import { ApSelect, NumberField } from './controls';
import {
  apBandOf,
  apChannelOpts,
  apPowerOpts,
  apWidthOpts,
  hasFeature,
  RADIO_MODE_LABEL,
} from './apHelpers';
import type { ApRadio } from '../../../types/configure';

export interface ApRadioCardProps {
  radio: ApRadio;
  index: number;
  features: string[];
  rfPolicyName: string;
  siteName: string;
  errors: Record<string, string>;
  onUpd: (index: number, key: string, value: unknown) => void;
  onOpenAdvanced: (index: number) => void;
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    {children}
  </div>
);

export function ApRadioCard({
  radio: r,
  index: i,
  features,
  rfPolicyName,
  siteName,
  errors,
  onUpd,
  onOpenAdvanced,
}: ApRadioCardProps) {
  const band = apBandOf(r);
  const isSensor = r.mode === 'sensor';
  const isBridge = r.mode === 'bridge';
  const isBg = r.mode === 'bg';
  const smart = !!r.useSmartRf;
  const F = (f: string) => hasFeature(features, f);
  const set = (key: string, value: unknown) => onUpd(i, key, value);

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div>
        <p className="text-sm font-semibold">{r.radioName || `Radio ${r.radioIndex}`}</p>
        <p className="text-xs text-muted-foreground">
          Mode: {RADIO_MODE_LABEL[r.mode] ?? r.mode} (from profile)
        </p>
      </div>

      {isBridge ? (
        <Row label="Use RF Management Policy">
          <Badge variant="secondary">N/A (client bridge)</Badge>
        </Row>
      ) : (
        <Row label="Use RF Management Policy">
          <ApSelect
            className="w-full"
            disabled={isSensor}
            value={smart ? 'rf' : 'fixed'}
            options={[
              { id: 'rf', label: 'Use RF Management Policy' },
              { id: 'fixed', label: 'Fixed channel and power' },
            ]}
            onChange={(v) => set('useSmartRf', v === 'rf')}
          />
        </Row>
      )}

      {smart && !isBridge ? (
        <div className="space-y-1 text-xs text-muted-foreground">
          <div>
            RF Management Policy: <span className="text-primary">{rfPolicyName}</span>
          </div>
          <div>
            Site: <span className="text-primary">{siteName || '—'}</span>
          </div>
        </div>
      ) : (
        <>
          {!isBg && (
            <Row label="Channel Width">
              <ApSelect
                className="w-full"
                value={r.channelwidth || 'Ch1Width_20MHz'}
                options={apWidthOpts(band, r.mode)}
                onChange={(v) => set('channelwidth', v)}
              />
            </Row>
          )}
          <Row label="Request New Channel">
            <ApSelect
              className="w-full"
              value={r.reqChannel != null ? String(r.reqChannel) : ''}
              options={apChannelOpts(band, r.reqChannel)}
              onChange={(v) => set('reqChannel', v)}
            />
          </Row>
          <Row label="Max Tx Power">
            <ApSelect
              className="w-full"
              disabled={isSensor}
              value={r.txMaxPower != null ? String(r.txMaxPower) : ''}
              options={apPowerOpts(band)}
              onChange={(v) => set('txMaxPower', Number(v))}
            />
          </Row>

          {band === 'Band6' && F('AFC-COMPLIANCE') && (
            <Row label="Fallback Channels">
              <div className="space-y-2">
                {(r.fallbackChannels ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(r.fallbackChannels as string[]).map((fc, x) => (
                      <Badge key={x} variant="secondary" className="gap-1">
                        {fc}
                        <button
                          type="button"
                          className="text-destructive"
                          aria-label={`Remove ${fc}`}
                          onClick={() =>
                            set('fallbackChannels', (r.fallbackChannels as string[]).filter((_, y) => y !== x))
                          }
                        >
                          ✕
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <ApSelect
                  className="w-full"
                  value=""
                  placeholder="+ Add channel"
                  options={[
                    { id: '', label: '+ Add channel' },
                    ...apChannelOpts(band).filter((o) => (r.fallbackChannels as string[] ?? []).indexOf(o.id) < 0),
                  ]}
                  onChange={(v) => {
                    if (!v) return;
                    const cur = (r.fallbackChannels as string[]) ?? [];
                    set('fallbackChannels', F('MULTIPLE-FALLBACK-CHANNELS') ? [...cur, v] : [v]);
                  }}
                />
              </div>
            </Row>
          )}

          {band === 'Band5' && (
            <>
              <Row label="Return after DFS event">
                <Switch checked={!!r.dfsRevert} onCheckedChange={(v) => set('dfsRevert', v)} />
              </Row>
              {r.dfsRevert && (
                <>
                  <Row label="DFS Revert Hold Time [s] (30-3600)">
                    <NumberField
                      className="w-full"
                      value={r.dfsRevertHoldTime}
                      min={30}
                      max={3600}
                      onChange={(v) => set('dfsRevertHoldTime', v)}
                    />
                    {errors[`dfsH${i}`] && <p className="text-xs text-destructive">{errors[`dfsH${i}`]}</p>}
                  </Row>
                  <Row label="DFS Revert Client Aware (0-255)">
                    <NumberField
                      className="w-full"
                      value={r.dfsRevertClientAware}
                      min={0}
                      max={255}
                      onChange={(v) => set('dfsRevertClientAware', v)}
                    />
                    {errors[`dfsC${i}`] && <p className="text-xs text-destructive">{errors[`dfsC${i}`]}</p>}
                  </Row>
                </>
              )}
            </>
          )}
        </>
      )}

      {!isBg && (
        <Button type="button" variant="outline" size="sm" onClick={() => onOpenAdvanced(i)}>
          Advanced
        </Button>
      )}
    </div>
  );
}
