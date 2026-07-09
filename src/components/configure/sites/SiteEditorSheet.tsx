/**
 * Site editor drawer. Six tabs (General / Device Groups / Switches / SNMP /
 * Allow-Deny / Advanced) over the live v3 site record; identity + Site Mode in
 * the header (mode immutable after create). Save mirrors country into
 * treeNode.country. Clone runs a name modal then persists a duplicate; Delete
 * is confirm-gated and honors canDelete.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { EditorSheet, ConfirmDialog } from '../_kit';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import type { SiteConfig } from '../../../types/configure';
import type { SiteRefs } from './useSiteRefs';
import type { SiteTabProps } from './siteEditorTypes';
import { SiteGeneralTab } from './SiteGeneralTab';
import { SiteDeviceGroupsTab } from './SiteDeviceGroupsTab';
import { SiteSwitchesTab } from './SiteSwitchesTab';
import { SiteSnmpTab } from './SiteSnmpTab';
import { SiteAllowDenyTab } from './SiteAllowDenyTab';
import { SiteAdvancedTab } from './SiteAdvancedTab';
import { cloneSite, getPath, setPath, validateSite } from './siteModel';

const TABS = [
  { id: 'general', label: 'General', Comp: SiteGeneralTab },
  { id: 'devicegroups', label: 'Device Groups', Comp: SiteDeviceGroupsTab },
  { id: 'switches', label: 'Switches', Comp: SiteSwitchesTab },
  { id: 'snmp', label: 'SNMP', Comp: SiteSnmpTab },
  { id: 'allowdeny', label: 'Allow/Deny', Comp: SiteAllowDenyTab },
  { id: 'advanced', label: 'Advanced', Comp: SiteAdvancedTab },
] as const;

export interface SiteEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: SiteConfig | null;
  seed: SiteConfig | null;
  refs: SiteRefs;
  saving: boolean;
  onSave: (payload: Partial<SiteConfig>, id?: string) => Promise<SiteConfig | null>;
  onDelete: () => void;
}

export function SiteEditorSheet({
  open,
  onOpenChange,
  record,
  seed,
  refs,
  saving,
  onSave,
  onDelete,
}: SiteEditorSheetProps) {
  const isNew = record == null;
  const [form, setForm] = useState<SiteConfig>(() => structuredClone((record ?? seed) as SiteConfig));
  const initialJson = useRef(JSON.stringify(form));
  const dirty = isNew || JSON.stringify(form) !== initialJson.current;
  const [confirmDel, setConfirmDel] = useState(false);
  const [cloneName, setCloneName] = useState<string | null>(null);

  const errs = useMemo(() => validateSite(form, { isNew }), [form, isNew]);
  const valid = Object.keys(errs).length === 0;
  const update = (path: string, value: unknown) => setForm((p) => setPath(p, path, value));

  const handleSave = async () => {
    // Keep treeNode.country in sync with the identity country (gap 32).
    const payload = setPath(form, 'treeNode.country', form.country || getPath(form, 'treeNode.country'));
    const saved = await onSave(payload, record?.id);
    if (saved) onOpenChange(false);
  };

  const doClone = async () => {
    if (!cloneName?.trim()) return;
    const clone = cloneSite(form, cloneName.trim());
    delete (clone as { id?: string }).id;
    const saved = await onSave(clone);
    if (saved) {
      setCloneName(null);
      onOpenChange(false);
    }
  };

  const tabProps: Omit<SiteTabProps, 'form'> = { update, errs, isNew, refs };

  return (
    <>
      <EditorSheet
        open={open}
        onOpenChange={onOpenChange}
        title={isNew ? 'Add Site' : form.siteName || 'Edit Site'}
        description="Site configuration (/v3/sites)"
        width={840}
        dirty={dirty}
        valid={valid}
        saving={saving}
        onSave={handleSave}
        footerExtra={
          !isNew && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCloneName(`${form.siteName}-clone`)}
              >
                Clone
              </Button>
              {record?.canDelete !== false && (
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmDel(true)}
                >
                  Delete
                </Button>
              )}
            </div>
          )
        }
      >
        <Tabs defaultValue="general">
          <TabsList className="h-auto w-full flex-wrap justify-start">
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="flex-none">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {TABS.map(({ id, Comp }) => (
            <TabsContent key={id} value={id} className="pt-4">
              <Comp form={form} {...tabProps} />
            </TabsContent>
          ))}
        </Tabs>
      </EditorSheet>

      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title="Delete site?"
        description={`Delete site "${form.siteName}" and its device groups? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={onDelete}
      />

      <Dialog open={cloneName != null} onOpenChange={(o) => !o && setCloneName(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clone Site</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="clone-name">New Site Name</Label>
            <Input
              id="clone-name"
              value={cloneName ?? ''}
              onChange={(e) => setCloneName(e.target.value)}
            />
            {!cloneName?.trim() && <p className="text-xs text-destructive">Name is required</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneName(null)}>
              Cancel
            </Button>
            <Button disabled={!cloneName?.trim() || saving} onClick={() => void doClone()}>
              Clone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
