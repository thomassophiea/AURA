/**
 * Air Defense (ADSP) Profile editor (BUILD SPEC 6b · add-edit-adsp.html).
 * Name (required+unique+invalid-chars) + server list (max 3, at least one
 * required to save). Wire mapping (audit gap 6.3): editor model
 * `servers[] {addr, port}` <-> API `svrAddr[]`. The adapter reads both
 * "host[:port]" strings and {addr,port} objects, and writes "host" /
 * "host:port" (port omitted when 443, matching the list rendering).
 */
import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { EditorSheet, FieldRow } from '../_kit';
import type { AdspProfile } from '../../../types/configure';
import { RE_HOST, intIn, nameError, noErrors, type NamedRecord } from './profileModel';
import { parseServers, toSvrAddr, type AdspServer as Server } from './adspModel';

export { parseServers } from './adspModel';

export interface AdspEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: AdspProfile | null;
  seed: AdspProfile;
  rows: NamedRecord[];
  saving: boolean;
  onSave: (payload: Partial<AdspProfile>, id?: string) => void | Promise<void>;
}

export function AdspEditor({ open, onOpenChange, record, seed, rows, saving, onSave }: AdspEditorProps) {
  const isNew = record == null;
  const ro = record?.canEdit === false;
  const base = record ?? seed;
  const [name, setName] = useState(base.name ?? '');
  const [servers, setServers] = useState<Server[]>(() => parseServers(base.svrAddr));
  const [svr, setSvr] = useState('');
  const [port, setPort] = useState('');
  const [expanded, setExpanded] = useState(true);
  const initial = useRef(JSON.stringify({ name: base.name ?? '', servers: parseServers(base.svrAddr) }));
  const dirty = JSON.stringify({ name, servers }) !== initial.current;

  const portEff = port === '' ? 443 : Number(port);
  const svrErr = svr.trim()
    ? !RE_HOST.test(svr.trim())
      ? 'Enter a valid hostname or IP address'
      : servers.some((s) => s.addr === svr.trim())
        ? 'Server address has already been added'
        : null
    : null;
  const portErr = port !== '' && !intIn(Number(port), 0, 65535) ? 'Port must be an integer between 0 and 65535' : null;
  const addDisabled = ro || !svr.trim() || !!svrErr || !!portErr || servers.length >= 3;

  const errs = useMemo(() => ({ name: nameError(rows, { id: record?.id, name }, true) }), [rows, record, name]);
  const valid = noErrors(errs) && servers.length >= 1 && !ro;

  const addServer = () => {
    if (addDisabled) return;
    setServers((prev) => [...prev, { addr: svr.trim(), port: portEff }]);
    setSvr('');
    setPort('');
  };

  const doSave = () => {
    const payload: Partial<AdspProfile> = { ...base, name, svrAddr: toSvrAddr(servers) };
    onSave(payload, record?.id);
  };

  return (
    <EditorSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isNew ? 'Create AirDefense Profile' : name || 'Edit AirDefense Profile'}
      description="AirDefense (ADSP) profile (/v3/adsp)"
      width={720}
      dirty={dirty}
      valid={valid}
      saving={saving}
      onSave={doSave}
    >
      <div className="max-w-[600px] space-y-4">
        <FieldRow label="Profile Name" htmlFor="adsp-name" error={dirty ? errs.name : null} required>
          <Input
            id="adsp-name"
            value={name}
            disabled={ro}
            onChange={(e) => setName(e.target.value)}
            className="max-w-[340px]"
          />
        </FieldRow>

        <p className="text-xs text-muted-foreground">
          To enable BLE device detection in the Air Defense Server (ADSP), configure an iBeacon or
          Eddystone Scan profile under the IoT tab.
        </p>

        {servers.length >= 3 ? (
          <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
            Maximum number of servers added (3).
          </div>
        ) : (
          <div className="space-y-3 rounded-md border border-border p-4">
            <FieldRow label="Add Server Address" htmlFor="adsp-svr" error={svrErr}>
              <Input
                id="adsp-svr"
                value={svr}
                disabled={ro}
                placeholder="adsp.example.com"
                onChange={(e) => setSvr(e.target.value)}
                className="max-w-[280px]"
              />
            </FieldRow>
            <FieldRow label="Port" htmlFor="adsp-port" error={portErr}>
              <div className="flex items-center gap-3">
                <Input
                  id="adsp-port"
                  type="number"
                  value={port}
                  disabled={ro}
                  placeholder="443"
                  onChange={(e) => setPort(e.target.value)}
                  className="max-w-[140px]"
                />
                <span className="text-xs text-muted-foreground">default 443</span>
                <Button type="button" variant="outline" size="sm" disabled={addDisabled} onClick={addServer}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add
                </Button>
              </div>
            </FieldRow>
          </div>
        )}

        <div className="space-y-1.5">
          <button
            type="button"
            className="flex items-center gap-2 text-sm font-medium"
            onClick={() => setExpanded((x) => !x)}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            Total Servers: {servers.length}
          </button>
          {expanded && (
            <div className="overflow-hidden rounded-md border border-border">
              {servers.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">No servers added.</div>
              ) : (
                servers.map((s, i) => (
                  <div
                    key={`${s.addr}:${s.port}:${i}`}
                    className={`flex items-center gap-2 px-3 py-2 ${i ? 'border-t border-border' : ''}`}
                  >
                    <span className="flex-1 text-sm">
                      {s.addr}
                      {s.port !== 443 ? `:${s.port}` : ''}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      disabled={ro}
                      aria-label="Remove server"
                      onClick={() => setServers((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
          {servers.length === 0 && <p className="text-xs text-destructive">At least one server is required</p>}
        </div>
      </div>
    </EditorSheet>
  );
}
