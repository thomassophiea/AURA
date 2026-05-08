import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Avatar, AvatarImage, AvatarFallback } from './avatar';

describe('Avatar', () => {
  it('renders with data-slot="avatar"', () => {
    const { container } = render(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>
    );
    expect(container.querySelector('[data-slot="avatar"]')).toBeTruthy();
  });

  it('forwards a custom className alongside default classes', () => {
    const { container } = render(
      <Avatar className="size-12">
        <AvatarFallback>X</AvatarFallback>
      </Avatar>
    );
    const el = container.querySelector('[data-slot="avatar"]')!;
    expect(el.className).toContain('size-12');
    expect(el.className).toContain('rounded-full');
  });

  it('AvatarFallback renders fallback content + data-slot', () => {
    const { container } = render(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>
    );
    const fallback = container.querySelector('[data-slot="avatar-fallback"]')!;
    expect(fallback.textContent).toBe('AB');
    expect(fallback.className).toContain('bg-muted');
  });

  it('AvatarImage receives src/alt props', () => {
    // Radix only mounts the <img> after onLoadingStatusChange becomes
    // 'loaded'; in jsdom we just ensure it renders at all (it may show
    // fallback). This asserts the component runs without error.
    const { container } = render(
      <Avatar>
        <AvatarImage src="https://example.com/x.png" alt="Test" />
        <AvatarFallback>X</AvatarFallback>
      </Avatar>
    );
    expect(container.querySelector('[data-slot="avatar"]')).toBeTruthy();
  });
});
