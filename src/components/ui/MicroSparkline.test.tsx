import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MicroSparkline } from './MicroSparkline';

describe('MicroSparkline', () => {
  it('renders nothing when data has fewer than 2 points', () => {
    const { container: c1 } = render(<MicroSparkline data={[]} />);
    expect(c1.firstChild).toBeNull();
    const { container: c2 } = render(<MicroSparkline data={[5]} />);
    expect(c2.firstChild).toBeNull();
  });

  it('renders nothing when fewer than 2 finite values remain after filtering', () => {
    const { container } = render(<MicroSparkline data={[NaN, Infinity, 5]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders an svg with width and height matching props', () => {
    const { container } = render(<MicroSparkline data={[1, 2, 3]} width={80} height={20} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('width')).toBe('80');
    expect(svg?.getAttribute('height')).toBe('20');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 80 20');
  });

  it('emits both fill and stroke paths by default', () => {
    const { container } = render(<MicroSparkline data={[1, 2, 3]} />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(2); // filled area + stroke line
  });

  it('emits only the stroke path when filled=false', () => {
    const { container } = render(<MicroSparkline data={[1, 2, 3]} filled={false} />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(1);
  });

  it('uses the default amber stroke when none provided', () => {
    const { container } = render(<MicroSparkline data={[1, 2, 3]} />);
    const stroke = container.querySelectorAll('path')[1]; // 2nd path is the stroke line
    expect(stroke?.getAttribute('stroke')).toBe('var(--aura-amber)');
  });

  it('uses a custom stroke color when provided', () => {
    const { container } = render(<MicroSparkline data={[1, 2, 3]} stroke="#ff00ff" />);
    const paths = container.querySelectorAll('path');
    const stroke = paths[paths.length - 1];
    expect(stroke?.getAttribute('stroke')).toBe('#ff00ff');
  });

  it('exposes a default aria-label for accessibility', () => {
    const { container } = render(<MicroSparkline data={[1, 2]} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('trend sparkline');
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('uses a custom aria-label when provided', () => {
    const { container } = render(
      <MicroSparkline data={[1, 2]} ariaLabel="throughput last 15 samples" />
    );
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe(
      'throughput last 15 samples'
    );
  });

  it('handles a flat (zero-range) series without dividing by zero', () => {
    // All-equal values would produce a 0 range — should not throw NaN paths.
    const { container } = render(<MicroSparkline data={[7, 7, 7]} />);
    const stroke = container.querySelectorAll('path')[1];
    const d = stroke?.getAttribute('d') ?? '';
    expect(d).not.toContain('NaN');
  });
});
