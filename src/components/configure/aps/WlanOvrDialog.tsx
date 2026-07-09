/**
 * WLAN assignment override matrix (radioIfListOvr + wlanOvrEditor.html, gap
 * 14): rows = WLAN services, columns = radios + Band Steering (hidden on
 * NO-BAND-STEERING) + MLO (MLO feature). Band Steering and MLO are mutually
 * exclusive per WLAN; sensor/bridge radio cells are N/A.
 */
import React, { useState } from 'react';
import { Checkbox } from '../../ui/checkbox';
import { EditorDialog } from './EditorDialog';
import { hasFeature } from './apHelpers';
import type { ApDetail, WlanService } from '../../../types/configure';

interface Entry {
  serviceId: string;
  index: number;
}
export interface WlanOvrValue {
  radioIfList: Entry[];
  bandSteeringServiceIds: string[];
  mloServiceIDs: string[];
}
export interface WlanOvrDialogProps {
  form: ApDetail;
  services: WlanService[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (value: WlanOvrValue) => void;
}

export function WlanOvrDialog({ form, services, open, onOpenChange, onApply }: WlanOvrDialogProps) {
  const [dirty, setDirty] = useState(false);
  const [d, setD] = useState<WlanOvrValue>(() => ({
    radioIfList: structuredClone((form.radioIfList as Entry[]) ?? []),
    bandSteeringServiceIds: [...((form.bandSteeringServiceIds as string[]) ?? [])],
    mloServiceIDs: [...((form.mloServiceIDs as string[]) ?? [])],
  }));
  const radios = form.radios ?? [];
  const showBs = !hasFeature(form.features, 'NO-BAND-STEERING');
  const showMlo = hasFeature(form.features, 'MLO');

  const has = (sid: string, idx: number) =>
    d.radioIfList.some((e) => e.serviceId === sid && e.index === idx);
  const toggle = (sid: string, idx: number) => {
    setDirty(true);
    setD((p) => ({
      ...p,
      radioIfList: p.radioIfList.some((e) => e.serviceId === sid && e.index === idx)
        ? p.radioIfList.filter((e) => !(e.serviceId === sid && e.index === idx))
        : [...p.radioIfList, { serviceId: sid, index: idx }],
    }));
  };
  const inList = (k: 'bandSteeringServiceIds' | 'mloServiceIDs', sid: string) =>
    d[k].indexOf(sid) >= 0;
  const toggleList = (k: 'bandSteeringServiceIds' | 'mloServiceIDs', sid: string) => {
    setDirty(true);
    setD((p) => ({
      ...p,
      [k]: p[k].indexOf(sid) >= 0 ? p[k].filter((x) => x !== sid) : [...p[k], sid],
    }));
  };

  const cols = radios.length + (showBs ? 1 : 0) + (showMlo ? 1 : 0);
  const tmpl = `minmax(140px, 1.6fr) repeat(${cols}, minmax(72px, 1fr))`;

  return (
    <EditorDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit WLAN Overrides"
      maxWidth={880}
      okDisabled={!dirty}
      onOk={() => onApply(d)}
    >
      <div
        className="grid items-center gap-2 border-b border-border pb-2 text-xs font-semibold"
        style={{ gridTemplateColumns: tmpl }}
      >
        <div>WLAN</div>
        {radios.map((r) => (
          <div key={r.radioIndex} className="text-center">
            Radio {r.radioIndex}
          </div>
        ))}
        {showBs && <div className="text-center">Band Steering</div>}
        {showMlo && <div className="text-center">MLO</div>}
      </div>
      {services.length === 0 && (
        <p className="text-sm text-muted-foreground">No WLAN services available.</p>
      )}
      {services.map((svc) => (
        <div
          key={svc.id ?? svc.serviceName}
          className="grid items-center gap-2 border-b border-border py-2"
          style={{ gridTemplateColumns: tmpl }}
        >
          <div className="text-sm">{svc.serviceName}</div>
          {radios.map((r) => (
            <div key={r.radioIndex} className="flex justify-center">
              {r.mode === 'sensor' || r.mode === 'bridge' ? (
                <span className="text-xs text-muted-foreground">N/A</span>
              ) : (
                <Checkbox
                  checked={has(svc.id ?? '', r.radioIndex)}
                  onCheckedChange={() => toggle(svc.id ?? '', r.radioIndex)}
                />
              )}
            </div>
          ))}
          {showBs && (
            <div className="flex justify-center">
              <Checkbox
                checked={inList('bandSteeringServiceIds', svc.id ?? '')}
                disabled={inList('mloServiceIDs', svc.id ?? '')}
                onCheckedChange={() => toggleList('bandSteeringServiceIds', svc.id ?? '')}
              />
            </div>
          )}
          {showMlo && (
            <div className="flex justify-center">
              <Checkbox
                checked={inList('mloServiceIDs', svc.id ?? '')}
                disabled={inList('bandSteeringServiceIds', svc.id ?? '')}
                onCheckedChange={() => toggleList('mloServiceIDs', svc.id ?? '')}
              />
            </div>
          )}
        </div>
      ))}
    </EditorDialog>
  );
}
