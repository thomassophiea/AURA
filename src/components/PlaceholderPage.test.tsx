import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Activity } from 'lucide-react';
import { PlaceholderPage } from './PlaceholderPage';

describe('PlaceholderPage', () => {
  it('renders title and description', () => {
    render(<PlaceholderPage title="Reports" description="Coming later" />);
    expect(screen.getByText('Reports')).toBeTruthy();
    expect(screen.getByText('Coming later')).toBeTruthy();
  });

  it('shows the Coming Soon badge', () => {
    render(<PlaceholderPage title="X" description="d" />);
    expect(screen.getByText('Coming Soon')).toBeTruthy();
  });

  it('renders icon when provided', () => {
    const { container } = render(<PlaceholderPage title="X" description="d" icon={Activity} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('omits the planned-capabilities card when features list is empty', () => {
    render(<PlaceholderPage title="X" description="d" />);
    expect(screen.queryByText('Planned capabilities')).toBeNull();
  });

  it('renders the planned-capabilities card with each feature', () => {
    render(<PlaceholderPage title="X" description="d" features={['Alpha', 'Beta', 'Gamma']} />);
    expect(screen.getByText('Planned capabilities')).toBeTruthy();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.getByText('Gamma')).toBeTruthy();
  });

  it('renders the cards mockup by default', () => {
    const { container } = render(<PlaceholderPage title="X" description="d" />);
    // The wrapper div has opacity-40 + pointer-events-none + aria-hidden
    expect(container.querySelector('[aria-hidden]')).toBeTruthy();
  });

  it.each(['table', 'charts', 'cards', 'form'] as const)(
    'mockupType="%s" renders some mockup content',
    (mockupType) => {
      const { container } = render(
        <PlaceholderPage title="X" description="d" mockupType={mockupType} />
      );
      expect(container.querySelector('[aria-hidden]')?.children.length).toBeGreaterThan(0);
    }
  );
});
