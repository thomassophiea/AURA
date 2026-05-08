import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Separator } from './separator';

describe('Separator', () => {
  it('renders with data-slot="separator-root"', () => {
    const { container } = render(<Separator />);
    expect(container.querySelector('[data-slot="separator-root"]')).toBeTruthy();
  });

  it('defaults to horizontal orientation', () => {
    const { container } = render(<Separator />);
    const el = container.querySelector('[data-slot="separator-root"]')!;
    expect(el.getAttribute('data-orientation')).toBe('horizontal');
  });

  it('vertical orientation forwards data-orientation="vertical"', () => {
    const { container } = render(<Separator orientation="vertical" />);
    const el = container.querySelector('[data-slot="separator-root"]')!;
    expect(el.getAttribute('data-orientation')).toBe('vertical');
  });

  it('decorative=true (default) hides separator from a11y tree', () => {
    const { container } = render(<Separator />);
    const el = container.querySelector('[data-slot="separator-root"]')!;
    // Radix sets role="none" when decorative
    expect(el.getAttribute('role')).toBe('none');
  });

  it('decorative=false sets role="separator"', () => {
    const { container } = render(<Separator decorative={false} />);
    const el = container.querySelector('[data-slot="separator-root"]')!;
    expect(el.getAttribute('role')).toBe('separator');
  });

  it('forwards a custom className alongside the bg-border default', () => {
    const { container } = render(<Separator className="my-sep" />);
    const el = container.querySelector('[data-slot="separator-root"]')!;
    expect(el.className).toContain('my-sep');
    expect(el.className).toContain('bg-border');
  });
});
