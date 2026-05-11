import { CheckCircle2, XCircle, RotateCcw, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '../../ui/utils';
import type { ExecutionPlan } from '../agentTypes';

interface ApprovalControlsProps {
  plan: ExecutionPlan;
  onApprove: (planId: string) => void;
  onReject: (planId: string) => void;
  onRollback: (planId: string) => void;
  isExecuting?: boolean;
}

export function ApprovalControls({
  plan,
  onApprove,
  onReject,
  onRollback,
  isExecuting = false,
}: ApprovalControlsProps) {
  const isPending = plan.status === 'pending';
  const isCompleted = plan.status === 'completed';
  const isExecutingState = plan.status === 'executing' || isExecuting;

  if (plan.status === 'rejected' || plan.status === 'rolledback') {
    return (
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 text-sm text-white/50">
          <XCircle className="h-4 w-4 text-red-400/70" />
          Plan {plan.status === 'rejected' ? 'rejected' : 'rolled back'} — no changes applied
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-4">
      {isPending && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-amber-900/20 border border-amber-700/30">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200/80">
            This will apply changes to live infrastructure. Review the diff and plan steps before
            approving.
          </p>
        </div>
      )}

      {isPending && (
        <div className="flex gap-3">
          <button
            onClick={() => onApprove(plan.id)}
            disabled={isExecutingState}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-medium transition-colors',
              'bg-green-700 hover:bg-green-600 text-white',
              'disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            <CheckCircle2 className="h-4 w-4" />
            Approve
          </button>
          <button
            onClick={() => onReject(plan.id)}
            disabled={isExecutingState}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-medium transition-colors',
              'bg-red-900/60 hover:bg-red-800/70 text-red-200',
              'disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            <XCircle className="h-4 w-4" />
            Reject
          </button>
        </div>
      )}

      {isExecutingState && (
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-violet-900/20 border border-violet-700/30">
          <Loader2 className="h-4 w-4 text-violet-400 animate-spin shrink-0" />
          <p className="text-xs text-violet-200/80">Executing plan steps…</p>
        </div>
      )}

      {isCompleted && (
        <button
          onClick={() => onRollback(plan.id)}
          className={cn(
            'w-full flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-medium transition-colors',
            'bg-orange-900/40 hover:bg-orange-800/50 text-orange-200'
          )}
        >
          <RotateCcw className="h-4 w-4" />
          Rollback
        </button>
      )}
    </div>
  );
}
