/**
 * TemplateList — Filterable table of global element templates with CRUD.
 */

import { useState } from 'react';
import { Plus, Copy, Pencil, Trash2, FileCode2, Search } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { GLOBAL_ELEMENT_TYPE_LABELS } from '../../types/globalElements';
import type { GlobalElementTemplate, GlobalElementType } from '../../types/globalElements';
import { templateResolver } from '../../services/templateResolver';

interface Props {
  templates: GlobalElementTemplate[];
  onEdit: (template: GlobalElementTemplate) => void;
  onCreate: () => void;
  onDelete: (id: string) => Promise<unknown>;
  onDuplicate: (id: string, newName: string) => Promise<unknown>;
}

export function TemplateList({ templates, onEdit, onCreate, onDelete, onDuplicate }: Props) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<GlobalElementType | 'all'>('all');

  const filtered = templates.filter(t => {
    const matchesSearch = !search
      || t.name.toLowerCase().includes(search.toLowerCase())
      || (t.description ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || t.element_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this template?')) return;
    await onDelete(id);
  };

  const handleDuplicate = async (e: React.MouseEvent, template: GlobalElementTemplate) => {
    e.stopPropagation();
    const name = prompt('Name for the copy:', `${template.name} (copy)`);
    if (!name) return;
    await onDuplicate(template.id, name);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as GlobalElementType | 'all')}>
          <SelectTrigger className="w-[150px] h-8 text-sm">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(GLOBAL_ELEMENT_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1 min-w-0" />
        <Button size="sm" className="h-8 text-sm shrink-0" onClick={onCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          New Template
        </Button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileCode2 className="h-10 w-10 mx-auto mb-4 opacity-40" />
          <p className="text-sm font-medium">
            {templates.length === 0
              ? 'No templates created yet'
              : 'No templates match your filter'}
          </p>
          {templates.length === 0 && (
            <p className="text-xs mt-1.5 text-muted-foreground/70">Templates let you define reusable configuration with variables</p>
          )}
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs hidden sm:table-cell">Variables</TableHead>
                <TableHead className="text-xs hidden md:table-cell">Version</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="w-[90px] text-xs" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(t => {
                const tokenCount = templateResolver.extractTokens(t.config_payload).length;
                return (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() => onEdit(t)}
                  >
                    <TableCell>
                      <div className="min-w-[120px]">
                        <span className="font-medium text-sm">{t.name}</span>
                        {t.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs whitespace-nowrap">
                        {GLOBAL_ELEMENT_TYPE_LABELS[t.element_type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {tokenCount > 0 ? (
                        <span className="text-xs">{tokenCount} var{tokenCount !== 1 ? 's' : ''}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-xs text-muted-foreground">v{t.version}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.is_active ? 'success' : 'secondary'} className="text-xs">
                        {t.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0"
                          onClick={(e) => handleDuplicate(e, t)}
                          title="Duplicate"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0"
                          onClick={(e) => { e.stopPropagation(); onEdit(t); }}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"
                          onClick={(e) => handleDelete(e, t.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
