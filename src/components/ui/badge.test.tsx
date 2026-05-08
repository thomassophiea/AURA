import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, badgeVariants } from './badge';

describe('Badge', () => {
  it('renders text content inside a span with data-slot="badge"', () => {
    const { container } = render(<Badge>Active</Badge>);
    const el = container.querySelector('[data-slot="badge"]');
    expect(el?.textContent).toBe('Active');
    expect(el?.tagName.toLowerCase()).toBe('span');
  });

  it('applies the default variant styles when no variant prop is passed', () => {
    const { container } = render(<Badge>Default</Badge>);
    const el = container.querySelector('[data-slot="badge"]')!;
    expect(el.className).toContain('bg-primary');
  });

  it.each([
    ['secondary', 'bg-muted'],
    ['destructive', 'bg-destructive'],
    ['outline', 'border-border'],
    ['success', 'status-success'],
    ['warning', 'status-warning'],
    ['info', 'status-info'],
  ] as const)('variant="%s" applies its variant class', (variant, expected) => {
    const { container } = render(<Badge variant={variant}>X</Badge>);
    const el = container.querySelector('[data-slot="badge"]')!;
    expect(el.className).toContain(expected);
  });

  it('forwards a custom className alongside variant classes', () => {
    const { container } = render(<Badge className="extra-test-class">A</Badge>);
    const el = container.querySelector('[data-slot="badge"]')!;
    expect(el.className).toContain('extra-test-class');
    expect(el.className).toContain('bg-primary');
  });

  it('renders as a child element when asChild=true', () => {
    render(
      <Badge asChild>
        <a href="/things" data-testid="badge-link">
          Link
        </a>
      </Badge>
    );
    const link = screen.getByTestId('badge-link');
    expect(link.tagName.toLowerCase()).toBe('a');
    expect(link.getAttribute('data-slot')).toBe('badge');
  });

  it('badgeVariants() exposes the cva builder for direct use', () => {
    const cls = badgeVariants({ variant: 'success' });
    expect(typeof cls).toBe('string');
    expect(cls).toContain('status-success');
  });
});
