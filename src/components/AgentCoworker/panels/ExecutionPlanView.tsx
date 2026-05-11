import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  MinusCircle,
  Server,
  Wifi,
  Shield,
} from 'lucide-react';
import { cn } from '../../ui/utils';
import type { ExecutionPlan, ImpactedObject, PlanStatus, StepStatus } from '../agentTypes';

interface ExecutionPlanViewProps {
  plan: ExecutionPlan | null;
}

const STATUS_COLORS: Record<PlanStatus, string> = {
  building: 'text-white/50 bg-white/5',
  pending: 'text-amber-300 bg-amber-900/30',
  approved: 'text-violet-300 bg-violet-900/30',
  executing: 'text-blue-300 bg-blue-900/30',
  completed: 'text-green-300 bg-green-900/30',
  rejected: 'text-red-300 bg-red-900/30',
  rolledback: 'text-orange-300 bg-orange-900/30',
  failed: 'text-red-300 bg-red-900/30',
};

const STATUS_LABELS: Record<PlanStatus, string> = {
  building: 'Building Plan',
  pending: 'Awaiting Approval',
  approved: 'Approved',
  executing: 'Executing',
  completed: 'Completed',
  rejected: 'Rejected',
  rolledback: 'Rolled Back',
  failed: 'Failed',
};

function StepDot({ status }: { status: StepStatus }) {
  if (status === 'running')
    return <Loader2 className="h-4 w-4 text-violet-400 animate-spin shrink-0" />;
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />;
  if (status === 'failed') return <XCircle className="h-4 w-4 text-red-400 shrink-0" />;
  if (status === 'skipped') return <MinusCircle className="h-4 w-4 text-white/30 shrink-0" />;
  return <Circle className="h-4 w-4 text-white/25 shrink-0" />;
}

function ImpactChip({ obj }: { obj: ImpactedObject }) {
  const Icon =
    obj.type === 'ap' ? Wifi : obj.type === 'ssid' ? Wifi : obj.type === 'policy' ? Shield : Server;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/8 text-xs text-white/70">
      <Icon className="h-3 w-3 text-white/50" />
      {obj.name}
      {obj.count ? ` (${obj.count})` : ''}
    </span>
  );
}

export function ExecutionPlanView({ plan }: ExecutionPlanViewProps) {
  if (!plan) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-white/30">
        No active execution plan
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/90">{plan.title}</h3>
        <span
          className={cn('text-xs px-2.5 py-1 rounded-full font-medium', STATUS_COLORS[plan.status])}
        >
          {STATUS_LABELS[plan.status]}
        </span>
      </div>
      <p className="text-xs text-white/50">{plan.description}</p>

      {plan.impactedObjects.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-white/30 font-medium">Impacted</p>
          <div className="flex flex-wrap gap-2">
            {plan.impactedObjects.map((obj) => (
              <ImpactChip key={obj.id} obj={obj} />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-wider text-white/30 font-medium mb-3">Steps</p>
        {plan.steps.map((step, i) => (
          <div
            key={step.id}
            className="flex items-start gap-3 py-2.5 px-3 rounded-lg bg-white/4 hover:bg-white/6 transition-colors"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <StepDot status={step.status} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/80">{step.label}</p>
              <p className="text-xs text-white/40 mt-0.5">{step.description}</p>
              {step.apiEndpoint && (
                <p className="text-[10px] font-mono text-white/30 mt-1">{step.apiEndpoint}</p>
              )}
            </div>
            {step.duration !== undefined && (
              <span className="text-[10px] text-white/30 shrink-0">{step.duration}ms</span>
            )}
          </div>
        ))}
      </div>

      {plan.completedAt && (
        <p className="text-xs text-white/30">Completed {plan.completedAt.toLocaleTimeString()}</p>
      )}
    </div>
  );
}
