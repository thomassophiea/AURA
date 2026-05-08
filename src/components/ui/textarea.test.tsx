import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Textarea } from './textarea';

describe('Textarea', () => {
  it('renders a <textarea> with data-slot="textarea"', () => {
    const { container } = render(<Textarea placeholder="Notes" />);
    const el = container.querySelector('[data-slot="textarea"]')!;
    expect(el.tagName.toLowerCase()).toBe('textarea');
    expect(el.getAttribute('placeholder')).toBe('Notes');
  });

  it('applies the default min-h-16 and rounded-md classes', () => {
    const { container } = render(<Textarea />);
    const el = container.querySelector('[data-slot="textarea"]')!;
    expect(el.className).toContain('min-h-16');
    expect(el.className).toContain('rounded-md');
  });

  it('forwards a custom className alongside defaults', () => {
    const { container } = render(<Textarea className="my-textarea" />);
    const el = container.querySelector('[data-slot="textarea"]')!;
    expect(el.className).toContain('my-textarea');
  });

  it('fires onChange and updates value', () => {
    const onChange = vi.fn();
    render(<Textarea onChange={onChange} aria-label="notes" />);
    const el = screen.getByLabelText('notes') as HTMLTextAreaElement;
    fireEvent.change(el, { target: { value: 'Hello world' } });
    expect(onChange).toHaveBeenCalled();
    expect(el.value).toBe('Hello world');
  });

  it('respects `disabled`', () => {
    const { container } = render(<Textarea disabled />);
    expect(
      (container.querySelector('[data-slot="textarea"]') as HTMLTextAreaElement).disabled
    ).toBe(true);
  });

  it('forwards rows / cols / aria-invalid', () => {
    const { container } = render(<Textarea rows={5} cols={40} aria-invalid />);
    const el = container.querySelector('[data-slot="textarea"]')!;
    expect(el.getAttribute('rows')).toBe('5');
    expect(el.getAttribute('cols')).toBe('40');
    expect(el.getAttribute('aria-invalid')).toBe('true');
  });
});
