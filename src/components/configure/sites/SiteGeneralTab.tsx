/**
 * Site editor · General tab. Identity (name/country/timezone), create-time
 * Centralized/Distributed radio (immutable after create), location fields,
 * treeNode.mapCoordinates with lat/long validation, AFC scheduled update
 * (afcUpdate.hour/minute) and FTM AP-to-AP ranging (apRanging boolean).
 */
import React from 'react';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { RadioGroup, RadioGroupItem } from '../../ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { FieldRow, Section } from '../_kit';
import type { SiteTabProps } from './siteEditorTypes';
import { TYPE_OF_PLACE, getPath } from './siteModel';
import { COUNTRIES, TIMEZONES } from './siteEnums';

const NONE = '__none__';

export function SiteGeneralTab({ form, update, errs, isNew }: SiteTabProps) {
  const tn = (path: string) => (getPath(form, `treeNode.${path}`) as string) ?? '';

  return (
    <div className="max-w-[640px] space-y-6">
      <Section title="Identity">
        <FieldRow label="Name" error={errs.name} required>
          <Input
            value={form.siteName ?? ''}
            onChange={(e) => update('siteName', e.target.value)}
            className="max-w-[340px]"
          />
        </FieldRow>
        <FieldRow label="Country">
          <Select value={form.country || NONE} onValueChange={(v) => update('country', v === NONE ? '' : v)}>
            <SelectTrigger className="max-w-[340px]" aria-label="Country">
              <SelectValue placeholder="— Select —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— Select —</SelectItem>
              {COUNTRIES.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
        <FieldRow label="Timezone">
          <Select value={form.timezone || NONE} onValueChange={(v) => update('timezone', v === NONE ? '' : v)}>
            <SelectTrigger className="max-w-[340px]" aria-label="Timezone">
              <SelectValue placeholder="— Select —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— Select —</SelectItem>
              {TIMEZONES.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
        <FieldRow label="Site Mode" error={isNew ? errs.dist : undefined} required={isNew}>
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

      <Section title="Location">
        <FieldRow label="Type of Place">
          <Select
            value={tn('typeOfPlace') || NONE}
            onValueChange={(v) => update('treeNode.typeOfPlace', v === NONE ? null : v)}
          >
            <SelectTrigger className="max-w-[240px]" aria-label="Type of Place">
              <SelectValue placeholder="— Select —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— Select —</SelectItem>
              {TYPE_OF_PLACE.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
        <FieldRow label="Site Manager Name">
          <Input value={form.siteManagerName ?? ''} onChange={(e) => update('siteManagerName', e.target.value)} className="max-w-[300px]" />
        </FieldRow>
        <FieldRow label="Site Manager Email">
          <Input type="email" value={form.siteManagerEmail ?? ''} onChange={(e) => update('siteManagerEmail', e.target.value)} className="max-w-[300px]" />
        </FieldRow>
        <FieldRow label="Region">
          <Input value={tn('region')} onChange={(e) => update('treeNode.region', e.target.value)} className="max-w-[260px]" />
        </FieldRow>
        <FieldRow label="City">
          <Input value={tn('city')} onChange={(e) => update('treeNode.city', e.target.value)} className="max-w-[260px]" />
        </FieldRow>
        <FieldRow label="Campus">
          <Input value={tn('campus')} onChange={(e) => update('treeNode.campus', e.target.value)} className="max-w-[260px]" />
        </FieldRow>
        <FieldRow label="Postal Code">
          <Input value={form.postalCode ?? ''} onChange={(e) => update('postalCode', e.target.value)} className="max-w-[180px]" />
        </FieldRow>
        <FieldRow label="Map Coordinates (Lat, Long)" error={errs.coord}>
          <Input
            value={tn('mapCoordinates')}
            placeholder="37.40, -121.95"
            onChange={(e) => update('treeNode.mapCoordinates', e.target.value)}
            className="max-w-[260px]"
          />
        </FieldRow>
      </Section>

      <Section title="AFC & Ranging">
        <div className="flex items-end gap-4">
          <Label className="mb-2 w-[200px] shrink-0">AFC Scheduled Update</Label>
          <div>
            <span className="mb-1 block text-[11.5px] text-muted-foreground">Hour</span>
            <Input
              type="number"
              min={0}
              max={23}
              value={(getPath(form, 'afcUpdate.hour') as number) ?? 0}
              onChange={(e) => update('afcUpdate.hour', Number(e.target.value))}
              className="w-[80px]"
            />
          </div>
          <div>
            <span className="mb-1 block text-[11.5px] text-muted-foreground">Minute</span>
            <Input
              type="number"
              min={0}
              max={59}
              value={(getPath(form, 'afcUpdate.minute') as number) ?? 0}
              onChange={(e) => update('afcUpdate.minute', Number(e.target.value))}
              className="w-[80px]"
            />
          </div>
        </div>
        <FieldRow label="FTM AP to AP Ranging" inline>
          <Switch
            checked={form.apRanging === true}
            onCheckedChange={(v) => update('apRanging', v)}
            aria-label="FTM AP to AP Ranging"
          />
        </FieldRow>
      </Section>
    </div>
  );
}
