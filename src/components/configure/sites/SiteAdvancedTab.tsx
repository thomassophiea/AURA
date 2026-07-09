/**
 * Site editor · Advanced tab. Adoption Preference maps to the real v3 record
 * key `preferredAffinity`. The controller's other Advanced controls
 * (band steering, secure tunnel, SSH, session persistence, syslog, radio load
 * control) live on a v1 site resource absent from the v3 payload (parity gap
 * 27) and are intentionally not surfaced here.
 */
import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { FieldRow } from '../_kit';
import type { SiteTabProps } from './siteEditorTypes';
import { ADOPTION_PREFERENCE } from './siteModel';

export function SiteAdvancedTab({ form, update }: SiteTabProps) {
  return (
    <div className="max-w-[640px] space-y-1">
      <FieldRow label="Adoption Preference">
        <Select
          value={form.preferredAffinity || 'Any'}
          onValueChange={(v) => update('preferredAffinity', v)}
        >
          <SelectTrigger className="max-w-[300px]" aria-label="Adoption Preference">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ADOPTION_PREFERENCE.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>
      <p className="pt-3 text-[12.5px] text-muted-foreground">
        Band steering, secure tunnel, SSH and session-persistence controls target a v1 site
        resource that is not part of the v3 site document; they are omitted from this editor.
      </p>
    </div>
  );
}
