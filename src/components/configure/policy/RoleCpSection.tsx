/**
 * Role captive-portal redirection section — visible only while the role has a
 * FILTERACTION_REDIRECT rule (ng-show="hasRedirectRule()" parity): redirect
 * URL with token/dest note, use-existing-settings select over other redirect
 * roles, ECP Advanced dialog, walled-garden "Add Allow Rules" builder, portal
 * identity + masked shared secret.
 */
import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { FieldRow, MaskedInput, Section } from '../_kit';
import { EnumSelect } from './fields';
import { EcpAdvancedDialog, GardenRuleDialog } from './RoleDialogs';
import type { Role } from '../../../types/configure';
import type { RoleRuleDraft } from './localTypes';

export interface RoleCpSectionProps {
  form: Partial<Role> & Record<string, unknown>;
  upd: (path: string, value: unknown) => void;
  /** Other roles that already carry a cpRedirect (for "Use Existing Settings"). */
  redirectRoles: Role[];
  /** Appends walled-garden allow rules to l3Filters. */
  onAddAllowRules: (rules: RoleRuleDraft[]) => void;
}

export function RoleCpSection({ form, upd, redirectRoles, onAddAllowRules }: RoleCpSectionProps) {
  const [ecpOpen, setEcpOpen] = useState(false);
  const [gardenOpen, setGardenOpen] = useState(false);

  return (
    <>
      <Section
        title="Captive Portal Redirection"
        description={'"token=<int>&dest=<url>" is appended to the redirect URL'}
      >
        {redirectRoles.length > 0 && (
          <FieldRow label="Use Existing Settings">
            <EnumSelect
              value=""
              placeholder="— Select —"
              options={[
                { id: '', label: '— Select —' },
                ...redirectRoles.map((r) => ({
                  id: r.id,
                  label: `${r.cpRedirect} (${r.name})`,
                })),
              ]}
              onChange={(v) => {
                const src = redirectRoles.find((r) => r.id === v);
                if (src) upd('cpRedirect', src.cpRedirect);
              }}
              className="w-80"
              aria-label="Use existing redirect settings"
            />
          </FieldRow>
        )}
        <FieldRow label="Redirect URL">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={String(form.cpRedirect ?? '')}
              placeholder="https://portal.example.com/login"
              onChange={(e) => upd('cpRedirect', e.target.value)}
              className="w-80"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => setEcpOpen(true)}>
              Advanced
            </Button>
            {form.cpRedirect && (
              <Button type="button" variant="link" size="sm" onClick={() => setGardenOpen(true)}>
                Add Allow Rules
              </Button>
            )}
          </div>
        </FieldRow>
        {form.cpRedirect && (
          <>
            <FieldRow label="Portal Identity">
              <Input
                value={String(form.cpIdentity ?? '')}
                onChange={(e) => upd('cpIdentity', e.target.value)}
                className="w-60"
              />
            </FieldRow>
            <FieldRow label="Shared Secret">
              <MaskedInput
                value={String(form.cpSharedKey ?? '')}
                onChange={(v) => upd('cpSharedKey', v)}
                className="w-60"
              />
            </FieldRow>
          </>
        )}
      </Section>

      <EcpAdvancedDialog open={ecpOpen} onOpenChange={setEcpOpen} form={form} upd={upd} />
      <GardenRuleDialog open={gardenOpen} onOpenChange={setGardenOpen} onAddRules={onAddAllowRules} />
    </>
  );
}
