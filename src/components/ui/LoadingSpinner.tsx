/**
 * LoadingSpinner - Simple, clean loading indicator
 * Replaces skeleton ghost boxes with a minimal spinner
 */

import { Loader2 } from 'lucide-react';
import { cn } from './utils';

interface LoadingSpinnerProps {
  message?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function LoadingSpinner({ 
  message = 'Loading...', 
  className,
  size = 'md' 
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  const containerHeight = {
    sm: 'h-32',
    md: 'h-64',
    lg: 'h-96',
  };

  return (
    <div className={cn('flex items-center justify-center', containerHeight[size], className)}>
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className={cn('animate-spin', sizeClasses[size])} />
        {message && <span className="text-sm">{message}</span>}
      </div>
    </div>
  );
}
