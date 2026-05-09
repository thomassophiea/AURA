import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NetworkHealthScore } from './NetworkHealthScore';

describe('NetworkHealthScore', () => {
  it.each([
    [95, 'Excellent', 'text-green-500'],
    [80, 'Good', 'text-blue-500'],
    [60, 'Fair', 'text-amber-500'],
    [30, 'Poor', 'text-red-500'],
  ] as const)('score=%i → "%s" with %s color', (score, label, color) => {
    const { container } = render(<NetworkHealthScore score={score} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(container.querySelectorAll(`.${color}`).length).toBeGreaterThan(0);
  });

  it.each([
    [100, 'Excellent'],
    [90, 'Excellent'],
    [89, 'Good'],
    [70, 'Good'],
    [69, 'Fair'],
    [50, 'Fair'],
    [49, 'Poor'],
    [0, 'Poor'],
  ] as const)('boundary score=%i resolves to "%s"', (score, label) => {
    render(<NetworkHealthScore score={score} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('renders the numeric score in the centre', () => {
    render(<NetworkHealthScore score={73} />);
    expect(screen.getByText('73')).toBeTruthy();
  });

  it('renders the "Network Experience" caption', () => {
    render(<NetworkHealthScore score={80} />);
    expect(screen.getByText('Network Experience')).toBeTruthy();
  });

  it('clicking fires onClick when provided', () => {
    const onClick = vi.fn();
    render(<NetworkHealthScore score={80} onClick={onClick} />);
    fireEvent.click(screen.getByText('80').closest('button')!);
    expect(onClick).toHaveBeenCalled();
  });

  it('renders SVG circles for the progress ring', () => {
    const { container } = render(<NetworkHealthScore score={80} />);
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(2);
  });
});
