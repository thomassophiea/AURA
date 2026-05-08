import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Label } from './label';

describe('Label', () => {
  it('renders with data-slot="label"', () => {
    const { container } = render(<Label>Username</Label>);
    const el = container.querySelector('[data-slot="label"]')!;
    expect(el.textContent).toBe('Username');
  });

  it('applies the default font + leading classes', () => {
    const { container } = render(<Label>x</Label>);
    const el = container.querySelector('[data-slot="label"]')!;
    expect(el.className).toContain('font-medium');
    expect(el.className).toContain('leading-none');
  });

  it('forwards `htmlFor` to the rendered <label>', () => {
    const { container } = render(<Label htmlFor="my-input">x</Label>);
    const el = container.querySelector('[data-slot="label"]')!;
    expect(el.getAttribute('for')).toBe('my-input');
  });

  it('forwards a custom className alongside defaults', () => {
    const { container } = render(<Label className="text-amber-300">x</Label>);
    const el = container.querySelector('[data-slot="label"]')!;
    expect(el.className).toContain('text-amber-300');
    expect(el.className).toContain('font-medium');
  });
});
