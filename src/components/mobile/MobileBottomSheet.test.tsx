import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileBottomSheet } from './MobileBottomSheet';

describe('MobileBottomSheet', () => {
  it('renders nothing when isOpen=false', () => {
    const { container } = render(
      <MobileBottomSheet isOpen={false} onClose={vi.fn()} title="X">
        <span>Body</span>
      </MobileBottomSheet>
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders title and children when isOpen=true', () => {
    render(
      <MobileBottomSheet isOpen onClose={vi.fn()} title="Detail">
        <span>Body content</span>
      </MobileBottomSheet>
    );
    expect(screen.getByText('Detail')).toBeTruthy();
    expect(screen.getByText('Body content')).toBeTruthy();
  });

  it('clicking the overlay fires onClose', () => {
    const onClose = vi.fn();
    const { container } = render(
      <MobileBottomSheet isOpen onClose={onClose} title="X">
        <span>Body</span>
      </MobileBottomSheet>
    );
    const overlay = container.querySelector('.bg-black\\/50') as HTMLElement;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking the X close button fires onClose', () => {
    const onClose = vi.fn();
    const { container } = render(
      <MobileBottomSheet isOpen onClose={onClose} title="X">
        <span>Body</span>
      </MobileBottomSheet>
    );
    // Find the close button — it's the only button in the header
    const closeButton = container.querySelector('button')!;
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });

  it('locks body overflow while open and restores when closed', () => {
    const { rerender } = render(
      <MobileBottomSheet isOpen onClose={vi.fn()} title="X">
        <span>Body</span>
      </MobileBottomSheet>
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <MobileBottomSheet isOpen={false} onClose={vi.fn()} title="X">
        <span>Body</span>
      </MobileBottomSheet>
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('swiping down > 50px fires onClose', () => {
    const onClose = vi.fn();
    const { container } = render(
      <MobileBottomSheet isOpen onClose={onClose} title="X">
        <span>Body</span>
      </MobileBottomSheet>
    );
    // The sheet div is the second one (after the overlay).
    const sheet = container.querySelectorAll('div.fixed')[1] as HTMLElement;
    fireEvent.touchStart(sheet, { targetTouches: [{ clientY: 100 }] });
    fireEvent.touchMove(sheet, { targetTouches: [{ clientY: 200 }] });
    fireEvent.touchEnd(sheet);
    expect(onClose).toHaveBeenCalled();
  });

  it('swiping less than the threshold does NOT fire onClose', () => {
    const onClose = vi.fn();
    const { container } = render(
      <MobileBottomSheet isOpen onClose={onClose} title="X">
        <span>Body</span>
      </MobileBottomSheet>
    );
    const sheet = container.querySelectorAll('div.fixed')[1] as HTMLElement;
    fireEvent.touchStart(sheet, { targetTouches: [{ clientY: 100 }] });
    fireEvent.touchMove(sheet, { targetTouches: [{ clientY: 120 }] }); // only 20px
    fireEvent.touchEnd(sheet);
    expect(onClose).not.toHaveBeenCalled();
  });
});
