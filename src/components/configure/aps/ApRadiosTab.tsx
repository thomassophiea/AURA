/**
 * AP editor > Radios tab. Whole tab is gated on the site having a country
 * (ap_country_radios_off, gap 9). Renders one ApRadioCard per radio and, when
 * any radio is in client-bridge mode, the CB credentials + RSS threshold
 * override block (gap 24).
 */
import React from 'react';
import { Input } from '../../ui/input';
import { FieldRow, OvrRow, MaskedInput } from '../_kit';
import { NumberField } from './controls';
import { ApRadioCard } from './ApRadioCard';
import type { ApDetail } from '../../../types/configure';
import type { ApRefData } from './useApRefData';

export interface ApRadiosTabProps {
  form: ApDetail;
  upd: (path: string, value: unknown) => void;
  refData: ApRefData;
  resolvedRfId: string | null | undefined;
  errors: Record<string, string>;
  onOpenRadioAdvanced: (index: number) => void;
}

export function ApRadiosTab({
  form,
  upd,
  refData,
  resolvedRfId,
  errors,
  onOpenRadioAdvanced,
}: ApRadiosTabProps) {
  const site = refData.siteByName(form.hostSite);
  const country = site?.country || site?.treeNode?.country;
  const radios = form.radios ?? [];

  if (!country) {
    return (
      <p className="p-4 text-sm text-destructive">
        Radios cannot be configured until this AP&apos;s site has a country (regulatory domain
        unknown).
      </p>
    );
  }
  if (radios.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No radios.</p>;
  }

  const updRadio = (i: number, key: string, value: unknown) => upd(`radios.${i}.${key}`, value);
  const hasBridge = radios.some((r) => r.mode === 'bridge');

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {radios.map((r, i) => (
          <ApRadioCard
            key={i}
            radio={r}
            index={i}
            features={(form.features as string[]) ?? []}
            rfPolicyName={refData.rfPolicyName(resolvedRfId)}
            siteName={form.hostSite ?? ''}
            errors={errors}
            onUpd={updRadio}
            onOpenAdvanced={onOpenRadioAdvanced}
          />
        ))}
      </div>

      {hasBridge && (
        <div className="max-w-xl space-y-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Client Bridge
          </h4>
          <FieldRow label="Username">
            <Input className="w-56" value={form.cbUser ?? ''} onChange={(e) => upd('cbUser', e.target.value)} />
          </FieldRow>
          <FieldRow label="Password">
            <MaskedInput className="w-56" value={form.cbPassword ?? ''} onChange={(v) => upd('cbPassword', v)} />
          </FieldRow>
          <OvrRow
            label="RSS Threshold [dBm]"
            overridden={!!form.cbRssThresholdOvr}
            onOverriddenChange={(v) => upd('cbRssThresholdOvr', v)}
            inheritedDisplay="Inherited from profile"
          >
            <NumberField value={form.cbRssThreshold} onChange={(v) => upd('cbRssThreshold', v)} />
          </OvrRow>
        </div>
      )}
    </div>
  );
}
