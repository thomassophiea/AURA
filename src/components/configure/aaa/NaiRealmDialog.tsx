/**
 * NAI realm add/edit dialog (parity A7): required realm name + per-realm
 * ordered auth/acct RADIUS server lists, reusing the server table (same
 * 4-server cap, reorder and acct copy-from-auth semantics).
 */
import React, { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Section } from '../_kit';
import { TextField } from './fields';
import { RadiusServerTable } from './RadiusServerTable';
import { validateRealm, type NaiRealmEntry } from './aaaModel';

export interface NaiRealmDialogProps {
  open: boolean;
  /** Existing realm for edit mode; null seeds a new one. */
  realm: NaiRealmEntry | null;
  onSave: (realm: NaiRealmEntry) => void;
  onClose: () => void;
}

const NEW_REALM: NaiRealmEntry = {
  realm: '',
  authenticationRadiusServers: [],
  accountingRadiusServers: [],
};

export function NaiRealmDialog({ open, realm, onSave, onClose }: NaiRealmDialogProps) {
  const [form, setForm] = useState<NaiRealmEntry>(() =>
    realm ? structuredClone(realm) : structuredClone(NEW_REALM)
  );
  const errs = useMemo(() => validateRealm(form), [form]);
  const valid = Object.keys(errs).length === 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{realm ? 'Edit NAI Realm' : 'New NAI Realm'}</DialogTitle>
          <DialogDescription>
            Requests whose NAI matches this realm are routed to its server lists.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <TextField
            label="NAI Realm"
            value={form.realm}
            onChange={(v) => setForm((prev) => ({ ...prev, realm: v }))}
            placeholder="example.com"
            error={errs.realm}
            required
          />
          <Section title="RADIUS Authentication Servers">
            <RadiusServerTable
              radiusType="auth"
              servers={form.authenticationRadiusServers}
              onChange={(v) => setForm((prev) => ({ ...prev, authenticationRadiusServers: v }))}
            />
          </Section>
          <Section title="RADIUS Accounting Servers">
            <RadiusServerTable
              radiusType="acct"
              servers={form.accountingRadiusServers}
              authServers={form.authenticationRadiusServers}
              onChange={(v) => setForm((prev) => ({ ...prev, accountingRadiusServers: v }))}
            />
          </Section>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!valid} onClick={() => onSave(structuredClone(form))}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
