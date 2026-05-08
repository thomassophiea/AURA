import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Alert, AlertTitle, AlertDescription } from './alert';

describe('Alert', () => {
  it('renders with role="alert" and data-slot="alert"', () => {
    const { container } = render(<Alert>Body</Alert>);
    const el = container.querySelector('[data-slot="alert"]')!;
    expect(el.getAttribute('role')).toBe('alert');
  });

  it('default variant uses bg-card', () => {
    const { container } = render(<Alert>x</Alert>);
    expect(container.querySelector('[data-slot="alert"]')!.className).toContain('bg-card');
  });

  it.each([
    ['destructive', 'text-destructive'],
    ['warning', 'status-warning'],
    ['success', 'status-success'],
    ['info', 'status-info'],
  ] as const)('variant="%s"', (variant, expectedClass) => {
    const { container } = render(<Alert variant={variant}>x</Alert>);
    expect(container.querySelector('[data-slot="alert"]')!.className).toContain(expectedClass);
  });

  it('forwards a custom className alongside the variant', () => {
    const { container } = render(<Alert className="my-alert">x</Alert>);
    expect(container.querySelector('[data-slot="alert"]')!.className).toContain('my-alert');
  });

  it('AlertTitle has data-slot="alert-title" and the title classes', () => {
    const { container } = render(<AlertTitle>Title</AlertTitle>);
    const el = container.querySelector('[data-slot="alert-title"]')!;
    expect(el.className).toContain('font-medium');
    expect(el.textContent).toBe('Title');
  });

  it('AlertDescription has data-slot="alert-description"', () => {
    const { container } = render(<AlertDescription>Body</AlertDescription>);
    const el = container.querySelector('[data-slot="alert-description"]')!;
    expect(el.className).toContain('text-muted-foreground');
    expect(el.textContent).toBe('Body');
  });

  it('Alert composes Title + Description as children', () => {
    const { container } = render(
      <Alert>
        <AlertTitle>T</AlertTitle>
        <AlertDescription>D</AlertDescription>
      </Alert>
    );
    expect(container.querySelector('[data-slot="alert-title"]')!.textContent).toBe('T');
    expect(container.querySelector('[data-slot="alert-description"]')!.textContent).toBe('D');
  });
});
