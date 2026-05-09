import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DashboardCustomization } from './DashboardCustomization';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
});

const widgets = [
  { id: 'w-1', name: 'Network Health', visible: true, locked: true },
  { id: 'w-2', name: 'Top APs', visible: true },
  { id: 'w-3', name: 'Recent Events', visible: false },
];

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  widgets,
  onWidgetsChange: vi.fn(),
  onToggleWidget: vi.fn(),
  onResetToDefault: vi.fn(),
};

describe('DashboardCustomization', () => {
  it('renders the title and description when open', () => {
    render(<DashboardCustomization {...baseProps} />);
    expect(screen.getByText('Customize Dashboard')).toBeTruthy();
    expect(screen.getByText(/Drag to reorder widgets/)).toBeTruthy();
  });

  it('renders nothing when closed', () => {
    render(<DashboardCustomization {...baseProps} open={false} />);
    expect(screen.queryByText('Customize Dashboard')).toBeNull();
  });

  it('renders one row per widget', () => {
    render(<DashboardCustomization {...baseProps} />);
    expect(screen.getByText('Network Health')).toBeTruthy();
    expect(screen.getByText('Top APs')).toBeTruthy();
    expect(screen.getByText('Recent Events')).toBeTruthy();
  });

  it('toggling a switch fires onToggleWidget with the id', () => {
    const onToggleWidget = vi.fn();
    render(<DashboardCustomization {...baseProps} onToggleWidget={onToggleWidget} />);
    const switches = screen.getAllByRole('switch');
    // Click the unlocked widget switch (Top APs is row 1, after the locked first row).
    fireEvent.click(switches[1]);
    expect(onToggleWidget).toHaveBeenCalledWith('w-2');
  });

  it('locked widget switch is disabled', () => {
    render(<DashboardCustomization {...baseProps} />);
    const switches = screen.getAllByRole('switch');
    expect((switches[0] as HTMLButtonElement).disabled).toBe(true);
    expect((switches[1] as HTMLButtonElement).disabled).toBe(false);
  });

  it('locked widgets are not draggable', () => {
    render(<DashboardCustomization {...baseProps} />);
    // The locked row has draggable="false". Find it by walking up from the
    // locked widget label.
    const lockedLabel = screen.getByText('Network Health');
    const row = lockedLabel.closest('[draggable]') as HTMLElement;
    expect(row.getAttribute('draggable')).toBe('false');
  });

  it('clicking Reset to Default fires onResetToDefault', () => {
    const onResetToDefault = vi.fn();
    render(<DashboardCustomization {...baseProps} onResetToDefault={onResetToDefault} />);
    fireEvent.click(screen.getByText('Reset to Default'));
    expect(onResetToDefault).toHaveBeenCalled();
  });

  it('clicking Done fires onOpenChange(false)', () => {
    const onOpenChange = vi.fn();
    render(<DashboardCustomization {...baseProps} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByText('Done'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('drag start + drop on a different index reorders + calls onWidgetsChange', () => {
    const onWidgetsChange = vi.fn();
    render(<DashboardCustomization {...baseProps} onWidgetsChange={onWidgetsChange} />);
    const row1 = screen.getByText('Top APs').closest('[draggable]') as HTMLElement;
    const row2 = screen.getByText('Recent Events').closest('[draggable]') as HTMLElement;
    fireEvent.dragStart(row1, {
      dataTransfer: { effectAllowed: 'none', setData: vi.fn() },
    });
    fireEvent.dragOver(row2);
    fireEvent.dragEnd(row1);
    expect(onWidgetsChange).toHaveBeenCalledTimes(1);
    const reordered = onWidgetsChange.mock.calls[0][0];
    // Original: [w-1, w-2, w-3] → swap 1↔2 → [w-1, w-3, w-2]
    expect(reordered.map((w: { id: string }) => w.id)).toEqual(['w-1', 'w-3', 'w-2']);
  });

  it('drag start + drop on the same index does NOT call onWidgetsChange', () => {
    const onWidgetsChange = vi.fn();
    render(<DashboardCustomization {...baseProps} onWidgetsChange={onWidgetsChange} />);
    const row1 = screen.getByText('Top APs').closest('[draggable]') as HTMLElement;
    fireEvent.dragStart(row1, {
      dataTransfer: { effectAllowed: 'none', setData: vi.fn() },
    });
    fireEvent.dragOver(row1);
    fireEvent.dragEnd(row1);
    expect(onWidgetsChange).not.toHaveBeenCalled();
  });
});
