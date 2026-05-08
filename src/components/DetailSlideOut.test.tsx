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

  it.each([
    ['sm', 'max-w-sm'],
    ['md', 'max-w-md'],
    ['lg', 'max-w-lg'],
    ['xl', 'max-w-xl'],
    ['2xl', 'max-w-2xl'],
    ['3xl', 'max-w-3xl'],
    ['4xl', 'max-w-4xl'],
  ] as const)('width="%s" applies "%s"', (width, expectedClass) => {
    const { baseElement } = render(
      <DetailSlideOut isOpen onClose={vi.fn()} title="X" width={width}>
        <span>Body</span>
      </DetailSlideOut>
    );
    expect(baseElement.querySelector(`.${expectedClass}`)).toBeTruthy();
  });

  it('default width="2xl" when prop omitted', () => {
    const { baseElement } = render(
      <DetailSlideOut isOpen onClose={vi.fn()} title="X">
        <span>Body</span>
      </DetailSlideOut>
    );
    expect(baseElement.querySelector('.max-w-2xl')).toBeTruthy();
  });
});
