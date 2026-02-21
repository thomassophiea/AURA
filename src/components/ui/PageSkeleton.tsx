import { Skeleton } from "./skeleton";

type SkeletonVariant = 'dashboard' | 'table' | 'cards' | 'default';

interface PageSkeletonProps {
  variant?: SkeletonVariant;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
      <Skeleton className="h-48 rounded-lg" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
      <div className="flex justify-between items-center pt-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-48" />
      </div>
    </div>
  );
}

function CardsSkeleton() {
  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function DefaultSkeleton() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center space-y-4">
        <Skeleton className="h-12 w-12 rounded-full mx-auto" />
        <Skeleton className="h-4 w-32 mx-auto" />
      </div>
    </div>
  );
}

export function PageSkeleton({ variant = 'default' }: PageSkeletonProps) {
  switch (variant) {
    case 'dashboard':
      return <DashboardSkeleton />;
    case 'table':
      return <TableSkeleton />;
    case 'cards':
      return <CardsSkeleton />;
    default:
      return <DefaultSkeleton />;
  }
}

export function getSkeletonVariant(page: string): SkeletonVariant {
  switch (page) {
    case 'sle-dashboard':
    case 'service-levels':
    case 'dashboard':
    case 'reports':
    case 'app-insights':
    case 'security-dashboard':
      return 'dashboard';
    case 'access-points':
    case 'connected-clients':
    case 'alerts-events':
    case 'event-alarm-dashboard':
    case 'guest-management':
      return 'table';
    case 'configure-networks':
    case 'configure-sites':
    case 'configure-policy':
    case 'configure-aaa-policies':
    case 'configure-adoption-rules':
    case 'configure-guest':
    case 'configure-advanced':
    case 'administration':
    case 'tools':
      return 'cards';
    default:
      return 'default';
  }
}
