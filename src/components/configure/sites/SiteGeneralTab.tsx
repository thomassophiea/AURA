/**
 * Site editor · General tab. Identity only: site name and the create-time
 * Centralized/Distributed radio (immutable after create). Country/timezone,
 * location fields, AFC schedule and FTM ranging live on the Location tab
 * (golden SITE_TABS split, keeping General uncluttered).
 */
import React from 'react';
import { Input } from '../../ui/input';
import { RadioGroup, RadioGroupItem } from '../../ui/radio-group';
import { FieldRow, Section } from '../_kit';
import type { SiteTabProps } from './siteEditorTypes';

export function SiteGeneralTab({ form, update, errs, isNew }: SiteTabProps) {
  return (
    <div className="max-w-[640px] space-y-6">
      <Section title="Identity">
        <FieldRow label="Name" error={errs.name} required>
          <Input
            value={form.siteName ?? ''}
            onChange={(e) => update('siteName', e.target.value)}
            maxLength={64}
            className="max-w-[340px]"
          />
        </FieldRow>
        <FieldRow
          label="Site Mode"
          error={isNew ? errs.dist : undefined}
          required={isNew}
          description={
            isNew
              ? 'Required at create; the mode cannot be changed afterwards.'
              : 'Site mode is immutable after create.'
          }
        >
          {isNew ? (
            <RadioGroup
              className="flex gap-6"
              value={form.distributed == null ? '' : form.distributed ? 'd' : 'c'}
              onValueChange={(v) => update('distributed', v === 'd')}
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="c" /> Centralized
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="d" /> Distributed
              </label>
            </RadioGroup>
          ) : (
            <span className="text-sm text-muted-foreground">
              {form.distributed ? 'Distributed' : 'Centralized'}
            </span>
          )}
        </FieldRow>
      </Section>
    </div>
  );
}
