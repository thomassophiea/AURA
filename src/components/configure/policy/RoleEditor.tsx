/**
 * Role editor (controller role_config.html parity):
 *  - Default Action Allow / Deny / Contain to VLAN (required VLAN target with
 *    inline VLAN add/edit/delete via the real VLAN editor)
 *  - CoS Bandwidth Limit: existing-CoS mode or CIR mode (128–500000 Kbps input
 *    + slider); saving CIR mode synthesizes the role CoS + rate-limiter pair on
 *    the controller exactly like its internal `Role_1_COS`
 *  - Captive-portal redirection block gated on a FILTERACTION_REDIRECT rule
 *    (redirect URL, use-existing-settings, ECP Advanced modal, walled-garden
 *    Add Allow Rules, portal identity + masked shared secret)
 *  - Four rule groups as collapsible sections with ordered, editable rows
 */
import React, { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { Input } from '../../ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { RadioGroup, RadioGroupItem } from '../../ui/radio-group';
import { Slider } from '../../ui/slider';
import { Pencil, Plus, X } from 'lucide-react';
import { ConfirmDialog, EditorSheet, FieldRow, MaskedInput, RuleList, Section, useDefaults } from '../_kit';
import { EnumSelect, IconAction, NumInput } from './fields';
import { RoleRuleDialog } from './RoleRuleDialog';
import { EcpAdvancedDialog, GardenRuleDialog, ProfilesDialog } from './RoleDialogs';
import { VlanEditor } from './VlanEditor';
import {
  CIR_MAX,
  CIR_MIN,
  NO_COS_ID,
  ROLE_DEFAULT_ACTIONS,
  ROLE_RULE_GROUPS,
  type Opt,
} from './constants';
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
import {
  cosService,
  rateLimitersService,
  topologiesService,
} from '../../../services/configure';
import type { Cos, Role, Topology } from '../../../types/configure';
import type { RoleRuleDraft, RoleRuleGroupKey, TopologyDraft } from './localTypes';

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
  const [ecpOpen, setEcpOpen] = useState(false);
  const [gardenOpen, setGardenOpen] = useState(false);
  const [cosAdvOpen, setCosAdvOpen] = useState(false);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [vlanModal, setVlanModal] = useState<{ record: Topology | null } | null>(null);
  const [vlanSaving, setVlanSaving] = useState(false);
  const [vlanDel, setVlanDel] = useState<Topology | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const topoDefaults = useDefaults<Topology>(topologiesService.getDefault, 'VLAN');
  const [vlanSeed, setVlanSeed] = useState<TopologyDraft | null>(null);

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

  /* inline VLAN add/edit/delete from the VLAN ID row */
  const openVlanCreate = async () => {
    const seed = await topoDefaults.load();
    if (!seed) return;
    const { id: _id, ...rest } = seed as Topology;
    setVlanSeed(rest as TopologyDraft);
    setVlanModal({ record: null });
  };
  const submitInlineVlan = async (payload: TopologyDraft, id?: string) => {
    setVlanSaving(true);
    try {
      const saved = id
        ? await topologiesService.update(id, payload as Partial<Topology>)
        : await topologiesService.create(payload as Partial<Topology>);
      toast.success(id ? `Updated VLAN "${saved.name}"` : `Created VLAN "${saved.name}"`);
      await reloadTopologies();
      upd('topology', saved.id);
      setVlanModal(null);
    } catch (error) {
      toast.error('Failed to save VLAN', { description: getUserFriendlyMessage(error) });
    } finally {
      setVlanSaving(false);
    }
  };
  const deleteInlineVlan = async () => {
    if (!vlanDel) return;
    try {
      await topologiesService.remove(vlanDel.id);
      toast.success(`Deleted VLAN "${vlanDel.name}"`);
      await reloadTopologies();
      if (form.topology === vlanDel.id) upd('topology', null);
    } catch (error) {
      toast.error('Failed to delete VLAN', { description: getUserFriendlyMessage(error) });
    } finally {
      setVlanDel(null);
    }
  };

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

            <FieldRow label="CoS Bandwidth Limit" error={bw.enabled && bw.mode === 'cir' && bw.cirKbps !== '' ? errs.cir : undefined}>
              <div className="flex flex-wrap items-center gap-3">
                <Checkbox
                  checked={bw.enabled}
                  aria-label="Enable CoS bandwidth limit"
                  onCheckedChange={(checked) => setBwState({ enabled: checked === true })}
                />
                {bw.enabled && bw.mode === 'existing' && (
                  <>
                    <span className="text-sm text-muted-foreground">
                      Class of Service: {cosName}
                    </span>
                    <IconAction
                      title="Clear CoS"
                      onClick={() => {
                        upd('defaultCos', NO_COS_ID);
                        setBwState({ mode: 'cir', cirKbps: '' });
                      }}
                    >
                      <X className="h-4 w-4" />
                    </IconAction>
                  </>
                )}
                {bw.enabled && bw.mode === 'cir' && (
                  <>
                    <NumInput
                      value={bw.cirKbps}
                      min={CIR_MIN}
                      max={CIR_MAX}
                      placeholder="CIR Kbps"
                      aria-label="CIR Kbps"
                      onChange={(v) => setBwState({ cirKbps: v })}
                      className="w-32"
                    />
                    <Slider
                      value={[inRange(bw.cirKbps, CIR_MIN, CIR_MAX) ? Number(bw.cirKbps) : CIR_MIN]}
                      min={CIR_MIN}
                      max={CIR_MAX}
                      step={1}
                      className="w-44"
                      onValueChange={([v]) => setBwState({ cirKbps: v })}
                    />
                    <span className="text-xs text-muted-foreground">
                      Kbps ({CIR_MIN}–{CIR_MAX})
                    </span>
                  </>
                )}
                {bw.enabled && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCosAdvOpen(true)}
                  >
                    Configure CoS
                  </Button>
                )}
              </div>
            </FieldRow>

            <FieldRow label="Default Action" error={errs.topology}>
              <div className="flex flex-wrap items-center gap-4">
                <EnumSelect
                  value={String(form.defaultAction || 'deny')}
                  options={ROLE_DEFAULT_ACTIONS}
                  onChange={(v) => upd('defaultAction', v)}
                  className="w-44"
                  aria-label="Default action"
                />
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-muted-foreground">VLAN ID</span>
                  <EnumSelect
                    value={String(form.topology ?? '')}
                    options={[{ id: '', label: 'Use default VLAN of Network' }, ...vlanOptions]}
                    onChange={(v) => upd('topology', v || null)}
                    className="w-60"
                    aria-label="Default VLAN"
                  />
                  <IconAction title="Add VLAN" onClick={() => void openVlanCreate()}>
                    <Plus className="h-4 w-4" />
                  </IconAction>
                  {form.topology && (
                    <>
                      <IconAction
                        title="Edit VLAN"
                        onClick={() => {
                          const rec = topologies.find((t) => t.id === form.topology);
                          if (rec) setVlanModal({ record: rec });
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </IconAction>
                      <IconAction
                        title="Delete VLAN"
                        destructive
                        onClick={() => {
                          const rec = topologies.find((t) => t.id === form.topology);
                          if (rec) setVlanDel(rec);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </IconAction>
                    </>
                  )}
                </div>
              </div>
            </FieldRow>

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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEcpOpen(true)}
                  >
                    Advanced
                  </Button>
                  {form.cpRedirect && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => setGardenOpen(true)}
                    >
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
                  onClick={() =>
                    setRuleModal({ key, label, idx: null, draft: newRuleDraft(key) })
                  }
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

      {/* ECP advanced / walled garden / profiles */}
      <EcpAdvancedDialog open={ecpOpen} onOpenChange={setEcpOpen} form={form} upd={upd} />
      <GardenRuleDialog
        open={gardenOpen}
        onOpenChange={setGardenOpen}
        onAddRules={(rules) => upd('l3Filters', [...rulesOf('l3Filters'), ...rules])}
      />
      <ProfilesDialog
        open={profilesOpen}
        onOpenChange={setProfilesOpen}
        selectedIds={(form.profiles as string[] | undefined) ?? []}
        onChange={(ids) => upd('profiles', ids)}
      />

      {/* roleCosAdvanced: existing CoS vs role-specific rate limit */}
      <Dialog open={cosAdvOpen} onOpenChange={setCosAdvOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configure Class of Service</DialogTitle>
            <DialogDescription>
              Use an existing CoS or create a role-specific rate-limited CoS.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <RadioGroup
              value={bw.mode}
              onValueChange={(m) => setBwState({ mode: m as 'existing' | 'cir' })}
              className="space-y-3"
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="existing" /> Use an existing Class of Service
              </label>
              {bw.mode === 'existing' && (
                <FieldRow label="Class of Service">
                  <EnumSelect
                    value={hasRealCos ? String(form.defaultCos) : ''}
                    options={[{ id: '', label: 'None' }, ...cosOptions]}
                    onChange={(v) => upd('defaultCos', v || NO_COS_ID)}
                    className="w-64"
                  />
                </FieldRow>
              )}
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="cir" /> Advanced settings (create a role-specific CoS)
              </label>
              {bw.mode === 'cir' && (
                <FieldRow
                  label="Average Rate (CIR)"
                  error={bw.cirKbps !== '' ? errs.cir : undefined}
                  description="Kbps"
                >
                  <NumInput
                    value={bw.cirKbps}
                    min={CIR_MIN}
                    max={CIR_MAX}
                    onChange={(v) => setBwState({ cirKbps: v })}
                    className="w-36"
                  />
                </FieldRow>
              )}
            </RadioGroup>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setCosAdvOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* inline VLAN editor + delete confirm */}
      {vlanModal && (
        <VlanEditor
          key={vlanModal.record?.id ?? 'new'}
          open
          onOpenChange={(next) => !next && setVlanModal(null)}
          initial={(vlanModal.record as TopologyDraft) ?? vlanSeed ?? {}}
          isNew={!vlanModal.record}
          saving={vlanSaving}
          onSubmit={submitInlineVlan}
          topologies={topologies}
        />
      )}
      <ConfirmDialog
        open={vlanDel !== null}
        onOpenChange={(next) => !next && setVlanDel(null)}
        title={`Delete VLAN "${vlanDel?.name ?? ''}"?`}
        description={
          vlanDel?.canDelete === false
            ? `"${vlanDel.name}" cannot be deleted (predefined or in use).`
            : 'This permanently removes the VLAN from the controller. This action cannot be undone.'
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (vlanDel?.canDelete === false) {
            setVlanDel(null);
            return;
          }
          void deleteInlineVlan();
        }}
      />
    </>
  );
}
