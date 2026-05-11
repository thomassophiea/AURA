import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from './dropdown-menu';

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
});

describe('DropdownMenu primitives', () => {
  it('renders the trigger with data-slot="dropdown-menu-trigger"', () => {
    const { container } = render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>A</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    expect(container.querySelector('[data-slot="dropdown-menu-trigger"]')?.textContent).toBe(
      'Open'
    );
  });

  it('content is portaled with data-slot when open=true (controlled)', () => {
    const { baseElement } = render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>A</DropdownMenuItem>
          <DropdownMenuItem>B</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    expect(baseElement.querySelector('[data-slot="dropdown-menu-content"]')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
  });

  it('content is not portaled when open=false', () => {
    const { baseElement } = render(
      <DropdownMenu open={false}>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>secret</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    expect(baseElement.querySelector('[data-slot="dropdown-menu-content"]')).toBeNull();
  });

  it('items have data-slot + data-variant + data-inset attributes', () => {
    const { baseElement } = render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem variant="default">A</DropdownMenuItem>
          <DropdownMenuItem variant="destructive">B</DropdownMenuItem>
          <DropdownMenuItem inset>C</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    const items = baseElement.querySelectorAll('[data-slot="dropdown-menu-item"]');
    expect(items.length).toBe(3);
    expect(items[0].getAttribute('data-variant')).toBe('default');
    expect(items[1].getAttribute('data-variant')).toBe('destructive');
    expect(items[2].getAttribute('data-inset')).toBe('true');
  });

  it('label/separator render with their data-slots', () => {
    const { baseElement } = render(
      <DropdownMenu open>
        <DropdownMenuTrigger>x</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Profile</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    expect(baseElement.querySelector('[data-slot="dropdown-menu-label"]')).toBeTruthy();
    expect(baseElement.querySelector('[data-slot="dropdown-menu-separator"]')).toBeTruthy();
  });

  it('Shortcut renders text with the muted-foreground style', () => {
    const { container } = render(<DropdownMenuShortcut>⌘K</DropdownMenuShortcut>);
    const el = container.querySelector('[data-slot="dropdown-menu-shortcut"]')!;
    expect(el.textContent).toBe('⌘K');
    expect(el.className).toContain('text-muted-foreground');
  });

  it('forwards a custom className on DropdownMenuItem', () => {
    const { baseElement } = render(
      <DropdownMenu open>
        <DropdownMenuTrigger>x</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem className="my-item">A</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    expect(baseElement.querySelector('[data-slot="dropdown-menu-item"]')!.className).toContain(
      'my-item'
    );
  });
});
