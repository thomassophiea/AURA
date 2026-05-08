import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Progress } from './progress';

describe('Progress', () => {
  it('renders the data-slot="progress" root', () => {
    const { container } = render(<Progress value={50} />);
    expect(container.querySelector('[data-slot="progress"]')).toBeTruthy();
  });

  it('renders a translateX transform on the indicator based on value', () => {
    const { container } = render(<Progress value={75} />);
    const ind = container.querySelector('[data-slot="progress-indicator"]') as HTMLElement;
    expect(ind.style.transform).toBe('translateX(-25%)');
  });

  it('treats undefined value as 0% (full negative offset)', () => {
    const { container } = render(<Progress />);
    const ind = container.querySelector('[data-slot="progress-indicator"]') as HTMLElement;
    expect(ind.style.transform).toBe('translateX(-100%)');
  });

  it('100% pulls the indicator fully into view', () => {
    const { container } = render(<Progress value={100} />);
    const ind = container.querySelector('[data-slot="progress-indicator"]') as HTMLElement;
    expect(ind.style.transform).toBe('translateX(-0%)');
  });

  it('forwards a custom className', () => {
    const { container } = render(<Progress value={10} className="my-progress" />);
    expect(container.querySelector('[data-slot="progress"]')!.className).toContain('my-progress');
  });
});
