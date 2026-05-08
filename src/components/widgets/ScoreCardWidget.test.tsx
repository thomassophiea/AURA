import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScoreCardWidget, ScoreCardGrid } from './ScoreCardWidget';

describe('ScoreCardWidget', () => {
  it('renders title and value', () => {
    render(<ScoreCardWidget title="Total APs" value={42} />);
    expect(screen.getByText('Total APs')).toBeTruthy();
    expect(screen.getByText('42.00')).toBeTruthy();
  });

  it('renders a string value as-is and shows the unit beside it', () => {
    render(<ScoreCardWidget title="Status" value="OK" unit="status" />);
    expect(screen.getByText('OK')).toBeTruthy();
    expect(screen.getByText('status')).toBeTruthy();
  });

  it.each([
    [1500, 'bps', /1\.50 Kbps/],
    [5e6, 'bps', /5\.00 Mbps/],
    [99.6, '%', /99\.6%/],
    [1500, 'ms', /1\.50 s/],
    [50, 'ms', /50 ms/],
  ] as const)('formats numeric value with unit %s', (value, unit, expected) => {
    render(<ScoreCardWidget title="X" value={value} unit={unit} />);
    expect(document.body.textContent).toMatch(expected);
  });

  it('shows trend indicator with up arrow + green color', () => {
    const { container } = render(
      <ScoreCardWidget title="X" value={1} trend={{ value: 12.4, direction: 'up' }} />
    );
    expect(screen.getByText('12.4%')).toBeTruthy();
    expect(container.querySelector('.text-green-500')).toBeTruthy();
  });

  it('shows trend indicator with down arrow + red color', () => {
    const { container } = render(
      <ScoreCardWidget title="X" value={1} trend={{ value: -8, direction: 'down' }} />
    );
    expect(screen.getByText('8.0%')).toBeTruthy();
    expect(container.querySelector('.text-red-500')).toBeTruthy();
  });

  it('renders subtitle when provided', () => {
    render(<ScoreCardWidget title="X" value={1} subtitle="vs last hour" />);
    expect(screen.getByText('vs last hour')).toBeTruthy();
  });

  it.each(['good', 'warning', 'critical'] as const)(
    'applies the %s status background',
    (status) => {
      const { container } = render(<ScoreCardWidget title="X" value={1} status={status} />);
      const root = container.firstChild as HTMLElement;
      expect(root.className).toMatch(/bg-(green|amber|red)-500\/10/);
    }
  );

  it('default status="neutral" uses bg-card', () => {
    const { container } = render(<ScoreCardWidget title="X" value={1} />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('bg-card');
  });

  it('clickable card has role=button + responds to onClick', () => {
    const onClick = vi.fn();
    render(<ScoreCardWidget title="X" value={1} onClick={onClick} />);
    const root = screen.getByRole('button');
    fireEvent.click(root);
    expect(onClick).toHaveBeenCalled();
  });

  it('clickable card responds to Enter and Space keypress', () => {
    const onClick = vi.fn();
    render(<ScoreCardWidget title="X" value={1} onClick={onClick} />);
    const root = screen.getByRole('button');
    fireEvent.keyDown(root, { key: 'Enter' });
    fireEvent.keyDown(root, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('non-clickable card has no role=button + tabIndex', () => {
    const { container } = render(<ScoreCardWidget title="X" value={1} />);
    expect(container.querySelector('[role="button"]')).toBeNull();
  });

  it('treats unit "undefined"/"null" string sentinels as no unit', () => {
    render(<ScoreCardWidget title="X" value={5e3} unit="undefined" />);
    expect(document.body.textContent).toMatch(/5\.00 KB/);
  });

  it('renders custom icon when provided', () => {
    render(<ScoreCardWidget title="X" value={1} icon={<span data-testid="custom-icon">★</span>} />);
    expect(screen.getByTestId('custom-icon')).toBeTruthy();
  });
});

describe('ScoreCardGrid', () => {
  it('renders one ScoreCardWidget per card', () => {
    render(
      <ScoreCardGrid
        cards={[
          { title: 'A', value: 1 },
          { title: 'B', value: 2 },
          { title: 'C', value: 3 },
        ]}
      />
    );
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('C')).toBeTruthy();
  });

  it.each([1, 2, 3, 4] as const)('uses correct grid-cols class for columns=%s', (cols) => {
    const { container } = render(
      <ScoreCardGrid cards={[{ title: 'X', value: 1 }]} columns={cols} />
    );
    const grid = container.firstChild as HTMLElement;
    if (cols === 1) {
      expect(grid.className).toContain('grid-cols-1');
    } else {
      expect(grid.className).toMatch(new RegExp(`(md|lg):grid-cols-${cols}`));
    }
  });
});
