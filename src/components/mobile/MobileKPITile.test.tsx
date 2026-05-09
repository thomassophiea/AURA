import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Activity } from 'lucide-react';
import { MobileKPITile } from './MobileKPITile';

const baseProps = {
  icon: Activity,
  label: 'Active APs',
  value: 42,
};

describe('MobileKPITile', () => {
  it('renders icon, label, and value', () => {
    const { container } = render(<MobileKPITile {...baseProps} />);
    expect(screen.getByText('Active APs')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('clicking the tile fires onClick', () => {
    const onClick = vi.fn();
    render(<MobileKPITile {...baseProps} onClick={onClick} />);
    fireEvent.click(screen.getByText('42').closest('button')!);
    expect(onClick).toHaveBeenCalled();
  });

  it.each([
    ['good', 'border-green-500/20'],
    ['warning', 'border-amber-500/20'],
    ['critical', 'border-red-500/20'],
  ] as const)('applies the %s status border', (status, expected) => {
    const { container } = render(<MobileKPITile {...baseProps} status={status} />);
    expect(container.querySelector('button')!.className).toContain(expected);
  });

  it('default status (no prop) uses border-border + bg-card', () => {
    const { container } = render(<MobileKPITile {...baseProps} />);
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('border-border');
    expect(btn.className).toContain('bg-card');
  });

  it('renders the badge number when > 0', () => {
    render(<MobileKPITile {...baseProps} badge={3} />);
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('caps the badge at 99+', () => {
    render(<MobileKPITile {...baseProps} badge={150} />);
    expect(screen.getByText('99+')).toBeTruthy();
  });

  it('hides the badge when 0 or undefined', () => {
    const { rerender } = render(<MobileKPITile {...baseProps} badge={0} />);
    expect(screen.queryByText('0')).toBeNull();
    rerender(<MobileKPITile {...baseProps} />);
    // No badge element rendered
    expect(screen.queryByText(/^\d+$/)).toBeTruthy(); // value is still shown
  });

  it('renders trend value with up arrow + green color', () => {
    const { container } = render(
      <MobileKPITile {...baseProps} trend={{ direction: 'up', value: '12%' }} />
    );
    expect(screen.getByText('12%')).toBeTruthy();
    expect(container.querySelector('.text-green-500')).toBeTruthy();
  });

  it('renders trend value with down arrow + red color', () => {
    const { container } = render(
      <MobileKPITile {...baseProps} trend={{ direction: 'down', value: '5%' }} />
    );
    expect(container.querySelector('.text-red-500')).toBeTruthy();
  });

  it('renders trend with neutral icon + muted color', () => {
    const { container } = render(
      <MobileKPITile {...baseProps} trend={{ direction: 'neutral', value: '0' }} />
    );
    expect(container.querySelector('.text-muted-foreground')).toBeTruthy();
  });

  it('renders no trend when prop is omitted', () => {
    render(<MobileKPITile {...baseProps} />);
    expect(screen.queryByText('%')).toBeNull();
  });
});
