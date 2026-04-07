/**
 * VariableDefinitionTable — CRUD table for variable definitions.
 */

import { useState } from 'react';
import { Plus, Pencil, Trash2, Variable } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import type { PersistedVariableDefinition } from '../../types/globalElements';
import type { VariableType } from '../../types/siteVariables';

const VARIABLE_TYPES: { value: VariableType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'vlan', label: 'VLAN (1–4094)' },
  { value: 'ip', label: 'IP Address' },
  { value: 'subnet', label: 'Subnet (CIDR)' },
  { value: 'hostname', label: 'Hostname' },
];

interface Props {
  definitions: PersistedVariableDefinition[];
  orgId: string;
  onCreateDefinition: (def: Omit<PersistedVariableDefinition, 'id' | 'created_at' | 'updated_at'>) => Promise<unknown>;
  onUpdateDefinition: (id: string, updates: Partial<PersistedVariableDefinition>) => Promise<unknown>;
  onDeleteDefinition: (id: string) => Promise<unknown>;
  onSelectVariable?: (def: PersistedVariableDefinition) => void;
  selectedVariableId?: string;
}

const EMPTY_FORM = {
  name: '',
  token: '',
  description: '',
  type: 'string' as VariableType,
  default_value: '',
};

export function VariableDefinitionTable({
  definitions,
  orgId,
  onCreateDefinition,
  onUpdateDefinition,
  onDeleteDefinition,
  onSelectVariable,
  selectedVariableId,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (def: PersistedVariableDefinition) => {
    setEditingId(def.id);
    setForm({
      name: def.name,
      token: def.token,
      description: def.description ?? '',
      type: def.type,
      default_value: def.default_value ?? '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingId) {
        await onUpdateDefinition(editingId, {
          name: form.name,
          token: form.token,
          description: form.description || undefined,
          type: form.type,
          default_value: form.default_value || undefined,
        });
      } else {
        await onCreateDefinition({
          org_id: orgId,
          name: form.name,
          token: form.token,
          description: form.description || undefined,
          type: form.type,
          default_value: form.default_value || undefined,
        });
      }
      setDialogOpen(false);
    } catch (err) {
      console.error('Failed to save variable definition:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this variable definition? This will also remove all associated values.')) return;
    await onDeleteDefinition(id);
  };

  // Auto-generate token from name
  const handleNameChange = (name: string) => {
    const token = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    setForm(prev => ({
      ...prev,
      name,
      token: editingId ? prev.token : token,
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {definitions.length} variable{definitions.length !== 1 ? 's' : ''} defined
        </h3>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Variable
        </Button>
      </div>

      {definitions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Variable className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No variables defined yet</p>
          <p className="text-xs mt-1">Variables let you parameterize templates with site-specific values</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Default</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {definitions.map(def => (
              <TableRow
                key={def.id}
                className={`cursor-pointer ${selectedVariableId === def.id ? 'bg-muted/50' : ''}`}
                onClick={() => onSelectVariable?.(def)}
              >
                <TableCell className="font-medium">{def.name}</TableCell>
                <TableCell>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {`{{${def.token}}}`}
                  </code>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{def.type}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {def.default_value || '—'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={(e) => { e.stopPropagation(); openEdit(def); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleDelete(def.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Variable' : 'New Variable'}</DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Update the variable definition'
                : 'Define a new variable for use in templates'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="var-name">Name</Label>
              <Input
                id="var-name"
                value={form.name}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="Employee VLAN"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="var-token">Token</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">{'{{'}</span>
                <Input
                  id="var-token"
                  value={form.token}
                  onChange={e => setForm(prev => ({ ...prev, token: e.target.value }))}
                  placeholder="employee_vlan"
                  pattern="[a-zA-Z0-9_]+"
                  required
                  className="font-mono text-sm"
                />
                <span className="text-muted-foreground text-sm">{'}}'}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="var-type">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm(prev => ({ ...prev, type: v as VariableType }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VARIABLE_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="var-default">Default Value</Label>
              <Input
                id="var-default"
                value={form.default_value}
                onChange={e => setForm(prev => ({ ...prev, default_value: e.target.value }))}
                placeholder="Optional default"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="var-desc">Description</Label>
              <Input
                id="var-desc"
                value={form.description}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
