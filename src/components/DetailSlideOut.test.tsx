import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DetailSlideOut } from './DetailSlideOut';

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

describe('DetailSlideOut', () => {
  it('renders nothing in the document body when closed', () => {
    render(
      <DetailSlideOut isOpen={false} onClose={vi.fn()} title="X">
        <span>Body</span>
      </DetailSlideOut>
    );
    expect(screen.queryByText('Body')).toBeNull();
  });

  it('renders title + description + children when open', () => {
    render(
      <DetailSlideOut isOpen onClose={vi.fn()} title="My Detail" description="More info">
        <span>Body</span>
      </DetailSlideOut>
    );
    expect(screen.getByText('My Detail')).toBeTruthy();
    expect(screen.getByText('More info')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('omits the description block when not provided', () => {
    render(
      <DetailSlideOut isOpen onClose={vi.fn()} title="No-Desc">
        <span>Body</span>
      </DetailSlideOut>
    );
    expect(screen.getByText('No-Desc')).toBeTruthy();
  });

  // The `sm:` prefix is the whole point: SheetContent ships `sm:max-w-sm`, and
  // Tailwind emits responsive variants after unprefixed ones, so an unprefixed
  // width here loses the cascade above 640px and every panel renders at 384px.
  it.each([
    ['sm', 'sm:max-w-sm'],
    ['md', 'sm:max-w-md'],
    ['lg', 'sm:max-w-lg'],
    ['xl', 'sm:max-w-xl'],
    ['2xl', 'sm:max-w-2xl'],
    ['3xl', 'sm:max-w-3xl'],
    ['4xl', 'sm:max-w-4xl'],
  ] as const)('width="%s" applies "%s"', (width, expectedClass) => {
    const { baseElement } = render(
      <DetailSlideOut isOpen onClose={vi.fn()} title="X" width={width}>
        <span>Body</span>
      </DetailSlideOut>
    );
    expect(baseElement.querySelector(`[class~="${expectedClass}"]`)).toBeTruthy();
  });

  it('default width="2xl" when prop omitted', () => {
    const { baseElement } = render(
      <DetailSlideOut isOpen onClose={vi.fn()} title="X">
        <span>Body</span>
      </DetailSlideOut>
    );
    expect(baseElement.querySelector('[class~="sm:max-w-2xl"]')).toBeTruthy();
  });

  it('never emits a bare max-w-* that SheetContent would override', () => {
    // Regression: an unprefixed width silently loses to the sheet's own
    // `sm:max-w-sm`, which is how Access Point Details ended up 384px wide.
    const { baseElement } = render(
      <DetailSlideOut isOpen onClose={vi.fn()} title="X" width="2xl">
        <span>Body</span>
      </DetailSlideOut>
    );
    expect(baseElement.querySelector('[class~="max-w-2xl"]')).toBeNull();
  });

  it('makes the body a container so content sizes to the panel, not the viewport', () => {
    // Inside a 672px panel a viewport breakpoint reports the full 1600px and
    // splits cards into columns too narrow to hold a serial number.
    const { baseElement } = render(
      <DetailSlideOut isOpen onClose={vi.fn()} title="X">
        <span>Body</span>
      </DetailSlideOut>
    );
    expect(baseElement.querySelector('[class~="@container"]')).toBeTruthy();
  });
});
