import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button, buttonVariants } from './button';

describe('Button', () => {
  it('renders text content inside a <button>', () => {
    render(<Button>Submit</Button>);
    const btn = screen.getByText('Submit');
    expect(btn.tagName.toLowerCase()).toBe('button');
    expect(btn.getAttribute('data-slot')).toBe('button');
  });

  it('applies default variant + size classes', () => {
    const { container } = render(<Button>Default</Button>);
    const btn = container.querySelector('[data-slot="button"]')!;
    expect(btn.className).toContain('bg-primary');
    expect(btn.className).toContain('h-9');
  });

  it.each([
    ['destructive', 'bg-destructive'],
    ['outline', 'border-border'],
    ['secondary', 'bg-secondary'],
    ['ghost', 'hover:bg-accent'],
    ['link', 'underline-offset-4'],
  ] as const)('variant="%s"', (variant, expected) => {
    const { container } = render(<Button variant={variant}>Btn</Button>);
    expect(container.querySelector('[data-slot="button"]')!.className).toContain(expected);
  });

  it.each([
    ['sm', 'h-8'],
    ['lg', 'h-10'],
    ['icon', 'size-9'],
  ] as const)('size="%s"', (size, expected) => {
    const { container } = render(<Button size={size}>Btn</Button>);
    expect(container.querySelector('[data-slot="button"]')!.className).toContain(expected);
  });

  it('forwards arbitrary props (type/disabled/onClick)', () => {
    const onClick = vi.fn();
    render(
      <Button type="submit" disabled={false} onClick={onClick}>
        Press
      </Button>
    );
    const btn = screen.getByText('Press') as HTMLButtonElement;
    expect(btn.type).toBe('submit');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });

  it('respects disabled and does not invoke onClick', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Press
      </Button>
    );
    const btn = screen.getByText('Press') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders as a child element when asChild=true', () => {
    render(
      <Button asChild>
        <a href="/x" data-testid="btn-link">
          Go
        </a>
      </Button>
    );
    const link = screen.getByTestId('btn-link');
    expect(link.tagName.toLowerCase()).toBe('a');
    expect(link.getAttribute('data-slot')).toBe('button');
    expect(link.getAttribute('href')).toBe('/x');
  });

  it('merges a custom className with variant classes', () => {
    const { container } = render(<Button className="my-extra-class">X</Button>);
    const btn = container.querySelector('[data-slot="button"]')!;
    expect(btn.className).toContain('my-extra-class');
    expect(btn.className).toContain('bg-primary');
  });

  it('buttonVariants() exposes the cva builder', () => {
    expect(typeof buttonVariants).toBe('function');
    expect(buttonVariants({ variant: 'destructive' })).toContain('bg-destructive');
  });
});
