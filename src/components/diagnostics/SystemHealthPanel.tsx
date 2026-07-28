/**
 * System Health panel — the controller's CONFIGURATION + OPERATIONAL check
 * lists. Each row is a computed HealthCheck: a severity icon, the check title,
 * an affected-AP summary and the derivation detail. Runtime-only checks render
 * a neutral "Runtime" pill (never a fake green/red) with a not-in-config-API
 * note. Pure presentation — all logic lives in diagnosticsEngine.
 */
import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  OctagonAlert,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import {
  checksByCategory,
  type CheckCategory,
  type HealthCheck,
  type Severity,
} from './diagnosticsEngine';

const SEVERITY_META: Record<
  Severity,
  { icon: typeof CheckCircle2; className: string; label: string }
> = {
  alert: { icon: OctagonAlert, className: 'text-[var(--status-error,#C62828)]', label: 'Alert' },
  warn: { icon: AlertTriangle, className: 'text-[var(--status-warning,#E65100)]', label: 'Warning' },
  ok: { icon: CheckCircle2, className: 'text-[var(--status-success,#2E7D32)]', label: 'OK' },
};

function CheckRow({ check }: { check: HealthCheck }) {
  const meta = SEVERITY_META[check.runtime ? 'ok' : check.severity];
  const Icon = check.runtime ? Info : meta.icon;
  const iconClass = check.runtime ? 'text-muted-foreground' : meta.className;
  return (
    <li className="flex items-start gap-3 border-b border-border/60 py-2.5 last:border-b-0">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} aria-label={check.runtime ? 'Runtime' : meta.label} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{check.title}</span>
          {check.runtime ? (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              Runtime
            </Badge>
          ) : (
            check.affected.length > 0 && (
              <Badge variant={check.severity === 'alert' ? 'destructive' : 'warning'}>
                {check.affected.length} affected
              </Badge>
            )
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Check detail"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{check.detail}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <p className="text-xs text-muted-foreground">{check.detail}</p>
        {check.affected.length > 0 && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Affected:</span>{' '}
            {check.affected.slice(0, 12).join(', ')}
            {check.affected.length > 12 && ` +${check.affected.length - 12} more`}
          </p>
        )}
      </div>
    </li>
  );
}

function CategoryList({ title, checks }: { title: string; checks: HealthCheck[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {checks.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">No checks in this category.</p>
      ) : (
        <ul>
          {checks.map((c) => (
            <CheckRow key={c.id} check={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

const CATEGORY_TITLES: Record<CheckCategory, string> = {
  configuration: 'Configuration',
  operational: 'Operational',
};

export function SystemHealthPanel({ checks }: { checks: HealthCheck[] }) {
  const configuration = checksByCategory(checks, 'configuration');
  const operational = checksByCategory(checks, 'operational');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">System Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <CategoryList title={CATEGORY_TITLES.configuration} checks={configuration} />
        <CategoryList title={CATEGORY_TITLES.operational} checks={operational} />
      </CardContent>
    </Card>
  );
}

export default SystemHealthPanel;
