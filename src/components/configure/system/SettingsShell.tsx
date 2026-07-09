/**
 * Header + Refresh/Save toolbar + Card body shared by the singleton settings
 * editors (SNMP, Global Settings). Save is dirty-gated; a loading skeleton is
 * shown until the record arrives.
 */
import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import { Skeleton } from '../../ui/skeleton';

export interface SettingsShellProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  ready: boolean;
  onRefresh: () => void;
  onSave: () => void;
  children: React.ReactNode;
}

export function SettingsShell({
  title,
  description,
  loading,
  saving,
  dirty,
  ready,
  onRefresh,
  onSave,
  children,
}: SettingsShellProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-medium">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading || saving}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={onSave} disabled={!dirty || saving || loading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </div>
      <Card>
        <CardContent className="p-4">
          {!ready ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-2/3" />
              <Skeleton className="h-9 w-1/2" />
            </div>
          ) : (
            <div className="max-w-[560px] space-y-6">{children}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
