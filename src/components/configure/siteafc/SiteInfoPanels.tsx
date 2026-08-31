/**
 * Read-oriented summary panels for the non-AFC Site editor tabs — Device
 * Groups, Floor Plans, Location, Switches, Allow List / Deny List and Advanced.
 * Values come straight from the /v3/sites record (deviceGroups, treeNode,
 * switchSerialNumbers, macAcl/protectedAcl, snmpConfig, afcUpdate, …). This is a
 * detail surface mirroring the controller layout, not a mutation editor.
 */
import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { FieldRow, Section } from '../_kit';
import type { ApDetail, SiteConfig } from '../../../types/configure';

function Value({ children }: { children: React.ReactNode }) {
  return <span className="text-sm text-muted-foreground">{children}</span>;
}

const yesNo = (v: boolean | null | undefined) => (v ? 'Yes' : 'No');

/** Tolerantly pull a MAC string list out of the loosely-typed ACL fields. */
function asMacList(acl: unknown): string[] {
  if (Array.isArray(acl)) return acl.map((e) => (typeof e === 'string' ? e : JSON.stringify(e)));
  if (acl && typeof acl === 'object') {
    const inner =
      (acl as Record<string, unknown>).macAddresses ?? (acl as Record<string, unknown>).entries;
    if (Array.isArray(inner)) return inner.map((e) => String(e));
  }
  return [];
}

export function SiteDeviceGroupsPanel({ site }: { site: SiteConfig }) {
  const groups = site.deviceGroups ?? [];
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Group</TableHead>
            <TableHead className="text-right">APs</TableHead>
            <TableHead className="text-right">Services</TableHead>
            <TableHead className="text-right">Roles</TableHead>
            <TableHead className="text-right">Topologies</TableHead>
            <TableHead>DPI</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                No device groups.
              </TableCell>
            </TableRow>
          ) : (
            groups.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-medium">{g.groupName}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {g.apSerialNumbers?.length ?? 0}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {g.serviceIDs?.length ?? 0}
                </TableCell>
                <TableCell className="text-right tabular-nums">{g.roleIDs?.length ?? 0}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {g.topologyIDs?.length ?? 0}
                </TableCell>
                <TableCell>
                  <Value>{yesNo(g.enableDpi)}</Value>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function SiteFloorPlansPanel({ aps }: { aps: ApDetail[] }) {
  const floors = new Map<number, number>();
  for (const ap of aps) {
    const f = ap.ftm?.zSubelement?.floorNumber ?? 0;
    floors.set(f, (floors.get(f) ?? 0) + 1);
  }
  const rows = [...floors.entries()].sort((a, b) => a[0] - b[0]);
  return (
    <Section
      title="Floor Plans"
      description="Floors are derived from per-AP floor assignments. Floor plan images/scale are managed in the controller UI and are not part of the config API."
    >
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Floor</TableHead>
              <TableHead className="text-right">Placed APs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                  No floor assignments.
                </TableCell>
              </TableRow>
            ) : (
              rows.map(([floor, count]) => (
                <TableRow key={floor}>
                  <TableCell className="font-medium">
                    {floor > 0 ? `Floor ${floor}` : 'Unassigned'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{count}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Section>
  );
}

export function SiteLocationPanel({ site }: { site: SiteConfig }) {
  const t = site.treeNode;
  return (
    <Section title="Location">
      <FieldRow label="Country">
        <Value>{t?.country || site.country || '—'}</Value>
      </FieldRow>
      <FieldRow label="Region">
        <Value>{t?.region || '—'}</Value>
      </FieldRow>
      <FieldRow label="Campus">
        <Value>{t?.campus || '—'}</Value>
      </FieldRow>
      <FieldRow label="City">
        <Value>{t?.city || '—'}</Value>
      </FieldRow>
      <FieldRow label="Type of Place">
        <Value>{t?.typeOfPlace || '—'}</Value>
      </FieldRow>
      <FieldRow label="Map Coordinates">
        <Value>{t?.mapCoordinates || '—'}</Value>
      </FieldRow>
      <FieldRow label="Postal Code">
        <Value>{site.postalCode || '—'}</Value>
      </FieldRow>
    </Section>
  );
}

export function SiteSwitchesPanel({ site }: { site: SiteConfig }) {
  const serials = (site.switchSerialNumbers ?? []).map((s) => String(s));
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Switch Serial Number</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {serials.length === 0 ? (
            <TableRow>
              <TableCell className="py-8 text-center text-muted-foreground">
                No switches assigned.
              </TableCell>
            </TableRow>
          ) : (
            serials.map((s) => (
              <TableRow key={s}>
                <TableCell className="font-mono text-sm">{s}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function AclList({ title, entries }: { title: string; entries: string[] }) {
  return (
    <Section title={`${title} (${entries.length})`}>
      {entries.length === 0 ? (
        <Value>No entries.</Value>
      ) : (
        <ul className="space-y-1">
          {entries.map((e) => (
            <li key={e} className="font-mono text-sm text-muted-foreground">
              {e}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function SiteAllowDenyPanel({ site }: { site: SiteConfig }) {
  return (
    <div className="space-y-6">
      <AclList title="Allow List" entries={asMacList(site.protectedAcl)} />
      <AclList title="Deny List" entries={asMacList(site.macAcl)} />
    </div>
  );
}

export function SiteAdvancedPanel({ site }: { site: SiteConfig }) {
  const afc = site.afcUpdate;
  const afcSchedule =
    afc != null
      ? `${String(afc.hour).padStart(2, '0')}:${String(afc.minute).padStart(2, '0')}`
      : '—';
  return (
    <Section title="Advanced">
      <FieldRow label="Site Mode">
        <Value>{site.distributed ? 'Distributed' : 'Centralized'}</Value>
      </FieldRow>
      <FieldRow label="Spanning Tree (STP)">
        <Value>{yesNo(site.stpEnabled)}</Value>
      </FieldRow>
      <FieldRow label="Preferred Affinity">
        <Value>{site.preferredAffinity || '—'}</Value>
      </FieldRow>
      <FieldRow label="AAA Policy">
        <Value>{site.aaaPolicyId || '—'}</Value>
      </FieldRow>
      <FieldRow label="AFC Update Schedule (daily)">
        <Value>{afcSchedule}</Value>
      </FieldRow>
      <FieldRow label="SNMP">
        <Value>{site.snmpConfig ? 'Configured' : 'Not configured'}</Value>
      </FieldRow>
      <FieldRow label="Contact">
        <Value>{site.contact || '—'}</Value>
      </FieldRow>
      <FieldRow label="Site Manager">
        <Value>
          {site.siteManagerName || '—'}
          {site.siteManagerEmail ? ` (${site.siteManagerEmail})` : ''}
        </Value>
      </FieldRow>
    </Section>
  );
}
