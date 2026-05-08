import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from './input';

describe('Input', () => {
  it('renders an <input> with data-slot="input"', () => {
    const { container } = render(<Input placeholder="Search" />);
    const el = container.querySelector('[data-slot="input"]')!;
    expect(el.tagName.toLowerCase()).toBe('input');
    expect(el.getAttribute('placeholder')).toBe('Search');
  });

  it('forwards `type` attribute (default is undefined → text)', () => {
    const { container } = render(<Input type="email" />);
    expect(container.querySelector('[data-slot="input"]')!.getAttribute('type')).toBe('email');
  });

  it('forwards a custom className alongside defaults', () => {
    const { container } = render(<Input className="border-pink-500" />);
    const el = container.querySelector('[data-slot="input"]')!;
    expect(el.className).toContain('border-pink-500');
    expect(el.className).toContain('h-9');
  });

  it('fires onChange when the user types', () => {
    const onChange = vi.fn();
    render(<Input onChange={onChange} aria-label="q" />);
    const el = screen.getByLabelText('q') as HTMLInputElement;
    fireEvent.change(el, { target: { value: 'hello' } });
    expect(onChange).toHaveBeenCalled();
    expect(el.value).toBe('hello');
  });

  it('respects `disabled` and forwards it to the DOM', () => {
    const { container } = render(<Input disabled />);
    expect((container.querySelector('[data-slot="input"]') as HTMLInputElement).disabled).toBe(
      true
    );
  });

  it('forwards aria-invalid for the error styling hook', () => {
    const { container } = render(<Input aria-invalid={true} />);
    expect(container.querySelector('[data-slot="input"]')!.getAttribute('aria-invalid')).toBe(
      'true'
    );
  });
});
