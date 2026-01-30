/**
 * Dashboard View Tabs Component
 *
 * Horizontal tabs for switching between dashboard views:
 * Site (default), Access Points, Clients, Switches, AI Insights
 */

import { Building, Radio, Users, Network, Sparkles } from 'lucide-react';
import { Badge } from './ui/badge';
import { cn } from './ui/utils';

export type DashboardView = 'site' | 'access-points' | 'clients' | 'switches' | 'ai-insights';

interface DashboardViewTabsProps {
  activeView: DashboardView;
  onViewChange: (view: DashboardView) => void;
  className?: string;
}

const views: { id: DashboardView; label: string; icon: React.ElementType; placeholder?: boolean }[] = [
  { id: 'site', label: 'Site', icon: Building },
  { id: 'access-points', label: 'Access Points', icon: Radio },
  { id: 'clients', label: 'Clients', icon: Users },
  { id: 'switches', label: 'Switches', icon: Network },
  { id: 'ai-insights', label: 'AI Insights', icon: Sparkles, placeholder: true },
];

export function DashboardViewTabs({
  activeView,
  onViewChange,
  className = ''
}: DashboardViewTabsProps) {
  return (
    <div className={cn("border-b", className)}>
      <nav className="flex gap-1" aria-label="Dashboard views">
        {views.map((view) => {
          const Icon = view.icon;
          const isActive = activeView === view.id;

          return (
            <button
              key={view.id}
              onClick={() => onViewChange(view.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors rounded-t-md",
                "hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                isActive
                  ? "bg-background text-foreground border border-b-0 border-border -mb-[1px] relative z-10"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="h-4 w-4" />
              <span>{view.label}</span>
              {view.placeholder && (
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-muted text-muted-foreground">
                  Soon
                </Badge>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
