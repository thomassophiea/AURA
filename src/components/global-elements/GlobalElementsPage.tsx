/**
 * GlobalElementsPage — Top-level page with tab navigation for
 * Templates, Variables, and Resolution Preview.
 */

import { useState } from 'react';
import { Layers, Braces, Eye } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { TemplateList } from './TemplateList';
import { TemplateEditor } from './TemplateEditor';
import { VariableManagement } from './VariableManagement';
import { ResolutionPreview } from './ResolutionPreview';
import { useTemplates, useVariableDefinitions, useVariableValues } from '../../hooks/useGlobalElements';
import { useAppContext } from '../../contexts/AppContext';
import type { GlobalElementTemplate } from '../../types/globalElements';

interface Props {
  initialTab?: 'templates' | 'variables' | 'preview';
}

export function GlobalElementsPage({ initialTab = 'templates' }: Props) {
  const { organization } = useAppContext();
  const orgId = organization?.id;

  const {
    templates, createTemplate, updateTemplate, deleteTemplate, duplicateTemplate,
  } = useTemplates(orgId);
  const { definitions } = useVariableDefinitions(orgId);
  const { values } = useVariableValues(orgId);

  const [activeTab, setActiveTab] = useState(initialTab);
  const [editingTemplate, setEditingTemplate] = useState<GlobalElementTemplate | null | 'new'>(null);

  if (!orgId) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No organization selected. Log in to access Global Elements.</p>
      </div>
    );
  }

  // Template editor view
  if (editingTemplate !== null) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl mb-1">Global Elements</h1>
          <p className="text-sm text-muted-foreground">
            Configuration templates with variable substitution
          </p>
        </div>
        <TemplateEditor
          template={editingTemplate === 'new' ? null : editingTemplate}
          definitions={definitions}
          orgId={orgId}
          onSave={createTemplate}
          onUpdate={updateTemplate}
          onBack={() => setEditingTemplate(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl mb-1">Global Elements</h1>
        <p className="text-sm text-muted-foreground">
          Define reusable configuration templates with hierarchical variable substitution
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="templates">
            <Layers className="h-4 w-4 mr-2" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="variables">
            <Braces className="h-4 w-4 mr-2" />
            Variables
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-6">
          <TemplateList
            templates={templates}
            onEdit={t => setEditingTemplate(t)}
            onCreate={() => setEditingTemplate('new')}
            onDelete={deleteTemplate}
            onDuplicate={duplicateTemplate}
          />
        </TabsContent>

        <TabsContent value="variables" className="mt-6">
          <VariableManagement />
        </TabsContent>

        <TabsContent value="preview" className="mt-6">
          <ResolutionPreview
            templates={templates}
            definitions={definitions}
            values={values}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
