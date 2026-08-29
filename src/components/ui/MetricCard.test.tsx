import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Wifi } from 'lucide-react';
import { MetricCard } from './MetricCard';

describe('MetricCard', () => {
  it('renders title, value and subtitle', () => {
    render(<MetricCard title="Access points online" value="23" subtitle="of 24 total" />);
    expect(screen.getByText('Access points online')).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument();
    expect(screen.getByText('of 24 total')).toBeInTheDocument();
  });

  it('uses semibold 2xl tabular value typography (no font-bold)', () => {
    render(<MetricCard title="Clients" value="5,000" />);
    const value = screen.getByText('5,000');
    expect(value.className).toContain('font-semibold');
    expect(value.className).toContain('tabular-nums');
    expect(value.className).not.toContain('font-bold');
  });

  it('keeps the value neutral unless toneValue is set', () => {
    const { rerender } = render(<MetricCard title="Offline" value="2" tone="critical" />);
    expect(screen.getByText('2').className).toContain('text-foreground');
    rerender(<MetricCard title="Offline" value="2" tone="critical" toneValue />);
    expect(screen.getByText('2').className).toContain('--status-error');
  });

  it('shows a skeleton while loading', () => {
    const { container } = render(<MetricCard title="Clients" value="39" loading />);
    expect(screen.queryByText('39')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it('renders trend with sentiment color, not direction color', () => {
    render(
      <MetricCard
        title="Retries"
        value="12%"
        trend={{ label: '+3.1%', direction: 'up', sentiment: 'negative' }}
      />
    );
    const trend = screen.getByText('+3.1%');
    expect(trend.className).toContain('--status-error');
  });

  it('becomes an accessible button when onClick is provided', () => {
    const onClick = vi.fn();
    render(<MetricCard title="Alarms" value="4" onClick={onClick} icon={Wifi} />);
    const card = screen.getByRole('button');
    card.click();
    expect(onClick).toHaveBeenCalled();
  });
});
