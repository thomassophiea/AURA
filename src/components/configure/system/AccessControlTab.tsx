/**
 * Access Control = the controller's client MAC Allow/Deny list
 * (/v1/accesscontrol singleton {macMode, mode, macList}). Modeled on the
 * controller /blacklist page: mode radios (Allow-only-listed vs Deny-listed)
 * with a confirm-on-switch modal (flipping inverts the list's meaning), a MAC
 * grid with selection, an Add-MAC modal (required, aa:bb:cc:dd:ee:ff pattern,
 * case-insensitive duplicate check) and confirm-gated delete of the selection.
 * Edits stage locally; Save PUTs the real keys (macMode: Allow=0, Deny=1).
 */
import React, { useMemo, useRef, useState } from 'react';
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import { Checkbox } from '../../ui/checkbox';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { RadioGroup, RadioGroupItem } from '../../ui/radio-group';
import { Skeleton } from '../../ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { ConfirmDialog } from '../_kit';
import { accessControlService } from '../../../services/configure';
import type { AccessControlSettings } from '../../../types/configure';
import { useSingleton } from './useSingleton';

const MAC_RE = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

function readMacList(rec: AccessControlSettings | null): string[] {
  if (!rec || !Array.isArray(rec.macList)) return [];
  return rec.macList.filter((m): m is string => typeof m === 'string' && m.length > 0);
}

export function AccessControlTab() {
  const { record, loading, saving, refresh, save } = useSingleton<AccessControlSettings>(
    accessControlService,
    'access control settings'
  );

  const [mode, setMode] = useState<'Allow' | 'Deny'>('Deny');
  const [macList, setMacList] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [pendingMode, setPendingMode] = useState<'Allow' | 'Deny' | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState('');
  const initial = useRef<string>('');

  // Seed local staging once the record loads / after each successful save.
  const seededFor = useRef<AccessControlSettings | null>(null);
  if (record && seededFor.current !== record) {
    seededFor.current = record;
    const nextMode = record.mode === 'Allow' ? 'Allow' : 'Deny';
    const nextList = readMacList(record);
    setMode(nextMode);
    setMacList(nextList);
    setSelected({});
    initial.current = JSON.stringify({ mode: nextMode, macList: nextList });
  }

  const dirty = JSON.stringify({ mode, macList }) !== initial.current;
  const selectedMacs = useMemo(() => macList.filter((m) => selected[m]), [macList, selected]);
  const allChecked = macList.length > 0 && selectedMacs.length === macList.length;

  const draftTrim = draft.trim();
  const draftDup = macList.some((m) => m.toLowerCase() === draftTrim.toLowerCase());
  const draftValid = MAC_RE.test(draftTrim) && !draftDup;
  const draftError = !draftTrim
    ? ''
    : !MAC_RE.test(draftTrim)
      ? 'Enter a valid MAC address (aa:bb:cc:dd:ee:ff)'
      : draftDup
        ? 'This MAC address is already in the list'
        : '';

  const requestModeChange = (next: string) => {
    if (next !== 'Allow' && next !== 'Deny') return;
    if (next === mode) return;
    setPendingMode(next);
  };

  const applyModeChange = () => {
    if (pendingMode) setMode(pendingMode);
    setPendingMode(null);
  };

  const toggleAll = (checked: boolean) => {
    if (!checked) return setSelected({});
    const next: Record<string, boolean> = {};
    macList.forEach((m) => (next[m] = true));
    setSelected(next);
  };

  const addMac = () => {
    if (!draftValid) return;
    setMacList((prev) => [...prev, draftTrim]);
    setDraft('');
    setAddOpen(false);
  };

  const deleteSelected = () => {
    setMacList((prev) => prev.filter((m) => !selected[m]));
    setSelected({});
    setConfirmDelete(false);
  };

  const handleSave = () => {
    if (!record) return;
    void save({
      ...record,
      mode,
      macMode: mode === 'Allow' ? 0 : 1,
      macList: macList.slice(),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-medium">Access Control</h2>
          <p className="text-sm text-muted-foreground">
            {macList.length} MAC address {macList.length === 1 ? 'entry' : 'entries'} · client MAC{' '}
            {mode === 'Allow' ? 'allow' : 'deny'} list
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading || saving}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-2">
            <Label>List Mode</Label>
            <RadioGroup className="flex flex-col gap-2" value={mode} onValueChange={requestModeChange}>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="Allow" /> Allow only listed MAC addresses
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="Deny" /> Deny listed MAC addresses
              </label>
            </RadioGroup>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={selectedMacs.length === 0}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Delete
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Add MAC
            </Button>
          </div>

          {loading && !record ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(v) => toggleAll(v === true)}
                      aria-label="Select all MAC addresses"
                    />
                  </TableHead>
                  <TableHead>MAC Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {macList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-sm text-muted-foreground">
                      No MAC addresses configured
                    </TableCell>
                  </TableRow>
                ) : (
                  macList.map((m) => (
                    <TableRow key={m}>
                      <TableCell>
                        <Checkbox
                          checked={!!selected[m]}
                          onCheckedChange={(v) =>
                            setSelected((prev) => ({ ...prev, [m]: v === true }))
                          }
                          aria-label={`Select ${m}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono">{m}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={(o) => (o ? setAddOpen(true) : (setAddOpen(false), setDraft('')))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add MAC Address</DialogTitle>
            <DialogDescription>
              Enter a MAC address to add to the {mode === 'Allow' ? 'allow' : 'deny'} list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ac-add-mac">MAC Address</Label>
            <Input
              id="ac-add-mac"
              value={draft}
              placeholder="aa:bb:cc:dd:ee:ff"
              autoFocus
              className="font-mono"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draftValid) addMac();
              }}
            />
            {draftError && <p className="text-xs text-destructive">{draftError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => (setAddOpen(false), setDraft(''))}>
              Cancel
            </Button>
            <Button disabled={!draftValid} onClick={addMac}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingMode != null}
        onOpenChange={(o) => !o && setPendingMode(null)}
        title={`Switch to ${pendingMode === 'Allow' ? 'Allow' : 'Deny'} mode?`}
        description={
          pendingMode === 'Allow'
            ? 'In Allow mode only the listed MAC addresses may connect; every other client is blocked. This inverts the current list behavior.'
            : 'In Deny mode the listed MAC addresses are blocked and all other clients may connect. This inverts the current list behavior.'
        }
        confirmLabel="Switch Mode"
        onConfirm={applyModeChange}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${selectedMacs.length} MAC ${selectedMacs.length === 1 ? 'address' : 'addresses'}?`}
        description="The selected entries are removed from the list. Save to persist the change to the controller."
        confirmLabel="Delete"
        destructive
        onConfirm={deleteSelected}
      />
    </div>
  );
}

export default AccessControlTab;
