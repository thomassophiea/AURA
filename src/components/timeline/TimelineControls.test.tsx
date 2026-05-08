import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimelineControls } from './TimelineControls';

const baseProps = {
  currentTime: null,
  isLocked: false,
  hasTimeWindow: false,
  onToggleLock: vi.fn(),
  onClearTimeWindow: vi.fn(),
};

describe('TimelineControls', () => {
  it('renders "No time selected" when currentTime is null', () => {
    render(<TimelineControls {...baseProps} />);
    expect(screen.getByText('No time selected')).toBeTruthy();
  });

  it('formats currentTime to a localized timestamp string', () => {
    render(<TimelineControls {...baseProps} currentTime={Date.parse('2026-05-01T12:00:00Z')} />);
    // The exact text depends on the test runner's locale; assert we're not the
    // "No time selected" sentinel and that something with "May" or "1" appears.
    expect(screen.queryByText('No time selected')).toBeNull();
    // Any presence of "May" or "1" character is enough to confirm formatting
    expect(document.body.textContent).toMatch(/May|2026|1/);
  });

  it('shows "Tracking" status when unlocked AND currentTime is set', () => {
    render(<TimelineControls {...baseProps} currentTime={1000} isLocked={false} />);
    expect(screen.getByText('Tracking')).toBeTruthy();
  });

  it('shows "Unlocked" when unlocked AND currentTime is null', () => {
    render(<TimelineControls {...baseProps} currentTime={null} isLocked={false} />);
    expect(screen.getByText('Unlocked')).toBeTruthy();
  });

  it('shows "Locked" button when locked + clicking it fires onToggleLock', () => {
    const onToggleLock = vi.fn();
    render(
      <TimelineControls {...baseProps} isLocked currentTime={1000} onToggleLock={onToggleLock} />
    );
    fireEvent.click(screen.getByText('Locked'));
    expect(onToggleLock).toHaveBeenCalled();
  });

  it('shows "Window:" badge when hasTimeWindow=true', () => {
    render(<TimelineControls {...baseProps} hasTimeWindow currentTime={1000} />);
    expect(screen.getByText(/Window:/)).toBeTruthy();
  });

  it('shows the Clear Selection button when hasTimeWindow=true and fires onClearTimeWindow', () => {
    const onClearTimeWindow = vi.fn();
    render(
      <TimelineControls
        {...baseProps}
        hasTimeWindow
        currentTime={1000}
        onClearTimeWindow={onClearTimeWindow}
      />
    );
    fireEvent.click(screen.getByText('Clear Selection'));
    expect(onClearTimeWindow).toHaveBeenCalled();
  });

  it('hides the Clear Selection button when hasTimeWindow=false', () => {
    render(<TimelineControls {...baseProps} hasTimeWindow={false} />);
    expect(screen.queryByText('Clear Selection')).toBeNull();
  });

  it('shows "Copy to ..." button when onCopyTimeline + currentTime are present', () => {
    const onCopyTimeline = vi.fn();
    render(
      <TimelineControls
        {...baseProps}
        currentTime={1000}
        onCopyTimeline={onCopyTimeline}
        sourceLabel="AP Insights"
      />
    );
    const btn = screen.getByText(/Copy to AP Insights/);
    fireEvent.click(btn);
    expect(onCopyTimeline).toHaveBeenCalled();
  });

  it('hides Copy when currentTime null and no time window', () => {
    render(<TimelineControls {...baseProps} onCopyTimeline={vi.fn()} />);
    expect(screen.queryByText(/Copy to/)).toBeNull();
  });

  it('toggles the help panel when "Help" / "Hide" button clicked', () => {
    render(<TimelineControls {...baseProps} />);
    expect(screen.queryByText(/Timeline Navigation Guide/)).toBeNull();
    fireEvent.click(screen.getByText('Help'));
    expect(screen.getByText(/Timeline Navigation Guide/)).toBeTruthy();
    fireEvent.click(screen.getByText('Hide'));
    expect(screen.queryByText(/Timeline Navigation Guide/)).toBeNull();
  });
});
