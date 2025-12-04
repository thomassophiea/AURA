import { Button } from './ui/button';
import { RefreshCw, LucideIcon } from 'lucide-react';
import { TYPOGRAPHY, LAYOUTS, BUTTON_STYLES } from '../utils/ui-constants';
import { cn } from '../lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  onRefresh?: () => void;
  refreshing?: boolean;
  actions?: React.ReactNode;
}

export function PageHeader({ 
  title, 
  subtitle, 
  icon: Icon, 
  onRefresh, 
  refreshing = false,
  actions 
}: PageHeaderProps) {
  return (
    <div className={LAYOUTS.pageHeader}>
      <div className="flex items-center gap-3">
        {Icon && <Icon className="h-8 w-8 text-primary" />}
        <div>
          <h1 className={TYPOGRAPHY.pageTitle}>{title}</h1>
          {subtitle && (
            <p className={TYPOGRAPHY.bodyTextMuted}>{subtitle}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className={BUTTON_STYLES.iconButtonGap}
          >
            <RefreshCw className={cn(
              BUTTON_STYLES.iconSize,
              refreshing && 'animate-spin'
            )} />
            Refresh
          </Button>
        )}
      </div>
    </div>
  );
}
