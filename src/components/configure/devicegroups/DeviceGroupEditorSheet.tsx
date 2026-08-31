/**
 * Aggregated Device Group editor (PLM §7e): one binding — Name, Profile
 * (choosing it chooses the hardware), read-only AP Platform, RF policy whose
 * kind follows the Profile's feature flags — applied to many sites. The Sites
 * tab manages membership; only the per-site AP set varies. Changing the
 * Profile re-platforms every member site and drops off-platform APs, which is
 * confirmed before it happens. A conflict banner states (never averages away)
 * member sites that resolve to more than one Profile or RF policy.
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { ConfirmDialog, EditorSheet, FieldRow } from '../_kit';
import type { ApProfile, RfMgmtPolicy, SiteConfig } from '../../../types/configure';
import {
  RF_KIND_LABEL,
  aggregateDeviceGroups,
  apEligibility,
  buildClaimIndex,
  countReplatformDrops,
  createInstanceGroup,
  dropOffPlatformSerials,
  rfKindForProfile,
  rfOptionsForKind,
  validateAggregatedGroup,
  type AggregatedDeviceGroup,
  type AggregatedGroupForm,
  type DeviceGroupAp,
  type DeviceGroupClone,
  type DeviceGroupInstance,
} from './devicegroupsModel';
import { SiteMembershipDialog } from './SiteMembershipDialog';
import { AddSiteDialog } from './AddSiteDialog';

const NONE = '__none__';

export interface DeviceGroupEditorSheetProps {
  /** Aggregated group being edited, or null to create. */
  record: AggregatedDeviceGroup | null;
  /**
   * Clone starting point (record must be null): the source's binding under a
   * new unique name with zero member sites; its vestigial template is used for
   * every per-site record added here instead of bare defaults.
   */
  seed?: DeviceGroupClone;
  sites: SiteConfig[];
  profiles: ApProfile[];
  rfPolicies: RfMgmtPolicy[];
  aps: DeviceGroupAp[];
  saving: boolean;
  onSave: (form: AggregatedGroupForm) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
}

export function DeviceGroupEditorSheet({
  record,
  seed,
  sites,
  profiles,
  rfPolicies,
  aps,
  saving,
  onSave,
  onDelete,
  onOpenChange,
}: DeviceGroupEditorSheetProps) {
  const [form, setForm] = useState<AggregatedGroupForm>(() =>
    record
      ? {
          groupName: record.groupName,
          profileId: record.profileId,
          rfMgmtPolicyId: record.rfMgmtPolicyId,
          instances: structuredClone(record.instances),
        }
      : structuredClone(
          seed?.form ?? { groupName: '', profileId: '', rfMgmtPolicyId: '', instances: [] }
        )
  );
  const [dirty, setDirty] = useState(record == null);
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [membershipAt, setMembershipAt] = useState<number | null>(null);
  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isNew = record == null;
  const readOnly = record != null && !record.canEdit;

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const rfById = useMemo(() => new Map(rfPolicies.map((r) => [r.id, r])), [rfPolicies]);
  const apsBySerial = useMemo(() => new Map(aps.map((a) => [a.serialNumber, a])), [aps]);

  const profile = profileById.get(form.profileId) ?? null;
  const platform = profile?.apPlatform ?? '';
  const rfKind = rfKindForProfile(profile);
  const rfOptions = rfOptionsForKind(rfPolicies, rfKind);

  /** Rule 2 is cluster-wide: exclude only this group's own instance records. */
  const claims = useMemo(
    () => buildClaimIndex(sites, new Set(form.instances.map((i) => i.group.id))),
    [sites, form.instances]
  );

  const otherGroupNames = useMemo(() => {
    return aggregateDeviceGroups(sites)
      .map((g) => g.groupName)
      .filter((n) => n !== record?.groupName);
  }, [sites, record]);

  const memberSites = useMemo(() => {
    const memberIds = new Set(form.instances.map((i) => i.siteId));
    return sites.filter((s) => memberIds.has(s.id));
  }, [sites, form.instances]);

  const errors = validateAggregatedGroup(form, otherGroupNames, rfKind, memberSites);
  const valid = Object.keys(errors).length === 0;

  const update = (patch: Partial<AggregatedGroupForm>) => {
    setDirty(true);
    setForm((prev) => ({ ...prev, ...patch }));
  };

  /* Profile is group-level: applying it re-platforms every member site and
     drops membership that no longer matches (never left as an invalid binding). */
  const applyProfile = (profileId: string) => {
    const nextProfile = profileById.get(profileId) ?? null;
    const nextPlatform = nextProfile?.apPlatform ?? '';
    const nextKind = rfKindForProfile(nextProfile);
    const currentRf = rfById.get(form.rfMgmtPolicyId);
    const rfStillFits =
      nextKind != null && currentRf != null && rfOptionsForKind([currentRf], nextKind).length === 1;
    update({
      profileId,
      rfMgmtPolicyId: rfStillFits ? form.rfMgmtPolicyId : '',
      instances: form.instances.map((i) => ({
        ...i,
        group: {
          ...i.group,
          apSerialNumbers: dropOffPlatformSerials(
            i.group.apSerialNumbers ?? [],
            apsBySerial,
            nextPlatform
          ),
        },
      })),
    });
  };

  const requestProfile = (profileId: string) => {
    if (profileId === form.profileId) return;
    const nextPlatform = profileById.get(profileId)?.apPlatform ?? '';
    if (form.instances.length > 0 && nextPlatform !== platform) {
      setPendingProfileId(profileId);
      return;
    }
    applyProfile(profileId);
  };

  const pendingDrops =
    pendingProfileId != null
      ? countReplatformDrops(
          form.instances,
          apsBySerial,
          profileById.get(pendingProfileId)?.apPlatform ?? ''
        )
      : 0;

  const addSite = (site: SiteConfig) => {
    const instance: DeviceGroupInstance = {
      siteId: site.id,
      siteName: site.siteName,
      siteCanEdit: site.canEdit !== false,
      group: createInstanceGroup(site, form, seed?.template),
    };
    update({ instances: [...form.instances, instance] });
    setAddSiteOpen(false);
  };

  const setMembership = (index: number, serials: string[]) => {
    update({
      instances: form.instances.map((i, j) =>
        j === index ? { ...i, group: { ...i.group, apSerialNumbers: serials } } : i
      ),
    });
    setMembershipAt(null);
  };

  const candidateSites = useMemo(() => {
    const memberIds = new Set(form.instances.map((i) => i.siteId));
    return sites.filter((s) => !memberIds.has(s.id));
  }, [sites, form.instances]);

  const memberNames = form.instances.map((i) => i.siteName);
  const memberAps = form.instances.flatMap((i) =>
    (i.group.apSerialNumbers ?? []).map((sn) => ({ siteName: i.siteName, sn }))
  );

  return (
    <>
      <EditorSheet
        open
        onOpenChange={onOpenChange}
        title={
          isNew
            ? seed
              ? 'Clone Device Group'
              : 'Create Device Group'
            : `Device Group — ${record.groupName}`
        }
        description="One binding — profile, platform, RF policy — applied to every member site"
        width={800}
        dirty={dirty}
        valid={valid && !readOnly && !saving}
        saving={saving}
        onSave={() => void onSave(form)}
        footerExtra={
          !isNew && onDelete ? (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={!record.canDelete || saving}
              title={record.canDelete ? undefined : 'A member site or record is read-only'}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {readOnly && (
            <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              A member site or group record is read-only on this controller — the group can be
              viewed but not saved.
            </p>
          )}
          {record != null && (record.profileConflict || record.rfConflict) && (
            <div className="flex gap-2 rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-2.5 text-[13px]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
              <p>
                <span className="font-semibold">Member sites disagree.</span>
                {record.profileConflict &&
                  ' This group resolves to more than one Profile across its sites.'}
                {record.rfConflict && ' It resolves to more than one RF policy.'} Saving applies the
                Profile and policy above to every member site.
              </p>
            </div>
          )}

          <div className="grid max-w-[520px] gap-3">
            <FieldRow label="Name" error={dirty ? errors.name : null} required>
              <Input
                value={form.groupName}
                disabled={readOnly}
                onChange={(e) => update({ groupName: e.target.value })}
              />
            </FieldRow>
            <FieldRow
              label="Profile"
              error={dirty ? errors.profile : null}
              required
              description="The profile is platform-locked, so choosing it chooses the hardware this group may contain"
            >
              <Select
                value={form.profileId || NONE}
                disabled={readOnly}
                onValueChange={(v) => requestProfile(v === NONE ? '' : v)}
              >
                <SelectTrigger aria-label="Profile">
                  <SelectValue placeholder="— Select —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Select —</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="AP Platform">
              <p className="text-sm font-medium">{platform || '—'}</p>
            </FieldRow>
            {rfKind ? (
              <FieldRow label={RF_KIND_LABEL[rfKind]} error={dirty ? errors.rf : null} required>
                <Select
                  value={form.rfMgmtPolicyId || NONE}
                  disabled={readOnly}
                  onValueChange={(v) => update({ rfMgmtPolicyId: v === NONE ? '' : v })}
                >
                  <SelectTrigger aria-label={RF_KIND_LABEL[rfKind]}>
                    <SelectValue placeholder="— Select —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Select —</SelectItem>
                    {rfOptions.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
            ) : (
              <FieldRow label="RF Management">
                <p className="text-xs text-muted-foreground">
                  {form.profileId
                    ? 'Not applicable — this profile exposes neither Smart RF nor ACS'
                    : 'Select a profile first'}
                </p>
              </FieldRow>
            )}
          </div>

          <Tabs defaultValue="sites">
            <TabsList>
              <TabsTrigger value="sites">{`Sites (${form.instances.length})`}</TabsTrigger>
              <TabsTrigger value="aps">{`Access Points (${memberAps.length})`}</TabsTrigger>
            </TabsList>

            <TabsContent value="sites" className="space-y-3">
              <p className="text-xs text-muted-foreground">
                One binding, applied to every member site: the profile and{' '}
                {rfKind ? RF_KIND_LABEL[rfKind] : 'RF'} policy above are the same everywhere. Only
                which {platform || 'access points'} belong to the group varies per site.
              </p>
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  disabled={readOnly || !form.profileId || candidateSites.length === 0}
                  onClick={() => setAddSiteOpen(true)}
                >
                  Add Site
                </Button>
                {!form.profileId && (
                  <span className="text-xs text-muted-foreground">
                    Choose a profile before adding sites
                  </span>
                )}
              </div>
              {errors.sites && (
                <p className="text-xs text-destructive">
                  {errors.sites} — {seed ? 'the clone' : 'the group'} exists only in this editor
                  until it is saved to a site.
                </p>
              )}
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site</TableHead>
                      <TableHead>Access Points</TableHead>
                      <TableHead>Eligible at site</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {form.instances.length ? (
                      form.instances.map((inst, i) => {
                        const eligible = apEligibility(aps, inst.siteName, platform, claims)
                          .eligible.length;
                        return (
                          <TableRow key={inst.group.id}>
                            <TableCell className="font-medium">{inst.siteName}</TableCell>
                            <TableCell>{inst.group.apSerialNumbers?.length ?? 0}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {`${eligible} ${platform || 'AP'} available`}
                            </TableCell>
                            <TableCell className="space-x-2 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={readOnly || !form.profileId || !inst.siteCanEdit}
                                onClick={() => setMembershipAt(i)}
                              >
                                Edit membership
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={readOnly || !inst.siteCanEdit}
                                onClick={() =>
                                  update({
                                    instances: form.instances.filter((_, j) => j !== i),
                                  })
                                }
                              >
                                Remove
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground">
                          No member sites
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="aps">
              <p className="mb-2 text-xs text-muted-foreground">
                Member access points across all sites in this group
                {platform ? ` · ${platform}` : ''}
              </p>
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Serial Number</TableHead>
                      <TableHead>Hardware Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {memberAps.length ? (
                      memberAps.map(({ siteName, sn }) => {
                        const ap = apsBySerial.get(sn);
                        return (
                          <TableRow key={`${siteName}-${sn}`}>
                            <TableCell>{siteName}</TableCell>
                            <TableCell className="font-medium">{ap?.apName ?? '—'}</TableCell>
                            <TableCell className="font-mono">{sn}</TableCell>
                            <TableCell>{ap?.hardwareType ?? '—'}</TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground">
                          No access points assigned
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </EditorSheet>

      {membershipAt != null && form.instances[membershipAt] && (
        <SiteMembershipDialog
          siteName={form.instances[membershipAt].siteName}
          groupName={form.groupName}
          platform={platform}
          aps={aps}
          claims={claims}
          selected={form.instances[membershipAt].group.apSerialNumbers ?? []}
          onApply={(serials) => setMembership(membershipAt, serials)}
          onClose={() => setMembershipAt(null)}
        />
      )}

      {addSiteOpen && (
        <AddSiteDialog
          groupName={form.groupName}
          platform={platform}
          candidates={candidateSites}
          aps={aps}
          claims={claims}
          onAdd={addSite}
          onClose={() => setAddSiteOpen(false)}
        />
      )}

      <ConfirmDialog
        open={pendingProfileId != null}
        onOpenChange={(o) => !o && setPendingProfileId(null)}
        title="Change profile and re-platform?"
        description={
          pendingProfileId != null
            ? `The profile is group-level: changing it re-platforms all ${form.instances.length} member site${form.instances.length === 1 ? '' : 's'} to ${profileById.get(pendingProfileId)?.apPlatform || 'the new platform'}${pendingDrops > 0 ? `, dropping ${pendingDrops} access point${pendingDrops === 1 ? '' : 's'} that no longer match` : ''}.`
            : undefined
        }
        confirmLabel="Change Profile"
        destructive={pendingDrops > 0}
        onConfirm={() => {
          const id = pendingProfileId;
          setPendingProfileId(null);
          if (id != null) applyProfile(id);
        }}
      />

      {!isNew && onDelete && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete "${record.groupName}"?`}
          description={`This removes the binding from ${record.siteCount} site${record.siteCount === 1 ? '' : 's'}${memberNames.length ? ` (${memberNames.slice(0, 3).join(', ')}${memberNames.length > 3 ? `, +${memberNames.length - 3} more` : ''})` : ''} and detaches its profile and RF policy from every access point in them. This cannot be undone.`}
          confirmLabel="Delete"
          destructive
          onConfirm={() => {
            setConfirmDelete(false);
            void onDelete();
          }}
        />
      )}
    </>
  );
}
