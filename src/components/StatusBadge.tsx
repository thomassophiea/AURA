import { Badge } from './ui/badge';
import { BADGE_STYLES } from '../utils/ui-constants';
import { cn } from '../lib/utils';
import { CheckCircle, AlertTriangle, XCircle, Info, Circle } from 'lucide-react';

type StatusType = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface StatusBadgeProps {
  status: StatusType;
  label: string;
  showIcon?: boolean;
  className?: string;
}

const STATUS_ICONS = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
  neutral: Circle,
};

export function StatusBadge({ 
  status, 
  label, 
  showIcon = true,
  className 
}: StatusBadgeProps) {
  const Icon = STATUS_ICONS[status];
  
  return (
    <Badge 
      variant="outline" 
      className={cn(BADGE_STYLES[status], className, 'inline-flex items-center gap-1')}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {label}
    </Badge>
  );
}
