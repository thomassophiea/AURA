/**
 * RF Management editor drawer (Smart RF / ACS). Type is chosen once at create
 * (ACS preselected) and immutable afterwards; the editor never renders over a
 * null sub-document. Recovery + Select Shutdown tabs are gated by Smart
 * Monitoring and the basic recovery toggles. Save is dirty+valid gated.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Badge } from '../../ui/badge';
import { Label } from '../../ui/label';
import { RadioGroup, RadioGroupItem } from '../../ui/radio-group';
import { Input } from '../../ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { TooltipProvider } from '../../ui/tooltip';
import { EditorSheet } from '../_kit';
import type { RfMgmtPolicy } from '../../../types/configure';
import { RfBasicTab } from './RfBasicTab';
import { RfChannelPowerTab } from './RfChannelPowerTab';
import { RfScanningTab } from './RfScanningTab';
import { RfRecoveryTab } from './RfRecoveryTab';
import { RfSelectShutdownTab } from './RfSelectShutdownTab';
import { RfAcsInterferenceTab } from './RfAcsInterferenceTab';
import type { RfTabProps } from './rfControls';
import {
  RF_TABS_ACS,
  RF_TABS_SMART,
  getPath,
  setPath,
  toRfPayload,
  validateRf,
} from './rfModel';

export interface RfEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Record being edited, or null for Add. */
  record: RfMgmtPolicy | null;
  /** Add/clone seed (the /default record with id stripped). */
  seed: RfMgmtPolicy | null;
  existingNames: Array<{ id: string; name: string }>;
  saving: boolean;
  onSave: (payload: Partial<RfMgmtPolicy>, id?: string) => void | Promise<void>;
}

export function RfEditorSheet({
  open,
  onOpenChange,
  record,
  seed,
  existingNames,
  saving,
  onSave,
}: RfEditorSheetProps) {
  const isNew = record == null;
  const [form, setForm] = useState<RfMgmtPolicy>(() =>
    structuredClone((record ?? seed) as RfMgmtPolicy)
  );
  const initialJson = useRef(JSON.stringify(form));
  const dirty = isNew || JSON.stringify(form) !== initialJson.current;

  const errs = useMemo(() => validateRf(form, { existingNames }), [form, existingNames]);
  const valid = Object.keys(errs).length === 0;
  const update = (path: string, value: unknown) => setForm((p) => setPath(p, path, value));

  const isAcs = form.type === 'Acs';
  const root = isAcs ? 'acs' : 'smartRf';
  const cfg = isAcs ? form.acs : form.smartRf;
  const basic = (getPath(cfg, 'basic') ?? {}) as Record<string, unknown>;
  const custom = !isAcs && basic.sensitivity === 'CUSTOM';
  const smartMon = !isAcs && !!getPath(cfg, 'scanning.smartMonitoring');
  const recEnabled = smartMon && (!!basic.neighborRecovery || !!basic.interferenceRecovery);

  const tabs: string[] = isAcs
    ? [...RF_TABS_ACS]
    : RF_TABS_SMART.filter((t) =>
        t === 'Recovery' ? recEnabled : t === 'Select Shutdown' ? smartMon : true
      );
  const [tab, setTab] = useState<string>('Basic');
  const activeTab = tabs.includes(tab) ? tab : 'Basic';

  const tabProps: RfTabProps = { cfg, root, isAcs, custom, errs, update };

  const handleSave = () => onSave(toRfPayload(form), record?.id);

  return (
    <EditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          {isNew ? 'Add RF Policy' : form.name || 'Edit RF Policy'}
          <Badge variant="secondary">{isAcs ? 'ACS' : 'Smart RF'}</Badge>
        </span>
      }
      description="Smart RF / ACS radio management policy (/v3/rfmgmt)"
      width={840}
      dirty={dirty}
      valid={valid}
      saving={saving}
      onSave={handleSave}
    >
      <TooltipProvider>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Label className="w-[110px] shrink-0">Name</Label>
            <div className="flex-1">
              <Input
                value={form.name ?? ''}
                maxLength={64}
                onChange={(e) => update('name', e.target.value)}
                className="max-w-[340px]"
                aria-label="Name"
              />
              {dirty && errs.name && <p className="mt-1 text-xs text-destructive">{errs.name}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Label className="w-[110px] shrink-0">Type</Label>
            {isNew ? (
              <RadioGroup
                className="flex gap-6"
                value={form.type}
                onValueChange={(v) => {
                  setForm((p) => setPath(p, 'type', v));
                  setTab('Basic');
                }}
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="Acs" /> ACS
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="SmartRf" /> Smart RF
                </label>
              </RadioGroup>
            ) : (
              <span className="text-sm text-muted-foreground">{isAcs ? 'ACS' : 'Smart RF'}</span>
            )}
          </div>

          <Tabs value={activeTab} onValueChange={setTab}>
            <TabsList className="h-auto w-full flex-wrap justify-start">
              {tabs.map((t) => (
                <TabsTrigger key={t} value={t} className="flex-none">
                  {t}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="Basic" className="pt-4">
              <RfBasicTab {...tabProps} />
            </TabsContent>
            <TabsContent value="Power & Channel" className="pt-4">
              <RfChannelPowerTab {...tabProps} />
            </TabsContent>
            {!isAcs && (
              <>
                <TabsContent value="Scanning" className="pt-4">
                  <RfScanningTab {...tabProps} />
                </TabsContent>
                <TabsContent value="Recovery" className="pt-4">
                  <RfRecoveryTab {...tabProps} />
                </TabsContent>
                <TabsContent value="Select Shutdown" className="pt-4">
                  <RfSelectShutdownTab {...tabProps} />
                </TabsContent>
              </>
            )}
            {isAcs && (
              <TabsContent value="Interference Recovery" className="pt-4">
                <RfAcsInterferenceTab {...tabProps} />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </TooltipProvider>
    </EditorSheet>
  );
}
