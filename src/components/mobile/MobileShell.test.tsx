import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileShell } from './MobileShell';

describe('MobileShell', () => {
  it('renders children', () => {
    render(
      <MobileShell>
        <div data-testid="child">hi</div>
      </MobileShell>
    );
    expect(screen.getByTestId('child').textContent).toBe('hi');
  });

  it('produces a single root <div> with the bg-background backdrop', () => {
    const { container } = render(
      <MobileShell>
        <span>x</span>
      </MobileShell>
    );
    const root = container.firstChild as HTMLElement;
    expect(root.tagName.toLowerCase()).toBe('div');
    expect(root.className).toContain('bg-background');
  });

  it('uses min-h-screen + overflow-x-hidden', () => {
    const { container } = render(
      <MobileShell>
        <span>x</span>
      </MobileShell>
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('min-h-screen');
    expect(root.className).toContain('overflow-x-hidden');
  });
});
