import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RadioGroup, RadioGroupItem } from './radio-group';

describe('RadioGroup primitives', () => {
  it('root has data-slot="radio-group"', () => {
    const { container } = render(
      <RadioGroup>
        <RadioGroupItem value="a" aria-label="A" />
        <RadioGroupItem value="b" aria-label="B" />
      </RadioGroup>
    );
    expect(container.querySelector('[data-slot="radio-group"]')).toBeTruthy();
  });

  it('items have data-slot="radio-group-item"', () => {
    const { container } = render(
      <RadioGroup>
        <RadioGroupItem value="a" aria-label="A" />
      </RadioGroup>
    );
    expect(container.querySelector('[data-slot="radio-group-item"]')).toBeTruthy();
  });

  it('defaultValue marks the matching item as checked', () => {
    render(
      <RadioGroup defaultValue="b">
        <RadioGroupItem value="a" aria-label="A" />
        <RadioGroupItem value="b" aria-label="B" />
      </RadioGroup>
    );
    const a = screen.getByLabelText('A');
    const b = screen.getByLabelText('B');
    expect(a.getAttribute('data-state')).toBe('unchecked');
    expect(b.getAttribute('data-state')).toBe('checked');
  });

  it('clicking an item fires onValueChange with its value', () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup onValueChange={onValueChange}>
        <RadioGroupItem value="a" aria-label="A" />
        <RadioGroupItem value="b" aria-label="B" />
      </RadioGroup>
    );
    fireEvent.click(screen.getByLabelText('B'));
    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('disabled item blocks clicks', () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup onValueChange={onValueChange}>
        <RadioGroupItem value="a" aria-label="A" disabled />
      </RadioGroup>
    );
    fireEvent.click(screen.getByLabelText('A'));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('forwards a custom className on the root', () => {
    const { container } = render(
      <RadioGroup className="my-rg">
        <RadioGroupItem value="a" aria-label="A" />
      </RadioGroup>
    );
    expect(container.querySelector('[data-slot="radio-group"]')!.className).toContain('my-rg');
  });
});
