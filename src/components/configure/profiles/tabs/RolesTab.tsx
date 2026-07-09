/**
 * Roles tab — Name / Selected table toggling roleIDs membership.
 */
import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../ui/table';
import { PCheck } from '../controls';
import { strArr } from '../helpers';
import type { ProfileTabContext } from '../types';

export function RolesTab({ ctx }: { ctx: ProfileTabContext }) {
  const { form, pools, toggleInArr } = ctx;
  const selected = strArr(form.roleIDs);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" disabled title="Create a role from the Roles page">
          <Plus className="mr-1 h-4 w-4" />
          New Role
        </Button>
      </div>
      {pools.roles.length === 0 ? (
        <p className="text-sm text-muted-foreground">No roles configured.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="text-center">Selected</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pools.roles.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.label}</TableCell>
                <TableCell className="text-center">
                  <PCheck checked={selected.indexOf(r.id) >= 0} onChange={() => toggleInArr('roleIDs', r.id)} ariaLabel={r.label} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
