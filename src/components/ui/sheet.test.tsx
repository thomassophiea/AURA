import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from './sheet';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
});

describe('Sheet primitives', () => {
  it('renders nothing visible when closed', () => {
    render(
      <Sheet open={false}>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>Body</SheetContent>
      </Sheet>
    );
    expect(screen.queryByText('Body')).toBeNull();
  });

  it('renders title + description + body when open (default right side)', () => {
    render(
      <Sheet open>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>My Title</SheetTitle>
            <SheetDescription>desc</SheetDescription>
          </SheetHeader>
          <p>Body</p>
        </SheetContent>
      </Sheet>
    );
    expect(screen.getByText('My Title')).toBeTruthy();
    expect(screen.getByText('desc')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it.each(['top', 'right', 'bottom', 'left'] as const)(
    'side="%s" applies the matching slide-in class',
    (side) => {
      const { baseElement } = render(
        <Sheet open>
          <SheetTrigger>x</SheetTrigger>
          <SheetContent side={side}>
            <SheetHeader>
              <SheetTitle>X</SheetTitle>
              <SheetDescription>d</SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      );
      const content = baseElement.querySelector('[data-slot="sheet-content"]')!;
      // Each side has a unique slide-in-from-* utility
      expect(content.className).toMatch(new RegExp(`slide-in-from-${side}`));
    }
  );

  it('SheetTitle/Description/Header/Footer have data-slots', () => {
    const { baseElement } = render(
      <Sheet open>
        <SheetTrigger>x</SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>X</SheetTitle>
            <SheetDescription>d</SheetDescription>
          </SheetHeader>
          <SheetFooter>F</SheetFooter>
        </SheetContent>
      </Sheet>
    );
    expect(baseElement.querySelector('[data-slot="sheet-header"]')).toBeTruthy();
    expect(baseElement.querySelector('[data-slot="sheet-title"]')).toBeTruthy();
    expect(baseElement.querySelector('[data-slot="sheet-description"]')).toBeTruthy();
    expect(baseElement.querySelector('[data-slot="sheet-footer"]')).toBeTruthy();
  });

  it('forwards a custom className on SheetContent', () => {
    const { baseElement } = render(
      <Sheet open>
        <SheetTrigger>x</SheetTrigger>
        <SheetContent className="my-sheet">
          <SheetHeader>
            <SheetTitle>X</SheetTitle>
            <SheetDescription>d</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
    expect(baseElement.querySelector('[data-slot="sheet-content"]')!.className).toContain(
      'my-sheet'
    );
  });
});
