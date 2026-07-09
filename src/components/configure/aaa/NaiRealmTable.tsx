/**
 * NAI realm entries table (parity A7) — shown in place of the flat server
 * tables while NAI Routing is on: ordered realms with per-row edit / move
 * up/down / delete and the realm dialog for add/edit.
 */
import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, X } from 'lucide-react';
import { Button } from '../../ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import { NaiRealmDialog } from './NaiRealmDialog';
import { moveItem, removeAt, upsertAt, type NaiRealmEntry } from './aaaModel';

export interface NaiRealmTableProps {
  realms: NaiRealmEntry[];
  onChange: (realms: NaiRealmEntry[]) => void;
  disabled?: boolean;
}

function serverSummary(list: NaiRealmEntry['authenticationRadiusServers']): string {
  const ips = list.map((s) => s.ipAddress).filter(Boolean);
  return ips.length ? ips.join(', ') : '—';
}

export function NaiRealmTable({ realms, onChange, disabled }: NaiRealmTableProps) {
  // Dialog target: null closed, -1 new, >=0 edit at index.
  const [dialogIndex, setDialogIndex] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      {!disabled && (
        <Button type="button" variant="outline" size="sm" onClick={() => setDialogIndex(-1)}>
          <Plus className="mr-1 h-4 w-4" />
          New
        </Button>
      )}

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Order</TableHead>
              <TableHead>NAI Realm</TableHead>
              <TableHead>Auth Servers</TableHead>
              <TableHead>Acct Servers</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {realms.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  No realm entries configured
                </TableCell>
              </TableRow>
            ) : (
              realms.map((realm, index) => (
                <TableRow key={`${realm.realm}-${index}`}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>{realm.realm || '—'}</TableCell>
                  <TableCell className="text-xs">
                    {serverSummary(realm.authenticationRadiusServers)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {serverSummary(realm.accountingRadiusServers)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Edit realm ${realm.realm}`}
                        disabled={disabled}
                        onClick={() => setDialogIndex(index)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Move realm ${realm.realm} up`}
                        disabled={disabled || index === 0}
                        onClick={() => onChange(moveItem(realms, index, -1))}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Move realm ${realm.realm} down`}
                        disabled={disabled || index === realms.length - 1}
                        onClick={() => onChange(moveItem(realms, index, 1))}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Delete realm ${realm.realm}`}
                        disabled={disabled}
                        onClick={() => onChange(removeAt(realms, index))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {dialogIndex != null && (
        <NaiRealmDialog
          open
          realm={dialogIndex >= 0 ? realms[dialogIndex] : null}
          onSave={(realm) => {
            onChange(upsertAt(realms, dialogIndex, realm));
            setDialogIndex(null);
          }}
          onClose={() => setDialogIndex(null)}
        />
      )}
    </div>
  );
}
