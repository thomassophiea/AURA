import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(globalThis as any).ResizeObserver) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

describe('Select primitives', () => {
  it('renders trigger with data-slot="select-trigger"', () => {
    const { container } = render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
      </Select>
    );
    expect(container.querySelector('[data-slot="select-trigger"]')).toBeTruthy();
  });

  it('SelectValue placeholder shows when no value', () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
      </Select>
    );
    expect(screen.getByText('Pick one')).toBeTruthy();
  });

  it('renders selected value when defaultValue is set', () => {
    render(
      <Select defaultValue="a">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Apple</SelectItem>
          <SelectItem value="b">Banana</SelectItem>
        </SelectContent>
      </Select>
    );
    expect(screen.getByText('Apple')).toBeTruthy();
  });

  it('size="sm" surfaces as data-size attribute', () => {
    const { container } = render(
      <Select>
        <SelectTrigger size="sm">
          <SelectValue placeholder="x" />
        </SelectTrigger>
      </Select>
    );
    expect(container.querySelector('[data-slot="select-trigger"]')!.getAttribute('data-size')).toBe(
      'sm'
    );
  });

  it('default size surfaces as data-size="default"', () => {
    const { container } = render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="x" />
        </SelectTrigger>
      </Select>
    );
    expect(container.querySelector('[data-slot="select-trigger"]')!.getAttribute('data-size')).toBe(
      'default'
    );
  });

  it('controlled open=true renders SelectContent + items + label + separator', () => {
    const { baseElement } = render(
      <Select open defaultValue="a">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Fruit</SelectLabel>
            <SelectItem value="a">Apple</SelectItem>
            <SelectSeparator />
            <SelectItem value="b">Banana</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    );
    expect(baseElement.querySelector('[data-slot="select-content"]')).toBeTruthy();
    expect(baseElement.querySelector('[data-slot="select-label"]')!.textContent).toBe('Fruit');
    expect(baseElement.querySelector('[data-slot="select-separator"]')).toBeTruthy();
  });

  it('controlled open=false suppresses SelectContent', () => {
    const { baseElement } = render(
      <Select open={false}>
        <SelectTrigger>
          <SelectValue placeholder="x" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Apple</SelectItem>
        </SelectContent>
      </Select>
    );
    expect(baseElement.querySelector('[data-slot="select-content"]')).toBeNull();
  });

  it('disabled trigger is non-interactive', () => {
    const onValueChange = vi.fn();
    render(
      <Select disabled onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="x" />
        </SelectTrigger>
      </Select>
    );
    const trigger = screen.getByRole('combobox');
    expect(trigger.getAttribute('data-disabled')).not.toBeNull();
  });
});
