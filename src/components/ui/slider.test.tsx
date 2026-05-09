import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { Slider } from './slider';

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

describe('Slider', () => {
  it('renders root with data-slot="slider"', () => {
    const { container } = render(<Slider defaultValue={[50]} />);
    expect(container.querySelector('[data-slot="slider"]')).toBeTruthy();
  });

  it('renders the track + range', () => {
    const { container } = render(<Slider defaultValue={[25]} />);
    expect(container.querySelector('[data-slot="slider-track"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="slider-range"]')).toBeTruthy();
  });

  it('renders one thumb per value (single)', () => {
    const { container } = render(<Slider defaultValue={[40]} />);
    const thumbs = container.querySelectorAll('[data-slot="slider-thumb"]');
    expect(thumbs.length).toBe(1);
  });

  it('renders two thumbs for a range value (controlled)', () => {
    const { container } = render(<Slider value={[20, 80]} />);
    const thumbs = container.querySelectorAll('[data-slot="slider-thumb"]');
    expect(thumbs.length).toBe(2);
  });

  it('forwards a custom className on the root', () => {
    const { container } = render(<Slider defaultValue={[10]} className="my-slider" />);
    expect(container.querySelector('[data-slot="slider"]')!.className).toContain('my-slider');
  });

  it('default min/max produces 2 thumbs when no value passed', () => {
    // No value, no defaultValue → _values defaults to [min, max] = [0, 100]
    const { container } = render(<Slider />);
    expect(container.querySelectorAll('[data-slot="slider-thumb"]').length).toBe(2);
  });
});
