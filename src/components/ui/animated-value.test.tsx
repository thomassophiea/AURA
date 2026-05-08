import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AnimatedValue } from './animated-value';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AnimatedValue', () => {
  it('renders the value', () => {
    render(<AnimatedValue value={42} />);
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('renders string values', () => {
    render(<AnimatedValue value="hello" />);
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('does not start animating on first render (no ping span)', () => {
    const { container } = render(<AnimatedValue value={1} />);
    expect(container.querySelector('.animate-ping')).toBeNull();
  });

  it('animates when the value changes', () => {
    const { rerender, container } = render(<AnimatedValue value={1} />);
    expect(container.querySelector('.animate-ping')).toBeNull();
    rerender(<AnimatedValue value={2} />);
    expect(container.querySelector('.animate-ping')).not.toBeNull();
  });

  it('clears the animation after 1s', () => {
    const { rerender, container } = render(<AnimatedValue value={1} />);
    rerender(<AnimatedValue value={2} />);
    expect(container.querySelector('.animate-ping')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelector('.animate-ping')).toBeNull();
  });

  it('does NOT animate when the value does not change between rerenders', () => {
    const { rerender, container } = render(<AnimatedValue value={5} />);
    rerender(<AnimatedValue value={5} />);
    expect(container.querySelector('.animate-ping')).toBeNull();
  });

  it('respects a custom pulseColor className on the ping span', () => {
    const { rerender, container } = render(
      <AnimatedValue value={1} pulseColor="bg-amber-500/40" />
    );
    rerender(<AnimatedValue value={2} pulseColor="bg-amber-500/40" />);
    const ping = container.querySelector('.animate-ping');
    expect(ping?.className).toContain('bg-amber-500/40');
  });

  it('forwards an outer className onto the wrapper span', () => {
    const { container } = render(<AnimatedValue value={1} className="text-cyan-300" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('text-cyan-300');
  });
});
