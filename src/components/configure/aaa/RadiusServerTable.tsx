/**
 * Ordered RADIUS server table — the controller's 5-column layout (Order /
 * Server Address / Port / Retries / Timeout, parity A6) with per-row edit,
 * move up/down (order = priority) and delete; New hides at 4 servers; the
 * accounting variant offers the "add existing auth server IP" select which
 * copies the auth entry with the accounting port 1813 (A1/A5).
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { RadiusServerDialog } from './RadiusServerDialog';
import {
  MAX_RADIUS_SERVERS,
  availableAuthIps,
  copyAuthServerToAcct,
  moveItem,
  removeAt,
  upsertAt,
  type AaaServerForm,
} from './aaaModel';

export interface RadiusServerTableProps {
  radiusType: 'auth' | 'acct';
  servers: AaaServerForm[];
  onChange: (servers: AaaServerForm[]) => void;
  /** Auth list, for the acct "add existing auth server IP" copy select. */
  authServers?: AaaServerForm[];
  /** Onboard-policy lockdown: hide New (A9). */
  hideNew?: boolean;
  disabled?: boolean;
}

export function RadiusServerTable({
  radiusType,
  servers,
  onChange,
  authServers,
  hideNew,
  disabled,
}: RadiusServerTableProps) {
  // Dialog target: null closed, -1 new, >=0 edit at index.
  const [dialogIndex, setDialogIndex] = useState<number | null>(null);
  const kind = radiusType === 'acct' ? 'accounting' : 'authentication';
  const atCap = servers.length >= MAX_RADIUS_SERVERS;
  const availAcct =
    radiusType === 'acct' && !disabled && !atCap
      ? availableAuthIps(authServers ?? [], servers)
      : [];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {!hideNew && !disabled && !atCap && (
          <Button type="button" variant="outline" size="sm" onClick={() => setDialogIndex(-1)}>
            <Plus className="mr-1 h-4 w-4" />
            New
          </Button>
        )}
        {availAcct.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Add existing auth server IP:</span>
            <Select
              value=""
              onValueChange={(ip) =>
                onChange(copyAuthServerToAcct(authServers ?? [], servers, ip))
              }
            >
              <SelectTrigger className="h-8 w-[180px]" aria-label="Add existing auth server IP">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {availAcct.map((ip) => (
                  <SelectItem key={ip} value={ip}>
                    {ip}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Order</TableHead>
              <TableHead>Server Address</TableHead>
              <TableHead className="w-20">Port</TableHead>
              <TableHead className="w-20">Retries</TableHead>
              <TableHead className="w-20">Timeout</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {servers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  No {kind} servers configured
                </TableCell>
              </TableRow>
            ) : (
              servers.map((server, index) => (
                <TableRow key={`${server.ipAddress}-${index}`}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>{server.ipAddress || '—'}</TableCell>
                  <TableCell>{server.port === '' ? '—' : server.port}</TableCell>
                  <TableCell>{server.totalRetries === '' ? '—' : server.totalRetries}</TableCell>
                  <TableCell>{server.timeout === '' ? '—' : server.timeout}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <RowAction
                        label={`Edit server ${server.ipAddress}`}
                        disabled={disabled}
                        onClick={() => setDialogIndex(index)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </RowAction>
                      <RowAction
                        label={`Move server ${server.ipAddress} up`}
                        disabled={disabled || index === 0}
                        onClick={() => onChange(moveItem(servers, index, -1))}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </RowAction>
                      <RowAction
                        label={`Move server ${server.ipAddress} down`}
                        disabled={disabled || index === servers.length - 1}
                        onClick={() => onChange(moveItem(servers, index, 1))}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </RowAction>
                      <RowAction
                        label={`Delete server ${server.ipAddress}`}
                        disabled={disabled}
                        onClick={() => onChange(removeAt(servers, index))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </RowAction>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {dialogIndex != null && (
        <RadiusServerDialog
          open
          radiusType={radiusType}
          server={dialogIndex >= 0 ? servers[dialogIndex] : null}
          onSave={(server) => {
            onChange(upsertAt(servers, dialogIndex, server));
            setDialogIndex(null);
          }}
          onClose={() => setDialogIndex(null)}
        />
      )}
    </div>
  );
}

interface RowActionProps {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function RowAction({ label, disabled, onClick, children }: RowActionProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
