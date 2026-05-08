import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './tooltip';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  // Radix tooltip uses ResizeObserver — stub for jsdom.
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

describe('Tooltip primitives', () => {
  it('TooltipProvider renders children', () => {
    const { container } = render(
      <TooltipProvider>
        <div data-testid="child">x</div>
      </TooltipProvider>
    );
    expect(container.querySelector('[data-testid="child"]')).toBeTruthy();
  });

  it('Tooltip + TooltipTrigger render the trigger child', () => {
    const { container } = render(
      <Tooltip>
        <TooltipTrigger>Hover me</TooltipTrigger>
        <TooltipContent>Hello</TooltipContent>
      </Tooltip>
    );
    expect(container.querySelector('[data-slot="tooltip-trigger"]')).toBeTruthy();
  });

  it('TooltipTrigger renders the children text', () => {
    const { container } = render(
      <Tooltip>
        <TooltipTrigger>Hover me</TooltipTrigger>
        <TooltipContent>Hi</TooltipContent>
      </Tooltip>
    );
    const trigger = container.querySelector('[data-slot="tooltip-trigger"]');
    expect(trigger?.textContent).toBe('Hover me');
  });

  it('TooltipContent has the bg-popover class hook (when open)', () => {
    const { baseElement } = render(
      <Tooltip open>
        <TooltipTrigger>x</TooltipTrigger>
        <TooltipContent className="my-tip">tip body</TooltipContent>
      </Tooltip>
    );
    const content = baseElement.querySelector('[data-slot="tooltip-content"]');
    expect(content).toBeTruthy();
    expect(content?.className).toContain('my-tip');
    expect(content?.className).toContain('bg-popover');
  });

  it('TooltipContent does not render when tooltip is closed', () => {
    const { baseElement } = render(
      <Tooltip open={false}>
        <TooltipTrigger>x</TooltipTrigger>
        <TooltipContent>tip</TooltipContent>
      </Tooltip>
    );
    expect(baseElement.querySelector('[data-slot="tooltip-content"]')).toBeNull();
  });
});
