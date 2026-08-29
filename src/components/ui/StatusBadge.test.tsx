import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge, StatusDot } from './StatusBadge';

describe('StatusBadge', () => {
  it('normalizes machine-speak into a display label', () => {
    render(<StatusBadge status="InService" />);
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('keeps presentable labels verbatim', () => {
    render(<StatusBadge status="Connected" />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('renders Unknown for dash/empty values', () => {
    render(<StatusBadge status="-" />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('accepts a label override', () => {
    render(<StatusBadge status="up" label="Broadcasting" />);
    expect(screen.getByText('Broadcasting')).toBeInTheDocument();
  });

  it('routes color through --status-* vars (never raw palette classes)', () => {
    const { container } = render(<StatusBadge status="offline" />);
    const badge = container.querySelector('[data-slot="badge"]') as HTMLElement;
    expect(badge.className).toContain('--status-offline');
    expect(badge.className).not.toMatch(/(red|green|amber|emerald)-\d/);
  });
});

describe('StatusDot', () => {
  it('is aria-hidden without a label and sized by prop', () => {
    const { container } = render(<StatusDot status="online" size={10} />);
    const dot = container.firstElementChild as HTMLElement;
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    expect(dot.style.width).toBe('10px');
    expect(dot.className).toContain('--status-success');
  });
});
