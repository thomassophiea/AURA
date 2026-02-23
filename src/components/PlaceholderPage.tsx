import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { LucideIcon, Clock } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  features?: string[];
  /** Show a realistic skeleton mockup of the page layout */
  mockupType?: 'table' | 'charts' | 'cards' | 'form';
}

function TableMockup() {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b px-4 py-3 flex gap-6">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-4 w-24" />)}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex gap-6 border-b last:border-0 items-center">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ChartsMockup() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-56 mt-1" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-44 w-full rounded-md" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CardsMockup() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-14 mb-1" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <ChartsMockup />
    </div>
  );
}

function FormMockup() {
  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-28" />
        </div>
      </CardContent>
    </Card>
  );
}

export function PlaceholderPage({
  title,
  description,
  icon: Icon,
  features = [],
  mockupType = 'cards',
}: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {Icon && <Icon className="h-6 w-6 text-muted-foreground" />}
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        <Badge variant="outline" className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3 w-3" />
          Coming Soon
        </Badge>
      </div>

      {/* Feature list */}
      {features.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Planned capabilities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {features.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/40 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Layout mockup — gives a visual preview of what the page will look like */}
      <div className="opacity-40 pointer-events-none select-none" aria-hidden>
        {mockupType === 'table' && <TableMockup />}
        {mockupType === 'charts' && <ChartsMockup />}
        {mockupType === 'cards' && <CardsMockup />}
        {mockupType === 'form' && <FormMockup />}
      </div>
    </div>
  );
}
