import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('renders a div with data-slot="skeleton"', () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
  });

  it('applies the default animate-pulse + rounded classes', () => {
    const { container } = render(<Skeleton />);
    const el = container.querySelector('[data-slot="skeleton"]')!;
    expect(el.className).toContain('animate-pulse');
    expect(el.className).toContain('rounded-md');
    expect(el.className).toContain('bg-muted-foreground/15');
  });

  it('merges custom className without losing defaults (twMerge resolves conflicts)', () => {
    const { container } = render(<Skeleton className="h-10 w-full" />);
    const el = container.querySelector('[data-slot="skeleton"]')!;
    expect(el.className).toContain('h-10');
    expect(el.className).toContain('w-full');
    expect(el.className).toContain('animate-pulse');
  });

  it('forwards arbitrary div props (id, role, data-*)', () => {
    const { container } = render(
      <Skeleton id="hero-skel" role="presentation" data-testid="loading" />
    );
    const el = container.querySelector('[data-slot="skeleton"]')!;
    expect(el.getAttribute('id')).toBe('hero-skel');
    expect(el.getAttribute('role')).toBe('presentation');
    expect(el.getAttribute('data-testid')).toBe('loading');
  });
});
