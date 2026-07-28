/**
 * useDragScroll
 *
 * Enables "grab and pull" horizontal drag-to-scroll on a horizontally
 * overflowing element using Pointer Events. Mouse only — touch devices
 * already scroll natively, so we never interfere with native touch scroll.
 *
 * Design notes:
 * - The element is resolved lazily via a getter so it works for DOM that
 *   appears asynchronously (e.g. AG Grid's viewport, queried after ready).
 * - A drag only begins once the pointer moves past a small threshold, so a
 *   plain click never turns into a scroll and row-click / checkbox behavior
 *   is preserved.
 * - Interactive targets (buttons, links, inputs, checkboxes, sort headers,
 *   menus) are excluded so they stay fully clickable.
 * - When a drag does occur, a capture-phase click listener swallows the
 *   trailing click so the underlying row-click (which opens Details) does not
 *   fire at the end of a drag.
 */

import { useEffect, useRef } from 'react';

type ElementGetter = () => HTMLElement | null | undefined;

export interface UseDragScrollOptions {
  /** Master switch. When false the hook wires up nothing. Default true. */
  enabled?: boolean;
  /**
   * Swallow the click that fires at the end of a drag so the underlying
   * row-click / navigation does not trigger. Default true.
   */
  suppressClickAfterDrag?: boolean;
}

/** Movement (px) the pointer must travel before a click becomes a drag. */
const DRAG_THRESHOLD = 6;

/**
 * Selector for interactive descendants that must keep their own click/press
 * behavior — a pointerdown starting inside one of these never starts a drag.
 */
const INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, label, [role="checkbox"], [role="button"], .ag-selection-checkbox, [data-no-dragscroll]';

/**
 * Attach drag-to-scroll to a horizontally scrollable element.
 *
 * @param getEl   Getter returning the scroll container (may return null until mounted).
 * @param opts    See {@link UseDragScrollOptions}.
 */
export function useDragScroll(getEl: ElementGetter, opts: UseDragScrollOptions = {}): void {
  const { enabled = true, suppressClickAfterDrag = true } = opts;

  // Keep the latest getter without re-subscribing every render.
  const getElRef = useRef<ElementGetter>(getEl);
  getElRef.current = getEl;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let el: HTMLElement | null = null;
    let pointerId: number | null = null;
    let startX = 0;
    let startScrollLeft = 0;
    let dragging = false;
    let dragged = false;
    // Timer that clears the `dragged` flag shortly after pointerup so the
    // capture-phase click handler only swallows the click from *this* drag.
    let clearDraggedTimer: ReturnType<typeof setTimeout> | null = null;

    let prevCursor = '';
    let prevUserSelect = '';

    const overflows = () => !!el && el.scrollWidth > el.clientWidth;

    /** Reflect whether the element can be grabbed via the cursor. */
    const updateGrabCursor = () => {
      if (!el) return;
      el.style.cursor = overflows() ? 'grab' : '';
    };

    const applyDraggingStyles = () => {
      if (!el) return;
      prevCursor = el.style.cursor;
      prevUserSelect = el.style.userSelect;
      el.style.cursor = 'grabbing';
      el.style.userSelect = 'none';
    };

    const restoreStyles = () => {
      if (!el) return;
      el.style.userSelect = prevUserSelect;
      el.style.cursor = prevCursor;
      updateGrabCursor();
    };

    const endDrag = () => {
      if (pointerId !== null && el) {
        try {
          el.releasePointerCapture(pointerId);
        } catch {
          /* pointer may already be released */
        }
      }
      if (dragging) restoreStyles();
      dragging = false;
      pointerId = null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!el) return;
      // Mouse only — leave native touch/pen scrolling alone.
      if (e.pointerType !== 'mouse') return;
      // Primary (left) button only.
      if (e.button !== 0) return;
      if (!overflows()) return;

      const target = e.target as Element | null;
      if (target && target.closest(INTERACTIVE_SELECTOR)) return;

      pointerId = e.pointerId;
      startX = e.clientX;
      startScrollLeft = el.scrollLeft;
      dragging = false;
      dragged = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!el || pointerId === null || e.pointerId !== pointerId) return;

      const delta = e.clientX - startX;

      if (!dragging) {
        if (Math.abs(delta) < DRAG_THRESHOLD) return;
        // Crossed the threshold — commit to a drag.
        dragging = true;
        dragged = true;
        applyDraggingStyles();
        try {
          el.setPointerCapture(pointerId);
        } catch {
          /* capture may be unavailable; scrolling still works */
        }
      }

      el.scrollLeft = startScrollLeft - delta;
      // Prevent text selection / native drag while pulling.
      e.preventDefault();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      const wasDragging = dragging;
      endDrag();
      if (wasDragging) {
        // Keep `dragged` true just long enough for the trailing click event
        // (dispatched synchronously after pointerup) to be swallowed.
        if (clearDraggedTimer) clearTimeout(clearDraggedTimer);
        clearDraggedTimer = setTimeout(() => {
          dragged = false;
        }, 0);
      } else {
        dragged = false;
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      endDrag();
      dragged = false;
    };

    const onClickCapture = (e: MouseEvent) => {
      if (!suppressClickAfterDrag) return;
      if (dragged) {
        // Swallow the click that concludes a drag so row-click / navigation
        // does not fire.
        e.stopPropagation();
        e.preventDefault();
      }
    };

    // The element may not exist yet (async AG Grid viewport). Poll briefly.
    let attachAttempts = 0;
    let attachTimer: ReturnType<typeof setTimeout> | null = null;

    const attach = () => {
      const found = getElRef.current();
      if (!found) {
        // Retry for a short while, then give up quietly.
        if (attachAttempts < 40) {
          attachAttempts += 1;
          attachTimer = setTimeout(attach, 50);
        }
        return;
      }
      el = found;
      updateGrabCursor();
      el.addEventListener('pointerdown', onPointerDown);
      el.addEventListener('pointermove', onPointerMove);
      el.addEventListener('pointerup', onPointerUp);
      el.addEventListener('pointercancel', onPointerCancel);
      el.addEventListener('pointerleave', onPointerCancel);
      el.addEventListener('click', onClickCapture, true);
    };

    attach();

    return () => {
      if (attachTimer) clearTimeout(attachTimer);
      if (clearDraggedTimer) clearTimeout(clearDraggedTimer);
      if (!el) return;
      endDrag();
      el.style.cursor = '';
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerCancel);
      el.removeEventListener('pointerleave', onPointerCancel);
      el.removeEventListener('click', onClickCapture, true);
    };
  }, [enabled, suppressClickAfterDrag]);
}
