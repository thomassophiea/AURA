import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDragScroll } from './useDragScroll';

/**
 * jsdom has no layout engine, so scrollWidth/clientWidth are always 0 and
 * PointerEvent is unavailable. We stub the overflow dimensions and dispatch
 * MouseEvents carrying the pointer fields the hook reads.
 */

function setOverflow(el: HTMLElement, scrollWidth: number, clientWidth: number) {
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true });
}

interface PointerFields {
  clientX?: number;
  button?: number;
  pointerType?: string;
  pointerId?: number;
  target?: EventTarget;
}

function firePointer(el: HTMLElement, type: string, fields: PointerFields = {}) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true }) as MouseEvent & {
    pointerType: string;
    pointerId: number;
  };
  Object.defineProperties(ev, {
    clientX: { value: fields.clientX ?? 0, configurable: true },
    button: { value: fields.button ?? 0, configurable: true },
    pointerType: { value: fields.pointerType ?? 'mouse', configurable: true },
    pointerId: { value: fields.pointerId ?? 1, configurable: true },
  });
  if (fields.target) {
    Object.defineProperty(ev, 'target', { value: fields.target, configurable: true });
  }
  el.dispatchEvent(ev);
  return ev;
}

let el: HTMLDivElement;

beforeEach(() => {
  el = document.createElement('div');
  document.body.appendChild(el);
  // jsdom elements have no setPointerCapture; add no-ops so the hook's calls
  // (wrapped in try/catch anyway) don't need to fall through the catch.
  (el as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
  (el as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {};
});

afterEach(() => {
  el.remove();
});

describe('useDragScroll', () => {
  it('sets a grab cursor when the element overflows horizontally', () => {
    setOverflow(el, 1000, 400);
    renderHook(() => useDragScroll(() => el));
    expect(el.style.cursor).toBe('grab');
  });

  it('leaves the cursor default when there is no horizontal overflow', () => {
    setOverflow(el, 400, 400);
    renderHook(() => useDragScroll(() => el));
    expect(el.style.cursor).toBe('');
  });

  it('does not scroll for movement below the 6px threshold', () => {
    setOverflow(el, 1000, 400);
    el.scrollLeft = 0;
    renderHook(() => useDragScroll(() => el));

    firePointer(el, 'pointerdown', { clientX: 100 });
    firePointer(el, 'pointermove', { clientX: 103 }); // 3px < threshold
    expect(el.scrollLeft).toBe(0);
    expect(el.style.cursor).toBe('grab'); // not yet grabbing
  });

  it('scrolls once movement exceeds the threshold and shows a grabbing cursor', () => {
    setOverflow(el, 1000, 400);
    el.scrollLeft = 0;
    renderHook(() => useDragScroll(() => el));

    firePointer(el, 'pointerdown', { clientX: 100 });
    firePointer(el, 'pointermove', { clientX: 80 }); // moved left 20px -> scroll right 20
    expect(el.scrollLeft).toBe(20);
    expect(el.style.cursor).toBe('grabbing');

    firePointer(el, 'pointerup', { clientX: 80 });
    expect(el.style.cursor).toBe('grab'); // restored
  });

  it('does not start a drag when there is no overflow', () => {
    setOverflow(el, 400, 400);
    el.scrollLeft = 0;
    renderHook(() => useDragScroll(() => el));

    firePointer(el, 'pointerdown', { clientX: 100 });
    firePointer(el, 'pointermove', { clientX: 40 });
    expect(el.scrollLeft).toBe(0);
  });

  it('ignores non-mouse pointers (native touch scroll untouched)', () => {
    setOverflow(el, 1000, 400);
    el.scrollLeft = 0;
    renderHook(() => useDragScroll(() => el));

    firePointer(el, 'pointerdown', { clientX: 100, pointerType: 'touch' });
    firePointer(el, 'pointermove', { clientX: 40, pointerType: 'touch' });
    expect(el.scrollLeft).toBe(0);
  });

  it('does not start a drag when the pointerdown target is an interactive control', () => {
    setOverflow(el, 1000, 400);
    el.scrollLeft = 0;
    const btn = document.createElement('button');
    el.appendChild(btn);
    renderHook(() => useDragScroll(() => el));

    firePointer(el, 'pointerdown', { clientX: 100, target: btn });
    firePointer(el, 'pointermove', { clientX: 40, target: btn });
    expect(el.scrollLeft).toBe(0);
  });

  it('ignores non-primary buttons', () => {
    setOverflow(el, 1000, 400);
    el.scrollLeft = 0;
    renderHook(() => useDragScroll(() => el));

    firePointer(el, 'pointerdown', { clientX: 100, button: 2 }); // right-click
    firePointer(el, 'pointermove', { clientX: 40 });
    expect(el.scrollLeft).toBe(0);
  });

  it('suppresses the trailing click after a drag', () => {
    setOverflow(el, 1000, 400);
    el.scrollLeft = 0;
    renderHook(() => useDragScroll(() => el));

    firePointer(el, 'pointerdown', { clientX: 100 });
    firePointer(el, 'pointermove', { clientX: 60 });
    firePointer(el, 'pointerup', { clientX: 60 });

    const click = firePointer(el, 'click', { clientX: 60 });
    expect(click.defaultPrevented).toBe(true);
  });

  it('does not suppress a plain click (no drag)', () => {
    setOverflow(el, 1000, 400);
    renderHook(() => useDragScroll(() => el));

    firePointer(el, 'pointerdown', { clientX: 100 });
    firePointer(el, 'pointerup', { clientX: 100 });

    const click = firePointer(el, 'click', { clientX: 100 });
    expect(click.defaultPrevented).toBe(false);
  });

  it('does not suppress clicks when suppressClickAfterDrag is false', () => {
    setOverflow(el, 1000, 400);
    renderHook(() => useDragScroll(() => el, { suppressClickAfterDrag: false }));

    firePointer(el, 'pointerdown', { clientX: 100 });
    firePointer(el, 'pointermove', { clientX: 60 });
    firePointer(el, 'pointerup', { clientX: 60 });

    const click = firePointer(el, 'click', { clientX: 60 });
    expect(click.defaultPrevented).toBe(false);
  });

  it('wires up nothing when disabled', () => {
    setOverflow(el, 1000, 400);
    renderHook(() => useDragScroll(() => el, { enabled: false }));
    expect(el.style.cursor).toBe('');
  });
});
