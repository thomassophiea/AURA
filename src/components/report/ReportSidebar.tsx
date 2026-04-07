import { useState, useRef } from 'react';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import {
  FileText, ChevronRight, ChevronDown, Plus, Trash2, GripVertical,
  Wifi, Users, Activity, BarChart3, Radio, AppWindow, MapPin, Shield,
  Layers, Settings, Eye, EyeOff,
} from 'lucide-react';
import { cn } from '../ui/utils';
import type { ReportPageConfig } from '../../types/reportConfig';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText, Wifi, Users, Activity, BarChart3, Radio, AppWindow, MapPin, Shield, Layers, Settings,
};

interface ReportSidebarProps {
  pages: ReportPageConfig[];
  activePageId: string | null;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  onRemovePage: (pageId: string) => void;
  onReorderPages: (fromIndex: number, toIndex: number) => void;
  onToggleVisibility?: (pageId: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isEditing: boolean;
}

export function ReportSidebar({
  pages, activePageId, onSelectPage, onAddPage, onRemovePage,
  onReorderPages, onToggleVisibility, collapsed, onToggleCollapse, isEditing,
}: ReportSidebarProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (!isEditing) return;
    dragRef.current = index;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragRef.current !== null && dragRef.current !== index) setDropIndex(index);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragRef.current !== null && dragRef.current !== index) {
      onReorderPages(dragRef.current, index);
    }
    dragRef.current = null;
    setDragIndex(null);
    setDropIndex(null);
  };

  const handleDragEnd = () => {
    dragRef.current = null;
    setDragIndex(null);
    setDropIndex(null);
  };

  const visiblePages = pages.filter(p => p.visible !== false);
  const displayPages = isEditing ? pages : visiblePages;

  return (
    <div className={cn(
      'flex-shrink-0 border-r border-border/50 bg-card/50 transition-all duration-200 print:hidden',
      collapsed ? 'w-12' : 'w-56'
    )}>
      <div className="flex flex-col h-full">
        <div className="px-3 py-3 border-b border-border/50 flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider">Pages</span>
            </div>
          )}
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onToggleCollapse}>
            {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3 rotate-90" />}
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {displayPages.map((page, index) => {
              const IconComp = ICON_MAP[page.icon || ''] || FileText;
              const isActive = activePageId === page.id || (!activePageId && index === 0);
              const isHidden = page.visible === false;

              return (
                <div
                  key={page.id}
                  draggable={isEditing}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    'group flex items-center gap-1 rounded-md transition-colors',
                    dragIndex === index && 'opacity-40',
                    dropIndex === index && 'ring-1 ring-primary',
                    isHidden && 'opacity-50',
                  )}
                >
                  {isEditing && !collapsed && (
                    <GripVertical className="h-3 w-3 text-muted-foreground cursor-grab flex-shrink-0" />
                  )}
                  <button
                    onClick={() => onSelectPage(page.id)}
                    className={cn(
                      'flex-1 flex items-center gap-2 px-2 py-2 rounded-md text-xs transition-colors text-left min-w-0',
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-card-foreground'
                    )}
                    title={page.title}
                  >
                    <IconComp className={cn('h-3.5 w-3.5 flex-shrink-0', isActive && 'text-primary')} />
                    {!collapsed && <span className="truncate">{page.title}</span>}
                  </button>
                  {isEditing && !collapsed && (
                    <div className="flex-shrink-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {onToggleVisibility && (
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onToggleVisibility(page.id)}>
                          {isHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400 hover:text-red-500" onClick={() => onRemovePage(page.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {isEditing && !collapsed && (
          <div className="p-2 border-t border-border/50">
            <Button variant="outline" size="sm" className="w-full text-xs" onClick={onAddPage}>
              <Plus className="h-3 w-3 mr-1.5" />
              Add Page
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
