import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
});

describe('Dialog primitives', () => {
  it('content not rendered when closed', () => {
    render(
      <Dialog open={false}>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>X</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
    expect(screen.queryByText('X')).toBeNull();
  });

  it('renders title + description + body when open', () => {
    render(
      <Dialog open>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>My Dialog</DialogTitle>
            <DialogDescription>Some details</DialogDescription>
          </DialogHeader>
          <p>Body text</p>
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByText('My Dialog')).toBeTruthy();
    expect(screen.getByText('Some details')).toBeTruthy();
    expect(screen.getByText('Body text')).toBeTruthy();
  });

  it('DialogHeader is marked as a drag handle', () => {
    const { baseElement } = render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>X</DialogTitle>
            <DialogDescription>d</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
    const handle = baseElement.querySelector('[data-drag-handle="true"]');
    expect(handle).toBeTruthy();
  });

  it('renders the built-in close X button (sr-only "Close" label)', () => {
    const { baseElement } = render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>X</DialogTitle>
            <DialogDescription>d</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
    // The Close button contains a span with sr-only "Close"
    const closeText = baseElement.querySelector('.sr-only');
    expect(closeText?.textContent).toBe('Close');
  });

  it('clicking the close button fires onOpenChange(false)', () => {
    const onOpenChange = vi.fn();
    const { baseElement } = render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>X</DialogTitle>
            <DialogDescription>d</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
    const closeButton = baseElement.querySelector('.sr-only')!.closest('button')!;
    fireEvent.click(closeButton);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('forwards a custom className on DialogContent', () => {
    const { baseElement } = render(
      <Dialog open>
        <DialogContent className="my-dialog">
          <DialogHeader>
            <DialogTitle>X</DialogTitle>
            <DialogDescription>d</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
    const content = baseElement.querySelector('.my-dialog');
    expect(content).toBeTruthy();
  });

  it('DialogFooter wraps children with flex-col-reverse + sm:flex-row', () => {
    const { baseElement } = render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>X</DialogTitle>
            <DialogDescription>d</DialogDescription>
          </DialogHeader>
          <DialogFooter className="my-footer">
            <button>Cancel</button>
            <button>OK</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
    const footer = baseElement.querySelector('.my-footer')!;
    expect(footer.className).toContain('flex-col-reverse');
    expect(footer.className).toContain('sm:justify-end');
  });
});
