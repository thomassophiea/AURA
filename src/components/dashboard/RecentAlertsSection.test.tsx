import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecentAlertsSection } from './RecentAlertsSection';

const notif = (
  id: string | number,
  message: string,
  severity?: string,
  timestamp = Date.now()
) => ({ id, message, severity, timestamp });

describe('RecentAlertsSection', () => {
  it('renders the title and View All button', () => {
    render(<RecentAlertsSection notifications={[notif(1, 'A')]} />);
    expect(screen.getByText('Recent Alerts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View All/i })).toBeInTheDocument();
  });

  it('caps the displayed list at 5 entries', () => {
    const items = Array.from({ length: 8 }, (_, i) => notif(i, `Alert ${i}`));
    render(<RecentAlertsSection notifications={items} />);
    for (let i = 0; i < 5; i++) {
      expect(screen.getByText(`Alert ${i}`)).toBeInTheDocument();
    }
    expect(screen.queryByText('Alert 6')).not.toBeInTheDocument();
    expect(screen.queryByText('Alert 7')).not.toBeInTheDocument();
  });

  it('tones critical alerts with the error background', () => {
    const { container } = render(
      <RecentAlertsSection notifications={[notif(1, 'crit', 'critical')]} />
    );
    expect(
      container.querySelector('[class*="status-error"], [class*="status-error-bg"]')
    ).not.toBeNull();
  });

  it('tones warnings with the warning background', () => {
    const { container } = render(
      <RecentAlertsSection notifications={[notif(1, 'warn', 'warning')]} />
    );
    expect(
      container.querySelector('[class*="status-warning"], [class*="status-warning-bg"]')
    ).not.toBeNull();
  });

  it('falls through to plain border for non-critical / non-warning severities', () => {
    const { container } = render(
      <RecentAlertsSection notifications={[notif(1, 'info', 'info')]} />
    );
    expect(container.querySelector('.border-border')).not.toBeNull();
  });

  it('treats "level" as a fallback when severity is missing', () => {
    // The severity check inspects (severity || level).toLowerCase()
    const items = [{ id: 1, message: 'x', level: 'CRITICAL', timestamp: Date.now() }];
    const { container } = render(<RecentAlertsSection notifications={items} />);
    expect(
      container.querySelector('[class*="status-error"], [class*="status-error-bg"]')
    ).not.toBeNull();
  });

  it('fires onViewAll when View All is clicked', () => {
    const onViewAll = vi.fn();
    render(<RecentAlertsSection notifications={[notif(1, 'A')]} onViewAll={onViewAll} />);
    fireEvent.click(screen.getByRole('button', { name: /View All/i }));
    expect(onViewAll).toHaveBeenCalledTimes(1);
  });
});
