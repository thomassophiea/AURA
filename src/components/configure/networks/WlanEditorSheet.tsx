/**
 * Tabbed WLAN editor drawer (EPB-125 Networks). Owns the form state (API
 * record + UI-model block), controller validation, the associated-profiles
 * assignment matrix, and the save flow: WLAN document first, then any
 * profile radioIfList updates.
 */
import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { EditorSheet } from '../_kit';
import { profilesService } from '../../../services/configure';
import { getUserFriendlyMessage } from '../../../services/errorHandler';
import type { WlanService } from '../../../types/configure';
import { buildWlanPayload, createFormState, validateWlan } from './wlanForm';
import type { WlanRefs } from './useWlanRefs';
import { useProfileAssignments } from './useProfileAssignments';
import { WlanGeneralTab } from './WlanGeneralTab';
import { WlanAuthTab } from './WlanAuthTab';
import { WlanPrivacyTab } from './WlanPrivacyTab';
import { WlanCaptivePortalTab } from './WlanCaptivePortalTab';
import { WlanQosTab } from './WlanQosTab';
import { WlanOpenRoamingTab } from './WlanOpenRoamingTab';
import { WlanRolesVlanTab } from './WlanRolesVlanTab';
import { WlanProfilesTab } from './WlanProfilesTab';

export interface WlanEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Seed record: /default template (add/clone, no persisted id) or the record being edited. */
  seed: WlanService;
  /** Editing an existing controller record (locks auth type + hotspot). */
  isEdit: boolean;
  refs: WlanRefs & { reloadProfiles: () => Promise<void> };
  saving: boolean;
  /** Persist the WLAN document; resolves the saved record or null on failure. */
  onSave: (payload: WlanService, id?: string) => Promise<WlanService | null>;
}

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'auth', label: 'Authentication' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'portal', label: 'Captive Portal' },
  { id: 'qos', label: 'QoS' },
  { id: 'roaming', label: 'OpenRoaming' },
  { id: 'roles', label: 'Roles/VLAN' },
  { id: 'profiles', label: 'Profiles' },
];

export function WlanEditorSheet({
  open,
  onOpenChange,
  seed,
  isEdit,
  refs,
  saving,
  onSave,
}: WlanEditorSheetProps) {
  const [form, setForm] = useState(() => createFormState(seed));
  const [initialJson] = useState(() => JSON.stringify(createFormState(seed)));
  const [profileSaving, setProfileSaving] = useState(false);
  const isNew = !isEdit;
  const wlanId = isEdit ? seed.id : null;
  const assignments = useProfileAssignments(wlanId, refs.profiles);

  const errors = useMemo(() => validateWlan(form, isNew), [form, isNew]);
  const valid = Object.keys(errors).length === 0;
  const formDirty = JSON.stringify(form) !== initialJson;
  const dirty = formDirty || assignments.dirty;

  const flushProfileAssignments = async (): Promise<void> => {
    const updates = assignments.buildUpdates();
    if (updates.length === 0) return;
    setProfileSaving(true);
    try {
      for (const update of updates) {
        const { id: _id, ...rest } = update.profile;
        await profilesService.update(update.profile.id, {
          ...rest,
          radioIfList: update.radioIfList,
        });
      }
      toast.success(
        `Updated radio assignments on ${updates.length} profile${updates.length === 1 ? '' : 's'}`
      );
      await refs.reloadProfiles();
    } catch (error) {
      toast.error('Failed to update profile radio assignments', {
        description: getUserFriendlyMessage(error),
      });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSave = async () => {
    const payload = buildWlanPayload(form);
    const saved = await onSave(payload, isEdit ? seed.id : undefined);
    if (!saved) return;
    await flushProfileAssignments();
    onOpenChange(false);
  };

  const tabProps = { form, setForm, errors, isNew, refs };

  return (
    <EditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `Edit Network: ${seed.serviceName}` : 'New Network'}
      description="WLAN service configuration (/v1/services)"
      width={840}
      dirty={dirty}
      valid={valid}
      saving={saving || profileSaving}
      onSave={handleSave}
    >
      <Tabs defaultValue="general">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="flex-none">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="general" className="pt-4">
          <WlanGeneralTab {...tabProps} />
        </TabsContent>
        <TabsContent value="auth" className="pt-4">
          <WlanAuthTab {...tabProps} />
        </TabsContent>
        <TabsContent value="privacy" className="pt-4">
          <WlanPrivacyTab {...tabProps} />
        </TabsContent>
        <TabsContent value="portal" className="pt-4">
          <WlanCaptivePortalTab {...tabProps} />
        </TabsContent>
        <TabsContent value="qos" className="pt-4">
          <WlanQosTab {...tabProps} />
        </TabsContent>
        <TabsContent value="roaming" className="pt-4">
          <WlanOpenRoamingTab {...tabProps} />
        </TabsContent>
        <TabsContent value="roles" className="pt-4">
          <WlanRolesVlanTab {...tabProps} />
        </TabsContent>
        <TabsContent value="profiles" className="pt-4">
          <WlanProfilesTab
            wlanId={wlanId}
            authType={form.ui.authType}
            profiles={refs.profiles}
            matrix={assignments.matrix}
            onToggle={assignments.toggle}
          />
        </TabsContent>
      </Tabs>
    </EditorSheet>
  );
}
