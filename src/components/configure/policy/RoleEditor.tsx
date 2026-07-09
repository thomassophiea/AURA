/**
 * Role editor (controller role_config.html parity):
 *  - Default Action Allow / Deny / Contain to VLAN (required VLAN target with
 *    inline VLAN add/edit/delete — RoleVlanField)
 *  - CoS Bandwidth Limit: existing-CoS mode or CIR mode (RoleBandwidthField);
 *    saving CIR mode synthesizes the role CoS + rate-limiter pair on the
 *    controller exactly like its internal `Role_1_COS`
 *  - Captive-portal redirection block gated on a FILTERACTION_REDIRECT rule
 *    (RoleCpSection: redirect URL, use-existing, ECP Advanced, walled garden)
 *  - Four rule groups as collapsible sections with ordered, editable rows
 */
import React, { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Pencil } from 'lucide-react';
import { EditorSheet, FieldRow, RuleList, Section } from '../_kit';
import { IconAction } from './fields';
import { RoleRuleDialog } from './RoleRuleDialog';
import { ProfilesDialog } from './RoleDialogs';
import { RoleBandwidthField } from './RoleBandwidthField';
import { RoleCpSection } from './RoleCpSection';
import { RoleVlanField } from './RoleVlanField';
import { CIR_MAX, CIR_MIN, NO_COS_ID, ROLE_RULE_GROUPS, type Opt } from './constants';
import {
  hasRedirectRule,
  inRange,
  newRuleDraft,
  roleErrors,
  ruleActionLabel,
  ruleDisplayName,
  ruleMatchText,
  vlanOptionLabel,
  type RoleBandwidthState,
} from './policyUtils';
import { useDraft } from './useDraft';
import { getUserFriendlyMessage } from '../../../services/errorHandler';
import { cosService, rateLimitersService } from '../../../services/configure';
import type { Cos, Role, Topology } from '../../../types/configure';
import type { RoleRuleDraft, RoleRuleGroupKey } from './localTypes';

interface RuleModalState {
  key: RoleRuleGroupKey;
  label: string;
  idx: number | null;
  draft: RoleRuleDraft;
}

export interface RoleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Record to edit, or the /default seed for creates. */
  initial: Partial<Role>;
  isNew: boolean;
  saving: boolean;
  onSubmit: (payload: Partial<Role>, id?: string) => void | Promise<void>;
  topologies: Topology[];
  cos: Cos[];
  roles: Role[];
  reloadTopologies: () => Promise<void>;
  reloadCos: () => Promise<void>;
}

export function RoleEditor({
  open,
  onOpenChange,
  initial,
  isNew,
  saving,
  onSubmit,
  topologies,
  cos,
  roles,
  reloadTopologies,
  reloadCos,
}: RoleEditorProps) {
  const { form, upd, dirty } = useDraft<Partial<Role> & Record<string, unknown>>(initial);
  const predefined = form.predefined === true;

  /* CoS bandwidth — persisted field is defaultCos (role_config.html:80–122) */
  const hasRealCos = !!form.defaultCos && form.defaultCos !== NO_COS_ID;
  const [bw, setBw] = useState<RoleBandwidthState>(() => ({
    enabled: hasRealCos,
    mode: hasRealCos ? 'existing' : 'cir',
    cirKbps: '',
  }));
  const [bwDirty, setBwDirty] = useState(false);
  const setBwState = (patch: Partial<RoleBandwidthState>) => {
    setBw((p) => ({ ...p, ...patch }));
    setBwDirty(true);
  };

  const [ruleModal, setRuleModal] = useState<RuleModalState | null>(null);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);

  const vlanOptions: Opt[] = topologies.map((t) => ({ id: t.id, label: vlanOptionLabel(t) }));
  const cosOptions: Opt[] = cos.map((c) => ({ id: c.id, label: c.cosName }));

  const errs = roleErrors(form, bw);
  const valid = Object.keys(errs).length === 0;
  const cosName = hasRealCos
    ? (cos.find((c) => c.id === form.defaultCos)?.cosName ?? String(form.defaultCos))
    : 'No CoS';

  /* rules — ordered, editable, deletable (rulePopover parity) */
  const rulesOf = (key: RoleRuleGroupKey): RoleRuleDraft[] =>
    ((form[key] as RoleRuleDraft[] | undefined) ?? []) as RoleRuleDraft[];
  const saveRule = (draft: RoleRuleDraft) => {
    if (!ruleModal) return;
    const next = rulesOf(ruleModal.key).slice();
    if (ruleModal.idx != null) next[ruleModal.idx] = draft;
    else next.push(draft);
    upd(ruleModal.key, next);
    setRuleModal(null);
  };

  /* redirect panel is gated on the role actually having a redirect rule */
  const redirectVisible = hasRedirectRule(form);
  const redirectRoles = roles.filter((r) => r.cpRedirect && r.id !== form.id);

  /**
   * Save. CIR mode synthesizes the role rate limiter + CoS on the controller
   * (the controller does the same internally, e.g. `Role_1_COS`).
   */
  const handleSave = async () => {
    const payload = structuredClone(form) as Partial<Role>;
    try {
      if (!bw.enabled) {
        payload.defaultCos = NO_COS_ID;
      } else if (bw.mode === 'cir' && inRange(bw.cirKbps, CIR_MIN, CIR_MAX)) {
        setSynthesizing(true);
        const baseName = String(payload.name || 'Role');
        const rl = await rateLimitersService.create({
          name: `${baseName}_RL`,
          cirKbps: Number(bw.cirKbps),
        });
        const cosRec = await cosService.create({
          cosName: `${baseName}_COS`,
          predefined: false,
          cosQos: { priority: 'notApplicable', tosDscp: null, mask: null },
          inboundRateLimiterId: rl.id,
          outboundRateLimiterId: rl.id,
        });
        payload.defaultCos = cosRec.id;
        await reloadCos();
      }
    } catch (error) {
      toast.error('Failed to create the role bandwidth CoS', {
        description: getUserFriendlyMessage(error),
      });
      setSynthesizing(false);
      return;
    }
    setSynthesizing(false);
    await onSubmit(payload, isNew ? undefined : form.id);
  };

  return (
    <>
      <EditorSheet
        open={open}
        onOpenChange={onOpenChange}
        title={isNew ? 'Add Role' : String(form.name || 'Role')}
        description="Client access role — default action, bandwidth, captive portal and firewall rules"
        width={840}
        dirty={dirty || bwDirty}
        valid={valid}
        saving={saving || synthesizing}
        onSave={handleSave}
      >
        <div className="space-y-6">
          <Section title="General">
            <FieldRow
              label="Name"
              required
              error={errs.name}
              description={predefined ? 'Predefined roles cannot be renamed' : undefined}
            >
              <Input
                value={String(form.name ?? '')}
                maxLength={64}
                disabled={predefined}
                onChange={(e) => upd('name', e.target.value)}
                className="w-80"
              />
            </FieldRow>

            <RoleBandwidthField
              bw={bw}
              onBwChange={setBwState}
              cosName={cosName}
              hasRealCos={hasRealCos}
              defaultCos={form.defaultCos}
              cosOptions={cosOptions}
              onDefaultCosChange={(id) => upd('defaultCos', id)}
              cirError={errs.cir}
            />

            <RoleVlanField
              defaultAction={String(form.defaultAction || 'deny')}
              onDefaultActionChange={(v) => upd('defaultAction', v)}
              topologyId={form.topology}
              onTopologyChange={(id) => upd('topology', id)}
              topologies={topologies}
              reloadTopologies={reloadTopologies}
              error={errs.topology}
            />

            <FieldRow label="Associated Profiles">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {(form.profiles ?? []).length > 0
                    ? `${(form.profiles ?? []).length} profile(s)`
                    : 'Role is not associated with any Profiles'}
                </span>
                <IconAction title="Edit associated profiles" onClick={() => setProfilesOpen(true)}>
                  <Pencil className="h-4 w-4" />
                </IconAction>
              </div>
            </FieldRow>
          </Section>

          {/* ── Captive portal redirection — gated on a redirect rule ── */}
          {redirectVisible && (
            <RoleCpSection
              form={form}
              upd={upd}
              redirectRoles={redirectRoles}
              onAddAllowRules={(rules) => upd('l3Filters', [...rulesOf('l3Filters'), ...rules])}
            />
          )}

          {/* ── Rule groups ── */}
          {ROLE_RULE_GROUPS.map(([key, label]) => {
            const rules = rulesOf(key);
            return (
              <Section
                key={key}
                collapsible
                defaultOpen={false}
                title={`${label} (${rules.length} ${rules.length === 1 ? 'Rule' : 'Rules'})`}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRuleModal({ key, label, idx: null, draft: newRuleDraft(key) })}
                >
                  New Rule
                </Button>
                <RuleList<RoleRuleDraft>
                  items={rules}
                  onChange={(next) => upd(key, next)}
                  emptyText="No rules defined."
                  onEdit={(index) =>
                    setRuleModal({
                      key,
                      label,
                      idx: index,
                      draft: structuredClone(rules[index]),
                    })
                  }
                  renderSummary={(rule) => (
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="truncate font-medium">{ruleDisplayName(rule, key)}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {ruleActionLabel(rule, key)}
                      </span>
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {ruleMatchText(rule, key)}
                      </span>
                    </div>
                  )}
                />
              </Section>
            );
          })}
        </div>
      </EditorSheet>

      {/* rule popover */}
      {ruleModal && (
        <RoleRuleDialog
          open
          onOpenChange={(next) => !next && setRuleModal(null)}
          groupKey={ruleModal.key}
          groupLabel={ruleModal.label}
          initialDraft={ruleModal.draft}
          editIndex={ruleModal.idx}
          vlanOptions={vlanOptions}
          cosOptions={cosOptions}
          onSave={saveRule}
        />
      )}

      <ProfilesDialog
        open={profilesOpen}
        onOpenChange={setProfilesOpen}
        selectedIds={(form.profiles as string[] | undefined) ?? []}
        onChange={(ids) => upd('profiles', ids)}
      />
    </>
  );
}
