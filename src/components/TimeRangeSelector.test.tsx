import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

import { TimeRangeSelector } from './TimeRangeSelector';
import { timeRangeOptions, localDateKey, localDayAtOffset } from '../lib/timeRange';
import type { DayCoverageStatus } from '../lib/timeRangeAvailability';

beforeAll(() => {
  // Radix Select relies on pointer-capture and layout APIs jsdom does not
  // implement. Same shims the other Radix suites in this project install.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(globalThis as any).ResizeObserver) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const NOW = new Date(2026, 7, 6, 15, 50, 0, 0);
const GROUPS = timeRangeOptions({ now: NOW, maxDayOffset: 7 });

const dateOf = (offset: number) => localDateKey(localDayAtOffset(offset, NOW));

function status(overrides: Partial<DayCoverageStatus> & { localDate: string }): DayCoverageStatus {
  return {
    availability: 'complete',
    selectable: true,
    sampleCount: 288,
    hoursPresent: 24,
    expectedHours: 24,
    completeness: 1,
    clippedByRetention: false,
    firstObservedAt: null,
    lastObservedAt: null,
    note: null,
    ...overrides,
  };
}

/** Every day complete unless overridden. */
function allComplete(overrides: DayCoverageStatus[] = []) {
  const map = new Map<string, DayCoverageStatus>();
  for (let offset = 0; offset <= 7; offset += 1) {
    map.set(dateOf(offset), status({ localDate: dateOf(offset) }));
  }
  for (const override of overrides) map.set(override.localDate, override);
  return map;
}

function renderSelector(props: Partial<React.ComponentProps<typeof TimeRangeSelector>> = {}) {
  const onChange = vi.fn();
  const result = render(
    <TimeRangeSelector
      value="24h"
      onChange={onChange}
      optionGroups={GROUPS}
      dayStatuses={allComplete()}
      retentionDays={7}
      {...props}
    />
  );
  return { onChange, ...result };
}

/** Open the dropdown via the keyboard, which needs no simulated pointer sequence. */
function open() {
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
}

const optionFor = (label: RegExp) => screen.getByRole('option', { name: label });

describe('TimeRangeSelector', () => {
  it('is a single compact control, not a row of buttons', () => {
    renderSelector();
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows the current selection on the trigger', () => {
    renderSelector({ value: 'day-1' });
    expect(screen.getByRole('combobox')).toHaveTextContent('Yesterday');
  });

  it('offers every day through the retention window plus the rolling ranges', () => {
    renderSelector();
    open();

    for (const label of [
      'Today',
      'Yesterday',
      '2 Days Ago',
      '3 Days Ago',
      '4 Days Ago',
      '5 Days Ago',
      '6 Days Ago',
      '7 Days Ago',
      'Last 24 hours',
      'Last 3 days',
      'Last 7 days',
    ]) {
      expect(optionFor(new RegExp(label, 'i'))).toBeInTheDocument();
    }
  });

  it('reports the selected token, so the caller can persist it', () => {
    const { onChange } = renderSelector();
    open();
    fireEvent.click(optionFor(/2 Days Ago/i));
    expect(onChange).toHaveBeenCalledWith('day-2');
  });

  it('lets the user walk back day by day without typing a date', () => {
    const { onChange } = renderSelector({ value: 'day-1' });
    open();
    fireEvent.click(optionFor(/3 Days Ago/i));
    expect(onChange).toHaveBeenCalledWith('day-3');
  });

  it('shows each day option with its actual date', () => {
    renderSelector();
    open();
    // 'Aug 5' in an en locale; assert the day number rather than the month name
    // so the test holds in any locale.
    expect(within(optionFor(/Yesterday/i)).getByText(/5/)).toBeInTheDocument();
  });

  it('disables a day with nothing stored and says why', () => {
    renderSelector({
      dayStatuses: allComplete([
        status({
          localDate: dateOf(4),
          availability: 'empty',
          selectable: false,
          sampleCount: 0,
          hoursPresent: 0,
          note: 'No data was stored for this day.',
        }),
      ]),
    });
    open();
    const option = optionFor(/4 Days Ago/i);
    expect(option).toHaveAttribute('aria-disabled', 'true');
    expect(option).toHaveAttribute('title', 'No data was stored for this day.');
  });

  it('disables a day that fell out of retention', () => {
    renderSelector({
      dayStatuses: allComplete([
        status({
          localDate: dateOf(7),
          availability: 'outside-retention',
          selectable: false,
          note: 'Outside the 7-day retention window.',
        }),
      ]),
    });
    open();
    expect(optionFor(/7 Days Ago/i)).toHaveAttribute('aria-disabled', 'true');
  });

  it('does not fire a change for a disabled day', () => {
    const { onChange } = renderSelector({
      dayStatuses: allComplete([
        status({ localDate: dateOf(4), availability: 'empty', selectable: false }),
      ]),
    });
    open();
    fireEvent.click(optionFor(/4 Days Ago/i));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps a partial day selectable but flags it', () => {
    renderSelector({
      dayStatuses: allComplete([
        status({
          localDate: dateOf(3),
          availability: 'partial',
          completeness: 0.5,
          hoursPresent: 12,
          note: 'Incomplete: 12 of 24 hours reported.',
        }),
      ]),
    });
    open();
    const option = optionFor(/3 Days Ago/i);
    expect(option).not.toHaveAttribute('aria-disabled', 'true');
    expect(option).toHaveAttribute('title', 'Incomplete: 12 of 24 hours reported.');
  });

  it('does not disable anything while coverage is unknown', () => {
    renderSelector({ dayStatuses: new Map() });
    open();
    for (const option of screen.getAllByRole('option')) {
      expect(option).not.toHaveAttribute('aria-disabled', 'true');
    }
  });

  it('states the retention window so the absent days are explained', () => {
    renderSelector({ retentionDays: 7 });
    open();
    expect(screen.getByText(/7 days of history are retained/i)).toBeInTheDocument();
  });

  it('says so plainly when nothing has ever been collected', () => {
    renderSelector({ neverCollected: true });
    open();
    expect(screen.getByText(/No history has been collected yet/i)).toBeInTheDocument();
  });

  it('shrinks the day list when retention is shorter', () => {
    renderSelector({ optionGroups: timeRangeOptions({ now: NOW, maxDayOffset: 2 }) });
    open();
    expect(optionFor(/2 Days Ago/i)).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /5 Days Ago/i })).not.toBeInTheDocument();
  });
});
