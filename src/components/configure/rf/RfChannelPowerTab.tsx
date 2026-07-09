/**
 * RF editor · Power & Channel tab. Per-band grid (2.4/5, +6 for SmartRf):
 * min/max Tx power 1-20 dBm, per-band channel plan with a plan-contents
 * tooltip, channel width, and a frequency-based custom channel picker
 * (DFS/weather excluded) revealed on ChannelPlanCustom.
 */
import React from 'react';
import { Info } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { cn } from '../../ui/utils';
import { GridHead, NumCellRaw, type RfTabProps } from './rfControls';
import {
  RF_BANDS,
  RF_CUSTOM_CH,
  RF_PLANS_BY_BAND,
  RF_PLAN_CHANNELS,
  RF_WIDTHS_BY_TYPE,
  bandOf,
  bandPath,
} from './rfModel';

const TEMPLATE = '0.9fr 1.1fr 1.1fr 1.9fr 1.2fr';

export function RfChannelPowerTab({ cfg, root, isAcs, errs, update }: RfTabProps) {
  const bands = RF_BANDS.filter(([bandId]) => !(isAcs && bandId === 'Band6'));
  const widths = RF_WIDTHS_BY_TYPE[isAcs ? 'Acs' : 'SmartRf'];

  return (
    <div className="max-w-[960px]">
      <div className="overflow-hidden rounded-md border border-border">
        <GridHead
          template={TEMPLATE}
          cols={['Band', 'Min Power (1-20)', 'Max Power (1-20)', 'Channel Plan', 'Channel Width']}
        />
        {bands.map(([bandId, label]) => {
          const b = bandOf(cfg, 'powerAndChannel', bandId);
          const bk = bandPath(cfg, root, 'powerAndChannel', bandId);
          const plans = RF_PLANS_BY_BAND[bandId] ?? [];
          const curPlan = String(b.acsPlan ?? plans[0]?.id ?? '');
          const isCustom = curPlan === 'ChannelPlanCustom';
          const selFreq = (Array.isArray(b.acsList) ? (b.acsList as number[]) : []).slice();
          const toggle = (freq: number) =>
            update(
              `${bk}.acsList`,
              selFreq.includes(freq)
                ? selFreq.filter((x) => x !== freq)
                : [...selFreq, freq].sort((a, c) => a - c)
            );
          return (
            <div key={bandId} className="border-t border-border">
              <div
                className="grid items-center gap-2 px-3 py-2.5"
                style={{ gridTemplateColumns: TEMPLATE }}
              >
                <div className="text-sm">{label}</div>
                <NumCellRaw
                  value={b.txMinPower}
                  onChange={(v) => update(`${bk}.txMinPower`, v)}
                  error={errs[`txMin${bandId}`] ?? errs[`power${bandId}`]}
                  width={100}
                />
                <NumCellRaw
                  value={b.txMaxPower}
                  onChange={(v) => update(`${bk}.txMaxPower`, v)}
                  error={errs[`txMax${bandId}`]}
                  width={100}
                />
                <div className="flex items-center gap-2">
                  <Select value={curPlan} onValueChange={(v) => update(`${bk}.acsPlan`, v)}>
                    <SelectTrigger className="h-8 w-[190px]" aria-label={`${label} channel plan`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 cursor-help text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>{RF_PLAN_CHANNELS[curPlan] ?? 'Channel plan'}</TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={String(b.channelWidth ?? 'Ch1Width_20MHz')}
                  onValueChange={(v) => update(`${bk}.channelWidth`, v)}
                >
                  <SelectTrigger className="h-8 w-[130px]" aria-label={`${label} channel width`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(widths[bandId] ?? []).map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isCustom && (
                <div className="px-3 pb-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {`Custom Channels (${selFreq.length} selected · DFS/weather excluded)`}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(RF_CUSTOM_CH[bandId] ?? []).map(({ ch, freq }) => {
                      const on = selFreq.includes(freq);
                      return (
                        <button
                          key={freq}
                          type="button"
                          title={`${freq} MHz`}
                          onClick={() => toggle(freq)}
                          className={cn(
                            'min-w-[36px] rounded border px-2 py-1 text-xs font-semibold',
                            on
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border text-muted-foreground'
                          )}
                        >
                          {ch}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
