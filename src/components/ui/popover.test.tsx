import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { Popover, PopoverTrigger, PopoverContent } from './popover';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
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

describe('Popover primitives', () => {
  it('renders trigger with data-slot="popover-trigger"', () => {
    const { container } = render(
      <Popover>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>body</PopoverContent>
      </Popover>
    );
    const trigger = container.querySelector('[data-slot="popover-trigger"]');
    expect(trigger?.textContent).toBe('Open');
  });

  it('content not rendered when closed', () => {
    const { baseElement } = render(
      <Popover open={false}>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>secret</PopoverContent>
      </Popover>
    );
    expect(baseElement.querySelector('[data-slot="popover-content"]')).toBeNull();
  });

  it('content renders into a portal when open', () => {
    const { baseElement } = render(
      <Popover open>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>visible body</PopoverContent>
      </Popover>
    );
    const content = baseElement.querySelector('[data-slot="popover-content"]');
    expect(content).toBeTruthy();
    expect(content?.textContent).toBe('visible body');
  });

  it('forwards a custom className onto popover-content', () => {
    const { baseElement } = render(
      <Popover open>
        <PopoverTrigger>x</PopoverTrigger>
        <PopoverContent className="my-pop">x</PopoverContent>
      </Popover>
    );
    const content = baseElement.querySelector('[data-slot="popover-content"]');
    expect(content?.className).toContain('my-pop');
    // Default classes still present
    expect(content?.className).toContain('bg-popover');
  });

  it('default align="center" surfaces as data-align attribute', () => {
    const { baseElement } = render(
      <Popover open>
        <PopoverTrigger>x</PopoverTrigger>
        <PopoverContent>x</PopoverContent>
      </Popover>
    );
    const content = baseElement.querySelector('[data-slot="popover-content"]');
    expect(content?.getAttribute('data-align')).toBe('center');
  });

  it('align="end" forwards through to data-align', () => {
    const { baseElement } = render(
      <Popover open>
        <PopoverTrigger>x</PopoverTrigger>
        <PopoverContent align="end">x</PopoverContent>
      </Popover>
    );
    const content = baseElement.querySelector('[data-slot="popover-content"]');
    expect(content?.getAttribute('data-align')).toBe('end');
  });
});
