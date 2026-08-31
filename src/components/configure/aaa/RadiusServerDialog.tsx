/**
 * Add/edit RADIUS server dialog — controller field set + ranges (parity A1):
 * IP (pattern), port 0-65535, masked shared secret >=6, timeout 1-360,
 * retries 1-32, Status-Server poll interval 30-300 (auth tables only),
 * Server Type Standard/Secure (locked in edit) -> Trust Point + Peer
 * Discovery cascade.
 *
 * Trust Point is a SELECT seeded from the controller's interface certs
 * (trustPointsService — the same GET /platformmanager/v1/interface/certs
 * derivation the gateway's own UI uses), with any unlisted current value kept
 * selectable for round-trip. If the listing call fails outright, the field
 * degrades to free text so a Secure server can still be configured.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { FieldRow, MaskedInput } from '../_kit';
import { trustPointsService } from '../../../services/configure';
import { NumberField, SelectField, SwitchField, TextField } from './fields';
import { AAA_ENUMS, newRadiusServer, validateRadiusServer, type AaaServerForm } from './aaaModel';

export interface RadiusServerDialogProps {
  open: boolean;
  radiusType: 'auth' | 'acct';
  /** Existing server for edit mode; null seeds a new one. */
  server: AaaServerForm | null;
  onSave: (server: AaaServerForm) => void;
  onClose: () => void;
}

export function RadiusServerDialog({
  open,
  radiusType,
  server,
  onSave,
  onClose,
}: RadiusServerDialogProps) {
  const editMode = server != null;
  const [form, setForm] = useState<AaaServerForm>(() => server ?? newRadiusServer(radiusType));
  const set = <K extends keyof AaaServerForm>(key: K, value: AaaServerForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const errs = useMemo(() => validateRadiusServer(form, radiusType), [form, radiusType]);
  const valid = Object.keys(errs).length === 0;
  const kind = radiusType === 'acct' ? 'Accounting' : 'Authentication';

  /** null = loading, 'error' = listing failed (degrade to free text). */
  const [trustPoints, setTrustPoints] = useState<string[] | 'error' | null>(null);
  useEffect(() => {
    let cancelled = false;
    trustPointsService.list().then(
      (names) => {
        if (!cancelled) setTrustPoints(names);
      },
      () => {
        if (!cancelled) setTrustPoints('error');
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  /** Controller trust points + the current unlisted value (round-trip). */
  const trustPointOptions = useMemo(() => {
    const names = Array.isArray(trustPoints) ? [...trustPoints] : [];
    if (form.trustPoint && !names.includes(form.trustPoint)) names.unshift(form.trustPoint);
    return names.map((name) => ({ id: name, label: name }));
  }, [trustPoints, form.trustPoint]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editMode ? 'Edit' : 'New'} {kind} RADIUS Server
          </DialogTitle>
          <DialogDescription>
            Server order in the table sets failover priority (maximum 4 servers).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <TextField
            label="Server Address"
            value={form.ipAddress}
            onChange={(v) => set('ipAddress', v)}
            placeholder="10.0.0.10"
            error={errs.ipAddress}
            required
          />
          <NumberField
            label="Port"
            value={form.port}
            onChange={(v) => set('port', v)}
            min={0}
            max={65535}
            error={errs.port}
            required
          />
          <NumberField
            label="Number of Retries"
            value={form.totalRetries}
            onChange={(v) => set('totalRetries', v)}
            min={1}
            max={32}
            error={errs.totalRetries}
            required
          />
          <NumberField
            label="Timeout (seconds)"
            value={form.timeout}
            onChange={(v) => set('timeout', v)}
            min={1}
            max={360}
            error={errs.timeout}
            required
          />
          {radiusType === 'auth' && (
            <NumberField
              label="Status-Server Poll Interval (seconds)"
              value={form.pollInterval}
              onChange={(v) => set('pollInterval', v)}
              min={30}
              max={300}
              error={errs.pollInterval}
              required
            />
          )}
          <FieldRow label="Shared Secret" error={errs.sharedSecret} required>
            <MaskedInput
              value={form.sharedSecret}
              onChange={(v) => set('sharedSecret', v)}
              className="max-w-[320px]"
            />
          </FieldRow>
          <SelectField
            label="Server Type"
            value={form.serverType}
            onChange={(v) => set('serverType', v)}
            options={AAA_ENUMS.serverType}
            // Server type is settable only when adding (locked in edit, A1).
            disabled={editMode}
          />
          {form.serverType === 'Secure' && (
            <>
              {trustPoints === 'error' ? (
                // Listing unavailable — keep the field usable as free text.
                <TextField
                  label="Trust Point"
                  value={form.trustPoint ?? ''}
                  onChange={(v) => set('trustPoint', v || null)}
                  error={errs.trustPoint}
                  description="Trust point listing unavailable — enter the certificate trust point name"
                  required
                />
              ) : (
                <SelectField
                  label="Trust Point"
                  value={form.trustPoint ?? ''}
                  onChange={(v) => set('trustPoint', v || null)}
                  options={trustPointOptions}
                  error={errs.trustPoint}
                  description={
                    trustPoints !== null && trustPointOptions.length === 0
                      ? 'No trust points on this Gateway — upload a trust anchor certificate first'
                      : 'Certificate trust point configured on the controller'
                  }
                  required
                  disabled={trustPoints === null || trustPointOptions.length === 0}
                />
              )}
              <SwitchField
                label="Peer Discovery"
                checked={form.peerDiscovery}
                onChange={(v) => set('peerDiscovery', v)}
              />
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!valid} onClick={() => onSave({ ...form })}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
