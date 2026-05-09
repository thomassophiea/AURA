import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DraggableWidget } from './DraggableWidget';

const baseProps = {
  id: 'w-1',
  index: 0,
  onDragStart: vi.fn(),
  onDragOver: vi.fn(),
  onDragEnd: vi.fn(),
  isDragging: false,
  isDropTarget: false,
};

describe('DraggableWidget', () => {
  it('renders children with the data-widget-id attribute', () => {
    const { container } = render(
      <DraggableWidget {...baseProps}>
        <span data-testid="child">x</span>
      </DraggableWidget>
    );
    const wrapper = container.querySelector('[data-widget-id="w-1"]') as HTMLElement;
    expect(wrapper).toBeTruthy();
    expect(wrapper.querySelector('[data-testid="child"]')).toBeTruthy();
    expect(wrapper.getAttribute('draggable')).toBe('true');
  });

  it('isDragging applies the opacity-50 + scale visual', () => {
    const { container } = render(
      <DraggableWidget {...baseProps} isDragging>
        <span>x</span>
      </DraggableWidget>
    );
    const wrapper = container.querySelector('[data-widget-id="w-1"]') as HTMLElement;
    expect(wrapper.className).toContain('opacity-50');
  });

  it('isDropTarget (and not dragging) applies the ring outline', () => {
    const { container } = render(
      <DraggableWidget {...baseProps} isDropTarget>
        <span>x</span>
      </DraggableWidget>
    );
    const wrapper = container.querySelector('[data-widget-id="w-1"]') as HTMLElement;
    expect(wrapper.className).toContain('ring-2');
    expect(wrapper.className).toContain('ring-primary');
  });

  it('isDropTarget + isDragging hides the ring on the dragging widget', () => {
    const { container } = render(
      <DraggableWidget {...baseProps} isDropTarget isDragging>
        <span>x</span>
      </DraggableWidget>
    );
    const wrapper = container.querySelector('[data-widget-id="w-1"]') as HTMLElement;
    expect(wrapper.className).not.toContain('ring-2');
  });

  it('onDragStart fires with the index', () => {
    const onDragStart = vi.fn();
    const { container } = render(
      <DraggableWidget {...baseProps} index={3} onDragStart={onDragStart}>
        <span>x</span>
      </DraggableWidget>
    );
    const wrapper = container.querySelector('[data-widget-id="w-1"]') as HTMLElement;
    fireEvent.dragStart(wrapper, {
      dataTransfer: { effectAllowed: 'none', setData: vi.fn(), getData: vi.fn() },
    });
    expect(onDragStart).toHaveBeenCalledWith(3);
  });

  it('onDragOver fires with the index when something is dragged over it', () => {
    const onDragOver = vi.fn();
    const { container } = render(
      <DraggableWidget {...baseProps} index={5} onDragOver={onDragOver}>
        <span>x</span>
      </DraggableWidget>
    );
    const wrapper = container.querySelector('[data-widget-id="w-1"]') as HTMLElement;
    fireEvent.dragOver(wrapper, {
      dataTransfer: {
        effectAllowed: 'none',
        dropEffect: 'none',
        setData: vi.fn(),
        getData: vi.fn(),
      },
    });
    expect(onDragOver).toHaveBeenCalledWith(5);
  });

  it('onDragEnd fires when the drag finishes', () => {
    const onDragEnd = vi.fn();
    const { container } = render(
      <DraggableWidget {...baseProps} onDragEnd={onDragEnd}>
        <span>x</span>
      </DraggableWidget>
    );
    fireEvent.dragEnd(container.querySelector('[data-widget-id="w-1"]')!);
    expect(onDragEnd).toHaveBeenCalled();
  });

  it('mouseEnter shows the drag handle (opacity-100)', () => {
    const { container } = render(
      <DraggableWidget {...baseProps}>
        <span>x</span>
      </DraggableWidget>
    );
    const wrapper = container.querySelector('[data-widget-id="w-1"]') as HTMLElement;
    fireEvent.mouseEnter(wrapper);
    // Find the handle div (the one wrapping GripVertical)
    const handle = container.querySelector('.cursor-grab') as HTMLElement;
    expect(handle.className).toContain('opacity-100');
    fireEvent.mouseLeave(wrapper);
    expect(handle.className).toContain('opacity-0');
  });

  it('forwards a custom className on the wrapper', () => {
    const { container } = render(
      <DraggableWidget {...baseProps} className="my-widget">
        <span>x</span>
      </DraggableWidget>
    );
    const wrapper = container.querySelector('[data-widget-id="w-1"]') as HTMLElement;
    expect(wrapper.className).toContain('my-widget');
  });
});
