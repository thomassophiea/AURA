/**
 * Chart-level event plumbing for the correlated timeline (hover-track,
 * click-to-lock, shift-drag window).
 *
 * recharts 3 removed `activePayload` from chart-level mouse events — handlers
 * now receive `(state, event)` where the hovered X value arrives as
 * `state.activeLabel`. Every timeline chart uses `dataKey="timestamp"` on its
 * XAxis, so the label IS the epoch-ms timestamp. The old
 * `e.activePayload[0].payload.timestamp` guards silently never matched after
 * the recharts 3 upgrade, which killed hover tracking and click-to-lock on
 * every insights chart.
 */

import type { useTimelineNavigation } from '@/hooks/useTimelineNavigation';

type Timeline = ReturnType<typeof useTimelineNavigation>;

/** The recharts 3 chart-event state fields this module reads. */
interface ChartEventState {
  activeLabel?: string | number;
  activeTooltipIndex?: number | string;
}

/**
 * Row index of the hovered/clicked point, for charts whose XAxis dataKey is a
 * formatted label rather than the raw timestamp.
 */
export function chartEventIndex(state: unknown): number | null {
  if (!state || typeof state !== 'object') return null;
  const idx = (state as ChartEventState).activeTooltipIndex;
  const n = typeof idx === 'number' ? idx : typeof idx === 'string' ? Number(idx) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Epoch-ms timestamp of the hovered/clicked point, or null when the cursor is
 * outside the plot area (recharts fires with an undefined label there).
 */
export function chartEventTimestamp(state: unknown): number | null {
  if (!state || typeof state !== 'object') return null;
  const label = (state as ChartEventState).activeLabel;
  const ts = typeof label === 'number' ? label : typeof label === 'string' ? Number(label) : NaN;
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

/**
 * The four chart-level handlers every timeline-synced chart mounts. Spread
 * onto the chart: `<AreaChart {...timelineChartHandlers(timeline)} …>`.
 */
export function timelineChartHandlers(timeline: Timeline) {
  return {
    onClick: (state: unknown) => {
      const timestamp = chartEventTimestamp(state);
      if (timestamp === null) return;
      timeline.setCurrentTime(timestamp);
      timeline.toggleLock();
    },
    onMouseDown: (state: unknown, event?: { shiftKey?: boolean }) => {
      const timestamp = chartEventTimestamp(state);
      if (timestamp !== null && event?.shiftKey) {
        timeline.startTimeWindow(timestamp);
      }
    },
    onMouseMove: (state: unknown) => {
      // No lock check here: setCurrentTime no-ops while locked and
      // updateTimeWindow no-ops outside a drag, so the handlers stay
      // independent of render-time state.
      const timestamp = chartEventTimestamp(state);
      if (timestamp === null) return;
      timeline.setCurrentTime(timestamp);
      timeline.updateTimeWindow(timestamp);
    },
    onMouseUp: () => timeline.endTimeWindow(),
  };
}
