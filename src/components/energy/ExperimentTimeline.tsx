import { AlertTriangle, CircleAlert, CircleDot, FlaskConical } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import type { ExperimentEvent } from '@/types/energyExperiment';

interface Props {
  events: ExperimentEvent[];
  limit?: number;
}

const SEVERITY_CLASS: Record<ExperimentEvent['severity'], string> = {
  info: 'text-muted-foreground',
  warning: 'text-[color:var(--status-warning)]',
  critical: 'text-[color:var(--status-error)]',
};

function icon(event: ExperimentEvent) {
  if (event.severity === 'critical') return CircleAlert;
  if (event.provenance === 'simulated') return FlaskConical;
  if (event.severity === 'warning') return AlertTriangle;
  return CircleDot;
}

/**
 * The experiment, in the order it happened, from persisted events.
 *
 * Every line is a stored row — nothing is derived at render time — so the same
 * timeline is there after a reload, a redeploy, or a week later.
 */
export function ExperimentTimeline({ events, limit = 40 }: Props) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No events yet. Starting an experiment records the first one.
      </p>
    );
  }

  // Newest first is what an operator wants mid-demo; the chart carries chronology.
  const shown = [...events].reverse().slice(0, limit);

  return (
    <ol className="space-y-2">
      {shown.map((event) => {
        const Icon = icon(event);
        return (
          <li key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', SEVERITY_CLASS[event.severity])} aria-hidden />
              <span className="mt-1 w-px flex-1 bg-border" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 pb-2">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <time
                  className="font-mono text-xs tabular-nums text-muted-foreground"
                  dateTime={event.occurredAt}
                >
                  {new Date(event.occurredAt).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </time>
                {event.side ? (
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {event.side}
                  </span>
                ) : null}
                {event.provenance === 'simulated' ? (
                  <span className="rounded-sm bg-[color:var(--status-warning)]/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--status-warning)]">
                    Simulated
                  </span>
                ) : null}
                {event.provenance === 'calculated' ? (
                  <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Calculated
                  </span>
                ) : null}
              </div>
              <p className={cn('text-sm', event.severity === 'critical' ? SEVERITY_CLASS.critical : 'text-foreground')}>
                {event.message}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
