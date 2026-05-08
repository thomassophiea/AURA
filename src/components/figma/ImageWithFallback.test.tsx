import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ImageWithFallback } from './ImageWithFallback';

describe('ImageWithFallback', () => {
  it('renders the original <img> when no error has fired', () => {
    const { container } = render(<ImageWithFallback src="https://example.com/x.png" alt="Pic" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.com/x.png');
    expect(img?.getAttribute('alt')).toBe('Pic');
  });

  it('forwards className and style on the original <img>', () => {
    const { container } = render(
      <ImageWithFallback
        src="https://example.com/y.png"
        alt="Pic"
        className="rounded-lg"
        style={{ width: '64px' }}
      />
    );
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.className).toBe('rounded-lg');
    expect(img.style.width).toBe('64px');
  });

  it('swaps to the fallback wrapper when the underlying <img> errors', () => {
    const { container } = render(<ImageWithFallback src="bad-url" alt="Broken" />);
    const img = container.querySelector('img')!;
    fireEvent.error(img);

    // After the error: outer wrapper div + inner SVG-data <img> with the
    // sentinel "Error loading image" alt.
    const fallback = container.querySelector('div.inline-block') as HTMLElement;
    expect(fallback).toBeTruthy();
    const errorImg = fallback.querySelector('img') as HTMLImageElement;
    expect(errorImg.alt).toBe('Error loading image');
    expect(errorImg.getAttribute('data-original-url')).toBe('bad-url');
  });

  it('preserves outer className on the fallback wrapper', () => {
    const { container } = render(
      <ImageWithFallback src="bad-url" alt="X" className="rounded-md" />
    );
    fireEvent.error(container.querySelector('img')!);
    const fallback = container.querySelector('div.inline-block') as HTMLElement;
    expect(fallback.className).toContain('rounded-md');
    expect(fallback.className).toContain('bg-muted');
  });
});
