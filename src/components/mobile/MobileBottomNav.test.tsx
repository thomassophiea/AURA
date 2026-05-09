import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileBottomNav } from './MobileBottomNav';

describe('MobileBottomNav', () => {
  it('renders all 5 tabs with their labels', () => {
    render(<MobileBottomNav activeTab="home" onTabChange={vi.fn()} />);
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('SLEs')).toBeTruthy();
    expect(screen.getByText('Networks')).toBeTruthy();
    expect(screen.getByText('Clients')).toBeTruthy();
    expect(screen.getByText('APs')).toBeTruthy();
  });

  it('clicking a tab calls onTabChange with its id', () => {
    const onTabChange = vi.fn();
    render(<MobileBottomNav activeTab="home" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByLabelText('Clients'));
    expect(onTabChange).toHaveBeenCalledWith('clients');
  });

  it.each(['home', 'sle', 'networks', 'clients', 'aps'] as const)(
    'activeTab="%s" marks the matching tab with aria-current="page"',
    (active) => {
      render(<MobileBottomNav activeTab={active} onTabChange={vi.fn()} />);
      const labelMap: Record<string, string> = {
        home: 'Home',
        sle: 'SLEs',
        networks: 'Networks',
        clients: 'Clients',
        aps: 'APs',
      };
      const btn = screen.getByLabelText(labelMap[active]);
      expect(btn.getAttribute('aria-current')).toBe('page');
    }
  );

  it('inactive tabs have no aria-current', () => {
    render(<MobileBottomNav activeTab="home" onTabChange={vi.fn()} />);
    expect(screen.getByLabelText('Clients').getAttribute('aria-current')).toBeNull();
  });

  it('renders the badge for tabs with non-zero counts', () => {
    render(
      <MobileBottomNav activeTab="home" onTabChange={vi.fn()} badges={{ clients: 7, aps: 3 }} />
    );
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('caps badge counts at 99+', () => {
    render(<MobileBottomNav activeTab="home" onTabChange={vi.fn()} badges={{ clients: 150 }} />);
    expect(screen.getByText('99+')).toBeTruthy();
  });

  it('hides badge when count is 0', () => {
    render(<MobileBottomNav activeTab="home" onTabChange={vi.fn()} badges={{ clients: 0 }} />);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('renders without badges prop', () => {
    render(<MobileBottomNav activeTab="home" onTabChange={vi.fn()} />);
    expect(screen.getByText('Clients')).toBeTruthy();
  });
});
