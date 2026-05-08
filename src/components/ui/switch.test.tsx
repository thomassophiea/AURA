import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Switch } from './switch';

describe('Switch', () => {
  it('renders with data-slot="aura-switch"', () => {
    const { container } = render(<Switch />);
    expect(container.querySelector('[data-slot="aura-switch"]')).toBeTruthy();
  });

  it('renders the thumb child', () => {
    const { container } = render(<Switch />);
    expect(container.querySelector('[data-slot="aura-switch-thumb"]')).toBeTruthy();
  });

  it('starts unchecked by default', () => {
    const { container } = render(<Switch />);
    expect(container.querySelector('[data-slot="aura-switch"]')!.getAttribute('data-state')).toBe(
      'unchecked'
    );
  });

  it('defaultChecked switches to checked state', () => {
    const { container } = render(<Switch defaultChecked />);
    expect(container.querySelector('[data-slot="aura-switch"]')!.getAttribute('data-state')).toBe(
      'checked'
    );
  });

  it('fires onCheckedChange on click', () => {
    const onCheckedChange = vi.fn();
    render(<Switch onCheckedChange={onCheckedChange} aria-label="airplane" />);
    fireEvent.click(screen.getByLabelText('airplane'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('respects disabled', () => {
    const onCheckedChange = vi.fn();
    render(<Switch disabled onCheckedChange={onCheckedChange} aria-label="airplane" />);
    fireEvent.click(screen.getByLabelText('airplane'));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('applies the inline width/height/padding style', () => {
    const { container } = render(<Switch />);
    const root = container.querySelector('[data-slot="aura-switch"]') as HTMLElement;
    expect(root.style.width).toBe('36px');
    expect(root.style.height).toBe('20px');
  });

  it('forwards a custom inline style without losing dimensions', () => {
    const { container } = render(<Switch style={{ marginLeft: '8px' }} />);
    const root = container.querySelector('[data-slot="aura-switch"]') as HTMLElement;
    expect(root.style.marginLeft).toBe('8px');
    expect(root.style.width).toBe('36px');
  });
});
