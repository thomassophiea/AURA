/**
 * Role editor satellite dialogs:
 *  - EcpAdvancedDialog (ecpRedirection.html): 7 cpAdd* URL-item checkboxes,
 *    inverted "Use HTTPS for User Connection" (checked when cpHttp === false),
 *    on-success redirect select with required Custom URL reveal.
 *  - GardenRuleDialog (garden-rule.html): walled-garden builder appending
 *    real-shape L3 allow rules for the redirect target.
 *  - ProfilesDialog (associatedProfiles.html): per-profile checkbox table
 *    writing role.profiles[].
 */
import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { Input } from '../../ui/input';
import { FieldRow } from '../_kit';
import { EnumSelect } from './fields';
import { ECP_ITEMS, ECP_URL_TYPES } from './constants';
import { FQDN_RE } from './policyUtils';
import { logger } from '../../../services/logger';
import { profilesService } from '../../../services/configure';
import type { RoleRuleDraft } from './localTypes';

/* ── ECP Advanced ── */

export interface EcpAdvancedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: Record<string, unknown>;
  upd: (path: string, value: unknown) => void;
}

export function EcpAdvancedDialog({ open, onOpenChange, form, upd }: EcpAdvancedDialogProps) {
  const customUrlMissing =
    form.cpRedirectUrlSelect === 'URLCUSTOMIZED' && !form.cpDefaultRedirectUrl;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Advanced: External Captive Portal Redirection</DialogTitle>
          <DialogDescription>
            Include the following items in the redirection URL
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {ECP_ITEMS.map(([key, label]) => (
            <FieldRow key={key} label={label} inline>
              <Checkbox
                checked={form[key] === true}
                onCheckedChange={(checked) => upd(key, checked === true)}
              />
            </FieldRow>
          ))}
          {/* Inverted semantics: the checkbox is ON when cpHttp === false */}
          <FieldRow label="Use HTTPS for User Connection" inline>
            <Checkbox
              checked={form.cpHttp === false}
              onCheckedChange={(checked) => upd('cpHttp', checked !== true)}
            />
          </FieldRow>
          <FieldRow label="On successful login redirect user to">
            <EnumSelect
              value={String(form.cpRedirectUrlSelect || 'URLTARGET')}
              options={ECP_URL_TYPES}
              onChange={(v) => upd('cpRedirectUrlSelect', v)}
            />
          </FieldRow>
          {form.cpRedirectUrlSelect === 'URLCUSTOMIZED' && (
            <FieldRow
              label="Custom URL"
              required
              error={customUrlMissing ? 'Custom URL is required' : undefined}
            >
              <Input
                value={String(form.cpDefaultRedirectUrl || '')}
                placeholder="https://welcome.example.com"
                onChange={(e) => upd('cpDefaultRedirectUrl', e.target.value)}
              />
            </FieldRow>
          )}
        </div>
        <DialogFooter>
          <Button type="button" disabled={customUrlMissing} onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Walled-garden allow-rule builder ── */

export interface GardenRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddRules: (rules: RoleRuleDraft[]) => void;
}

export function GardenRuleDialog({ open, onOpenChange, onAddRules }: GardenRuleDialogProps) {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [ports, setPorts] = useState<'both' | 'http' | 'https'>('both');

  const addRules = () => {
    const fqdn = FQDN_RE.test(host);
    const mk = (port: 'http' | 'https', portNum: number): RoleRuleDraft => ({
      name: name || `Allow ${host} ${port.toUpperCase()}`,
      intoNetwork: 'destAddr',
      outFromNetwork: 'sourceAddr',
      action: 'FILTERACTION_ALLOW',
      topologyId: null,
      cosId: null,
      subnetType: fqdn ? 'hostName' : 'userDefined',
      ipAddressRange: host,
      port,
      portLow: portNum,
      portHigh: portNum,
      protocol: 'tcp',
      protocolNumber: 6,
      tosDscp: 0,
      mask: 0,
    });
    const rules: RoleRuleDraft[] = [];
    if (ports !== 'https') rules.push(mk('http', 80));
    if (ports !== 'http') rules.push(mk('https', 443));
    onAddRules(rules);
    setName('');
    setHost('');
    setPorts('both');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Allow Rules</DialogTitle>
          <DialogDescription>
            Append walled-garden L3 allow rules for the captive-portal redirect target.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FieldRow label="Rule Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </FieldRow>
          <FieldRow label="IP / FQDN" required>
            <Input
              value={host}
              placeholder="portal.example.com"
              onChange={(e) => setHost(e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Ports">
            <EnumSelect
              value={ports}
              options={[
                { id: 'both', label: 'HTTP + HTTPS' },
                { id: 'http', label: 'HTTP (80)' },
                { id: 'https', label: 'HTTPS (443)' },
              ]}
              onChange={(v) => setPorts(v as 'both' | 'http' | 'https')}
            />
          </FieldRow>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!host} onClick={addRules}>
            Add Rules
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Associated profiles ── */

interface ProfileOption {
  id: string;
  name: string;
}

export interface ProfilesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function ProfilesDialog({
  open,
  onOpenChange,
  selectedIds,
  onChange,
}: ProfilesDialogProps) {
  const [profiles, setProfiles] = useState<ProfileOption[] | null>(null);

  useEffect(() => {
    if (!open || profiles !== null) return;
    let cancelled = false;
    profilesService
      .list()
      .then((list) => {
        if (cancelled) return;
        setProfiles(
          (list as Array<{ id: string; name?: string }>).map((p) => ({
            id: p.id,
            name: p.name ?? p.id,
          }))
        );
      })
      .catch((error) => {
        logger.warn('[configure/policy] failed to load profiles for association dialog', error);
        if (!cancelled) setProfiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, profiles]);

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    onChange([...next]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Associated Profiles</DialogTitle>
          <DialogDescription>Profiles that reference this record.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          {profiles === null ? (
            <p className="text-sm text-muted-foreground">Loading profiles…</p>
          ) : profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No profiles defined.</p>
          ) : (
            profiles.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-3 border-b border-border px-1 py-2 text-sm"
              >
                <Checkbox
                  checked={selectedIds.includes(p.id)}
                  onCheckedChange={(checked) => toggle(p.id, checked === true)}
                />
                {p.name}
              </label>
            ))
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Skip
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
