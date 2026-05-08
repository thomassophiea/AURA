import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
} from './card';

describe('Card primitives', () => {
  it.each([
    [Card, 'card', 'bg-card'],
    [CardHeader, 'card-header', 'pt-6'],
    [CardAction, 'card-action', 'col-start-2'],
    [CardContent, 'card-content', 'px-6'],
    [CardFooter, 'card-footer', 'flex'],
    [CardDescription, 'card-description', 'text-muted-foreground'],
  ] as const)('renders with data-slot="%s"', (Comp, slot, expectedClass) => {
    const { container } = render(<Comp>Body</Comp>);
    const el = container.querySelector(`[data-slot="${slot}"]`)!;
    expect(el).toBeTruthy();
    expect(el.className).toContain(expectedClass);
  });

  it('CardTitle renders an <h4> with the title classes', () => {
    const { container } = render(<CardTitle>Hello</CardTitle>);
    const el = container.querySelector('[data-slot="card-title"]')!;
    expect(el.tagName.toLowerCase()).toBe('h4');
    expect(el.className).toContain('font-semibold');
  });

  it('CardDescription renders a <p>', () => {
    const { container } = render(<CardDescription>desc</CardDescription>);
    const el = container.querySelector('[data-slot="card-description"]')!;
    expect(el.tagName.toLowerCase()).toBe('p');
  });

  it('Card composes parts together with correct ancestry', () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Desc</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    );
    const card = container.querySelector('[data-slot="card"]')!;
    expect(card.querySelector('[data-slot="card-header"]')).toBeTruthy();
    expect(card.querySelector('[data-slot="card-title"]')!.textContent).toBe('Title');
    expect(card.querySelector('[data-slot="card-content"]')!.textContent).toBe('Body');
    expect(card.querySelector('[data-slot="card-footer"]')!.textContent).toBe('Footer');
  });

  it('forwards custom className without losing defaults', () => {
    const { container } = render(<Card className="my-card">x</Card>);
    const el = container.querySelector('[data-slot="card"]')!;
    expect(el.className).toContain('my-card');
    expect(el.className).toContain('rounded-xl');
  });
});
