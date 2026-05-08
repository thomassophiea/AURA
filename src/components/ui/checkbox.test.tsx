import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Checkbox } from './checkbox';

describe('Checkbox', () => {
  it('renders the data-slot="checkbox" root', () => {
    const { container } = render(<Checkbox />);
    expect(container.querySelector('[data-slot="checkbox"]')).toBeTruthy();
  });

  it('starts unchecked by default', () => {
    const { container } = render(<Checkbox />);
    const cb = container.querySelector('[data-slot="checkbox"]')!;
    expect(cb.getAttribute('data-state')).toBe('unchecked');
    expect(cb.getAttribute('aria-checked')).toBe('false');
  });

  it('respects defaultChecked', () => {
    const { container } = render(<Checkbox defaultChecked />);
    const cb = container.querySelector('[data-slot="checkbox"]')!;
    expect(cb.getAttribute('data-state')).toBe('checked');
  });

  it('fires onCheckedChange when clicked', () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox onCheckedChange={onCheckedChange} aria-label="agree" />);
    const cb = screen.getByLabelText('agree');
    fireEvent.click(cb);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('disabled cannot be toggled', () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox disabled onCheckedChange={onCheckedChange} aria-label="agree" />);
    const cb = screen.getByLabelText('agree');
    fireEvent.click(cb);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('forwards a custom className alongside defaults', () => {
    const { container } = render(<Checkbox className="my-cb" />);
    const cb = container.querySelector('[data-slot="checkbox"]')!;
    expect(cb.className).toContain('my-cb');
    expect(cb.className).toContain('size-4');
  });
});
