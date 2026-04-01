/**
 * GlobalElementsPage — Top-level page with tab navigation for
 * Templates, Variables, Assignments, Preview, and Deployments.
 */

import { useState, useEffect } from 'react';
import { Layers, Braces, Eye, Link2, Rocket, AlertTriangle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { TemplateList } from './TemplateList';
import { TemplateEditor } from './TemplateEditor';
import { VariableManagement } from './VariableManagement';
import { ResolutionPreview } from './ResolutionPreview';
import { AssignmentManager } from './AssignmentManager';
import { DeploymentHistory } from './DeploymentHistory';
import { DriftDetection } from './DriftDetection';
import { useTemplates, useVariableDefinitions, useVariableValues, useTemplateAssignments } from '../../hooks/useGlobalElements';
import { useAppContext } from '../../contexts/AppContext';
import type { GlobalElementTemplate, GlobalElementType } from '../../types/globalElements';

type TabId = 'templates' | 'variables' | 'assignments' | 'preview' | 'deployments' | 'drift';

interface Props {
  initialTab?: TabId;
  /** When set, auto-opens the template editor with this element type pre-selected */
  initialElementType?: GlobalElementType;
  /** Called after consuming initialElementType so App.tsx can clear pendingTemplateType */
  onConsumeElementType?: () => void;
}

export function GlobalElementsPage({ initialTab = 'templates', initialElementType, onConsumeElementType }: Props) {
  const { organization, siteGroups } = useAppContext();
  const orgId = organization?.id;

  const {
    templates, createTemplate, updateTemplate, deleteTemplate, duplicateTemplate,
  } = useTemplates(orgId);
  const { definitions } = useVariableDefinitions(orgId);
  const { values } = useVariableValues(orgId);
  const { assignments } = useTemplateAssignments(orgId);

  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [editingTemplate, setEditingTemplate] = useState<GlobalElementTemplate | null | 'new'>(
    initialElementType ? 'new' : null
  );
  const [autoElementType, setAutoElementType] = useState<GlobalElementType | undefined>(initialElementType);

  // Consume the initialElementType so it doesn't re-trigger on re-renders
  useEffect(() => {
    if (initialElementType) {
      setEditingTemplate('new');
      setAutoElementType(initialElementType);
      onConsumeElementType?.();
    }
  }, [initialElementType]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold mb-0.5">Global Elements</h1>
          <p className="text-xs text-muted-foreground">
            Configuration templates with variable substitution
          </p>
        </div>
        <TemplateEditor
          template={editingTemplate === 'new' ? null : editingTemplate}
          definitions={definitions}
          orgId={orgId}
          initialElementType={autoElementType}
          onSave={createTemplate}
          onUpdate={updateTemplate}
          onBack={() => { setEditingTemplate(null); setAutoElementType(undefined); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-semibold mb-0.5">Global Elements</h1>
        <p className="text-xs text-muted-foreground">
          Configuration templates with variable substitution
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="inline-flex w-auto min-w-full sm:min-w-0">
            <TabsTrigger value="templates" className="text-xs gap-1.5 px-2.5">
              <Layers className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Templates</span>
              <span className="xs:hidden">Tpl</span>
            </TabsTrigger>
            <TabsTrigger value="variables" className="text-xs gap-1.5 px-2.5">
              <Braces className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Variables</span>
              <span className="xs:hidden">Vars</span>
            </TabsTrigger>
            <TabsTrigger value="assignments" className="text-xs gap-1.5 px-2.5">
              <Link2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Assignments</span>
              <span className="sm:hidden">Assign</span>
            </TabsTrigger>
            <TabsTrigger value="preview" className="text-xs gap-1.5 px-2.5">
              <Eye className="h-3.5 w-3.5" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="deployments" className="text-xs gap-1.5 px-2.5">
              <Rocket className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Deployments</span>
              <span className="sm:hidden">Deploy</span>
            </TabsTrigger>
            <TabsTrigger value="drift" className="text-xs gap-1.5 px-2.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Drift
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="templates" className="mt-4">
          <TemplateList
            templates={templates}
            onEdit={t => setEditingTemplate(t)}
            onCreate={() => setEditingTemplate('new')}
            onDelete={deleteTemplate}
            onDuplicate={duplicateTemplate}
          />
        </TabsContent>

        <TabsContent value="variables" className="mt-4">
          <VariableManagement />
        </TabsContent>

        <TabsContent value="assignments" className="mt-4">
          <AssignmentManager />
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <ResolutionPreview
            templates={templates}
            definitions={definitions}
            values={values}
          />
        </TabsContent>

        <TabsContent value="deployments" className="mt-4">
          <DeploymentHistory
            templates={templates}
            definitions={definitions}
            values={values}
          />
        </TabsContent>

        <TabsContent value="drift" className="mt-4">
          <DriftDetection
            templates={templates}
            definitions={definitions}
            values={values}
            assignments={assignments}
            siteGroups={siteGroups}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
