/**
 * TemplateEditor — Create/edit a global element template.
 *
 * Provides both a structured form view and a raw JSON view.
 * Supports inserting {{variable}} tokens from defined variables.
 */

import { useState, useRef } from 'react';
import { ArrowLeft, Braces, FormInput, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Switch } from '../ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  GLOBAL_ELEMENT_TYPE_LABELS,
} from '../../types/globalElements';
import type {
  GlobalElementTemplate,
  GlobalElementType,
  PersistedVariableDefinition,
} from '../../types/globalElements';
import { templateResolver } from '../../services/templateResolver';

interface Props {
  template: GlobalElementTemplate | null;
  definitions: PersistedVariableDefinition[];
  orgId: string;
  /** Pre-select element type when creating a new template */
  initialElementType?: GlobalElementType;
  onSave: (template: Omit<GlobalElementTemplate, 'id' | 'created_at' | 'updated_at' | 'version'>) => Promise<unknown>;
  onUpdate: (id: string, updates: Partial<GlobalElementTemplate>) => Promise<unknown>;
  onBack: () => void;
}

export function TemplateEditor({ template, definitions, orgId, initialElementType, onSave, onUpdate, onBack }: Props) {
  const isEditing = !!template;

  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [elementType, setElementType] = useState<GlobalElementType>(template?.element_type ?? initialElementType ?? 'service');
  const [isActive, setIsActive] = useState(template?.is_active ?? true);
  const [tags, setTags] = useState(template?.tags?.join(', ') ?? '');

  // JSON payload
  const [jsonText, setJsonText] = useState(
    JSON.stringify(template?.config_payload ?? {}, null, 2)
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'json' | 'form'>('json');
  const [saving, setSaving] = useState(false);

  // Variable picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Validate JSON on change
  const handleJsonChange = (text: string) => {
    setJsonText(text);
    try {
      JSON.parse(text);
      setJsonError(null);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };

  // Insert variable token at cursor position
  const insertToken = (token: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const tokenStr = `{{${token}}}`;
    const newText = jsonText.substring(0, start) + tokenStr + jsonText.substring(end);
    setJsonText(newText);
    setPickerOpen(false);
    // Restore focus and cursor
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + tokenStr.length;
    }, 50);
    // Re-validate
    try {
      JSON.parse(newText);
      setJsonError(null);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };

  // Extract tokens used in the template
  const usedTokens = (() => {
    try {
      const payload = JSON.parse(jsonText);
      return templateResolver.extractTokens(payload);
    } catch {
      return [];
    }
  })();

  const undefinedTokens = usedTokens.filter(
    t => !definitions.some(d => d.token === t)
  );

  const handleSave = async () => {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(jsonText);
    } catch {
      setJsonError('Fix JSON errors before saving');
      return;
    }

    setSaving(true);
    try {
      const parsedTags = tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      if (isEditing && template) {
        await onUpdate(template.id, {
          name,
          description: description || undefined,
          element_type: elementType,
          config_payload: payload,
          is_active: isActive,
          tags: parsedTags,
        });
      } else {
        await onSave({
          org_id: orgId,
          name,
          description: description || undefined,
          element_type: elementType,
          config_payload: payload,
          is_active: isActive,
          tags: parsedTags,
        });
      }
      onBack();
    } catch (err) {
      console.error('Failed to save template:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h2 className="text-lg font-semibold">
          {isEditing ? `Edit: ${template.name}` : 'New Template'}
        </h2>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left: Metadata */}
        <div className="w-full lg:w-80 lg:min-w-[280px] lg:max-w-xs shrink-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Template Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name" className="text-xs">Name</Label>
                <Input
                  id="tpl-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g., Corporate WLAN"
                  className="h-8 text-sm"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tpl-type" className="text-xs">Element Type</Label>
                <Select
                  value={elementType}
                  onValueChange={v => setElementType(v as GlobalElementType)}
                  disabled={isEditing}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(GLOBAL_ELEMENT_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tpl-desc" className="text-xs">Description</Label>
                <Input
                  id="tpl-desc"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional description"
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tpl-tags" className="text-xs">Tags</Label>
                <Input
                  id="tpl-tags"
                  value={tags}
                  onChange={e => setTags(e.target.value)}
                  placeholder="Comma-separated tags"
                  className="h-8 text-sm"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <Label htmlFor="tpl-active" className="text-xs">Active</Label>
                <Switch
                  id="tpl-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>

              {/* Used variables summary */}
              {usedTokens.length > 0 && (
                <div className="space-y-2 pt-3 border-t">
                  <Label className="text-xs text-muted-foreground">Variables Used</Label>
                  <div className="flex flex-wrap gap-1">
                    {usedTokens.map(token => (
                      <Badge
                        key={token}
                        variant={undefinedTokens.includes(token) ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {`{{${token}}}`}
                      </Badge>
                    ))}
                  </div>
                  {undefinedTokens.length > 0 && (
                    <p className="text-xs text-destructive">
                      {undefinedTokens.length} undefined variable{undefinedTokens.length !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Config Payload Editor */}
        <div className="flex-1 min-w-0">
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium">Configuration Payload</CardTitle>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant={viewMode === 'json' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setViewMode('json')}
                  >
                    <Braces className="h-3.5 w-3.5 mr-1" />
                    JSON
                  </Button>
                  <Button
                    variant={viewMode === 'form' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setViewMode('form')}
                  >
                    <FormInput className="h-3.5 w-3.5 mr-1" />
                    Form
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs px-2.5" onClick={() => setPickerOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Variable
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              {viewMode === 'json' ? (
                <div className="space-y-2 h-full">
                  <Textarea
                    ref={textareaRef}
                    value={jsonText}
                    onChange={e => handleJsonChange(e.target.value)}
                    className="font-mono text-sm min-h-[300px] lg:min-h-[400px] resize-y w-full"
                    placeholder='{"serviceName": "{{site_name}}-Corporate", "vlanId": "{{employee_vlan}}"}'
                  />
                  {jsonError && (
                    <p className="text-xs text-destructive">{jsonError}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Form view provides structured editing for common fields.
                    Switch to JSON view for full control.
                  </p>
                  <FormView
                    jsonText={jsonText}
                    elementType={elementType}
                    onJsonChange={handleJsonChange}
                    definitions={definitions}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Save bar */}
      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving || !!jsonError || !name.trim()}>
          {saving ? 'Saving...' : isEditing ? 'Update Template' : 'Create Template'}
        </Button>
      </div>

      {/* Variable Picker Dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Insert Variable</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {definitions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No variables defined yet. Create variables in the Variables tab.
              </p>
            ) : (
              definitions.map(def => (
                <button
                  key={def.id}
                  className="w-full text-left p-3 rounded-lg hover:bg-muted transition-colors"
                  onClick={() => insertToken(def.token)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{def.name}</span>
                    <Badge variant="secondary" className="text-xs">{def.type}</Badge>
                  </div>
                  <code className="text-xs text-muted-foreground">{`{{${def.token}}}`}</code>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simple form view for common Service fields
// ---------------------------------------------------------------------------

function FormView({
  jsonText,
  elementType,
  onJsonChange,
  definitions,
}: {
  jsonText: string;
  elementType: GlobalElementType;
  onJsonChange: (text: string) => void;
  definitions: PersistedVariableDefinition[];
}) {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    return <p className="text-sm text-destructive">Fix JSON errors before using form view</p>;
  }

  const updateField = (key: string, value: unknown) => {
    const updated = { ...payload, [key]: value };
    onJsonChange(JSON.stringify(updated, null, 2));
  };

  if (elementType === 'service') {
    return (
      <div className="space-y-4">
        <FieldRow label="Service Name (SSID)" field="serviceName" payload={payload} onUpdate={updateField} definitions={definitions} />
        <FieldRow label="SSID" field="ssid" payload={payload} onUpdate={updateField} definitions={definitions} />
        <FieldRow label="VLAN ID" field="vlanId" payload={payload} onUpdate={updateField} definitions={definitions} type="number" />
        <FieldRow label="Description" field="description" payload={payload} onUpdate={updateField} definitions={definitions} />
      </div>
    );
  }

  if (elementType === 'topology') {
    return (
      <div className="space-y-4">
        <FieldRow label="Topology Name" field="name" payload={payload} onUpdate={updateField} definitions={definitions} />
        <FieldRow label="VLAN ID" field="vlanId" payload={payload} onUpdate={updateField} definitions={definitions} type="number" />
        <FieldRow label="Subnet" field="subnet" payload={payload} onUpdate={updateField} definitions={definitions} />
        <FieldRow label="Gateway" field="gateway" payload={payload} onUpdate={updateField} definitions={definitions} />
      </div>
    );
  }

  // Generic: show top-level keys as text fields
  return (
    <div className="space-y-4">
      {Object.keys(payload).map(key => (
        <FieldRow key={key} label={key} field={key} payload={payload} onUpdate={updateField} definitions={definitions} />
      ))}
      <p className="text-xs text-muted-foreground">
        For full control over nested fields, switch to JSON view.
      </p>
    </div>
  );
}

function FieldRow({
  label,
  field,
  payload,
  onUpdate,
  definitions,
  type,
}: {
  label: string;
  field: string;
  payload: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
  definitions: PersistedVariableDefinition[];
  type?: string;
}) {
  const rawValue = payload[field];
  const strValue = rawValue !== undefined && rawValue !== null ? String(rawValue) : '';
  const isVariable = typeof rawValue === 'string' && /\{\{[a-zA-Z0-9_]+\}\}/.test(rawValue);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        {isVariable && <Badge variant="info" className="text-xs">Variable</Badge>}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={strValue}
          onChange={e => {
            const v = type === 'number' && !e.target.value.includes('{{')
              ? Number(e.target.value) || 0
              : e.target.value;
            onUpdate(field, v);
          }}
          placeholder={`Enter ${label.toLowerCase()} or {{variable}}`}
          className={isVariable ? 'font-mono text-sm' : ''}
        />
      </div>
    </div>
  );
}
