/**
 * Availability (HA pair) + Mobility editor over the two live singletons
 * /platformmanager/v1/availability and /platformmanager/v1/mobility
 * (system-availability.html parity). Availability toggle reveals Role /
 * Peer IP / Secure tunnel / Auto AP Balancing / MTU; Mobility is only offered
 * on a paired appliance (the Gateway gates it the same way) and adds
 * Manager/Agent role, Port (from the appliance's own interfaces), discovery,
 * heartbeat, manager addresses and the agents list with an Approve affordance.
 *
 * Saving reconfigures an HA pair, so Save sits behind an explicit confirm.
 * The '0.0.0.0' ⇄ empty-field sentinel mapping lives in availabilityModel.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../ui/button';
import { ArrayEditor, ConfirmDialog, Section } from '../_kit';
import {
  availabilityService,
  invalidatePairedCache,
  listPlatformInterfaces,
  mobilityService,
} from '../../../services/configure/availabilityService';
import type {
  AvailabilityRole,
  AvailabilitySettings,
  DiscoveryMethod,
  MobilityAgent,
  MobilityRole,
  MobilitySettings,
  PlatformInterface,
} from '../../../services/configure/availabilityService';
import {
  AVAIL_ROLES,
  DISCOVERY_METHODS,
  MOBILITY_ROLES,
  UNSET,
  availabilityErrors,
  mobilityErrors,
  noErrors,
  shownIp,
  toSentinel,
} from './availabilityModel';
import { useSingleton } from './useSingleton';
import { SettingsShell } from './SettingsShell';
import { NumberField, SelectField, SwitchField, TextField } from './systemFields';

export function AvailabilityTab() {
  const avail = useSingleton<AvailabilitySettings>(availabilityService, 'availability settings');
  const mobility = useSingleton<MobilitySettings>(mobilityService, 'mobility settings');

  const [form, setForm] = useState<AvailabilitySettings | null>(null);
  const availInitial = useRef('');
  const availSeededFor = useRef<AvailabilitySettings | null>(null);
  if (avail.record && availSeededFor.current !== avail.record) {
    availSeededFor.current = avail.record;
    const clone = structuredClone(avail.record);
    setForm(clone);
    availInitial.current = JSON.stringify(clone);
  }

  const [mob, setMob] = useState<MobilitySettings | null>(null);
  const mobInitial = useRef('');
  const mobSeededFor = useRef<MobilitySettings | null>(null);
  if (mobility.record && mobSeededFor.current !== mobility.record) {
    mobSeededFor.current = mobility.record;
    const clone = structuredClone(mobility.record);
    setMob(clone);
    mobInitial.current = JSON.stringify(clone);
  }

  // Port options come from the appliance's own interfaces (load on mount only).
  const [interfaces, setInterfaces] = useState<PlatformInterface[]>([]);
  const loadInterfaces = useCallback(async () => {
    try {
      setInterfaces(await listPlatformInterfaces());
    } catch {
      setInterfaces([]); // the Port select degrades to the unset sentinel
    }
  }, []);
  useEffect(() => {
    void loadInterfaces();
  }, [loadInterfaces]);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const availDirty = form != null && JSON.stringify(form) !== availInitial.current;
  const mobDirty = mob != null && JSON.stringify(mob) !== mobInitial.current;
  const dirty = availDirty || mobDirty;

  const on = form?.availabilityEnabled === true;
  const mobOn = on && mob?.mobilityEnabled === true;
  const isManager = mob?.role === 'Manager';
  const staticDiscovery = mob?.discoveryMethod === 'StaticConfiguration';

  const availErrs = form ? availabilityErrors(form) : {};
  const mobErrs = mob ? mobilityErrors(mob, on) : {};
  const valid = noErrors(availErrs) && noErrors(mobErrs);

  const patch = (next: Partial<AvailabilitySettings>) =>
    setForm((p) => (p ? { ...p, ...next } : p));
  const patchMob = (next: Partial<MobilitySettings>) => setMob((p) => (p ? { ...p, ...next } : p));

  const refresh = () => {
    void avail.refresh();
    void mobility.refresh();
    void loadInterfaces();
  };

  const doSave = async () => {
    setConfirmOpen(false);
    if (availDirty && form) {
      const saved = await avail.save(form);
      if (saved) invalidatePairedCache();
    }
    if (mobDirty && mob) await mobility.save(mob);
  };

  const agents = mob?.agents ?? [];
  const portOptions =
    interfaces.filter((i) => i.ipAddress).length > 0
      ? interfaces
          .filter((i) => i.ipAddress)
          .map((i) => ({
            id: i.ipAddress as string,
            label: `${i.name || i.ipAddress} — ${i.ipAddress}`,
          }))
      : [{ id: UNSET, label: '— no interface —' }];
  // Keep a stale/unlisted current value selectable so the record round-trips.
  const portValue = mob?.physicalIfIp || UNSET;
  const portOptionsWithCurrent = portOptions.some((o) => o.id === portValue)
    ? portOptions
    : [...portOptions, { id: portValue, label: portValue }];

  return (
    <SettingsShell
      title="Availability"
      description="Appliance HA pairing and mobility (/platformmanager/v1/availability, /platformmanager/v1/mobility)."
      loading={avail.loading || mobility.loading}
      saving={avail.saving || mobility.saving}
      // Save is also validity-gated: an invalid draft cannot be submitted.
      dirty={dirty && valid}
      ready={form != null && mob != null}
      onRefresh={refresh}
      onSave={() => setConfirmOpen(true)}
    >
      {form && mob && (
        <>
          <Section title="Availability">
            <SwitchField
              label="Availability"
              checked={on}
              onChange={(v) => patch({ availabilityEnabled: v })}
              description={
                !on
                  ? 'This appliance is not paired. Enabling availability pairs it with a peer and makes the Peer Address block available on Bridged@AC VLANs with Layer 3.'
                  : undefined
              }
            />
            {on && (
              <>
                <SelectField
                  label="Role"
                  value={form.availabilityRole || 'PRIMARY'}
                  onChange={(v) => patch({ availabilityRole: v as AvailabilityRole })}
                  options={AVAIL_ROLES}
                />
                <TextField
                  label="Peer IP Address"
                  value={form.availabilityPairAddr ?? ''}
                  onChange={(v) => patch({ availabilityPairAddr: v })}
                  error={availErrs.pair}
                  placeholder="192.168.100.13"
                  required
                />
                <SwitchField
                  label="Secure tunnel"
                  checked={form.secureConnection === true}
                  onChange={(v) => patch({ secureConnection: v })}
                />
                <SwitchField
                  label="Auto AP Balancing"
                  checked={form.balanceAps !== false}
                  onChange={(v) => patch({ balanceAps: v })}
                />
                <NumberField
                  label="MTU [Bytes]"
                  value={form.staticMtu ?? ''}
                  onChange={(v) => patch({ staticMtu: v === '' ? (NaN as number) : v })}
                  error={availErrs.mtu}
                  min={600}
                  max={1500}
                />
              </>
            )}
          </Section>

          {/* Mobility is only offered on a paired appliance, as the Gateway gates it. */}
          {on && (
            <Section title="Mobility">
              <SwitchField
                label="Mobility"
                checked={mobOn}
                onChange={(v) => patchMob({ mobilityEnabled: v })}
              />
              {mobOn && (
                <>
                  <SelectField
                    label="Mobility Role"
                    value={mob.role || 'Agent'}
                    onChange={(v) => patchMob({ role: v as MobilityRole })}
                    options={MOBILITY_ROLES}
                  />
                  <SelectField
                    label="Port"
                    value={portValue}
                    onChange={(v) => patchMob({ physicalIfIp: v })}
                    options={portOptionsWithCurrent}
                    description="Appliance interface the mobility service binds to."
                  />
                  <SelectField
                    label="Discovery Method"
                    value={mob.discoveryMethod || 'SLPD'}
                    onChange={(v) => patchMob({ discoveryMethod: v as DiscoveryMethod })}
                    options={DISCOVERY_METHODS}
                  />
                  {isManager && (
                    <>
                      <NumberField
                        label="Heartbeat"
                        value={mob.heartbeat ?? ''}
                        onChange={(v) => patchMob({ heartbeat: v === '' ? (NaN as number) : v })}
                        error={mobErrs.heartbeat}
                        min={1}
                        max={300}
                      />
                      <TextField
                        label="Backup Manager Address"
                        value={shownIp(mob.mobilityBackupManagerIp)}
                        onChange={(v) => patchMob({ mobilityBackupManagerIp: toSentinel(v) })}
                        error={mobErrs.backupManager}
                        placeholder="0.0.0.0 = not set"
                      />
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Agents</p>
                        <ArrayEditor<MobilityAgent>
                          items={agents}
                          onChange={(items) => patchMob({ agents: items })}
                          createItem={() => ({ ip: '', state: 'Pending' })}
                          addLabel="Add Agent"
                          emptyText="No agents."
                          getItemTitle={(a, i) =>
                            `${a.ip || `Agent ${i + 1}`} · ${a.state || 'Pending'}`
                          }
                          renderItem={(a, i, update) => (
                            <>
                              <TextField
                                label="Agent IP Address"
                                value={a.ip ?? ''}
                                onChange={(v) => update({ ...a, ip: v })}
                                error={mobErrs[`agent${i}`]}
                                placeholder="10.0.0.2"
                                required
                              />
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-muted-foreground">
                                  {a.state || 'Pending'}
                                </span>
                                {a.state !== 'Approved' && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => update({ ...a, state: 'Approved' })}
                                  >
                                    Approve
                                  </Button>
                                )}
                              </div>
                            </>
                          )}
                        />
                      </div>
                    </>
                  )}
                  {/* Agent + static discovery is the only case needing the manager's address. */}
                  {!isManager && staticDiscovery && (
                    <TextField
                      label="Manager Address"
                      value={shownIp(mob.mobilityManagerIp)}
                      onChange={(v) => patchMob({ mobilityManagerIp: toSentinel(v) })}
                      error={mobErrs.manager}
                      placeholder="10.0.0.1"
                      required
                    />
                  )}
                </>
              )}
            </Section>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Reconfigure availability pair?"
        description="This changes the high-availability configuration of this appliance and its peer. Access points may re-home between the paired appliances and the peer connection will be re-established. Make sure the peer appliance is reachable before saving."
        confirmLabel="Save"
        destructive
        onConfirm={doSave}
      />
    </SettingsShell>
  );
}

export default AvailabilityTab;
