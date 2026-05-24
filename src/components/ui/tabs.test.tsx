import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
});

describe('Tabs primitives', () => {
  it('renders root with data-slot="tabs"', () => {
    const { container } = render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
      </Tabs>
    );
    expect(container.querySelector('[data-slot="tabs"]')).toBeTruthy();
  });

  it('TabsList has data-slot="tabs-list" + bg-muted styling', () => {
    const { container } = render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
      </Tabs>
    );
    const list = container.querySelector('[data-slot="tabs-list"]')!;
    expect(list.className).toContain('bg-muted');
  });

  it('TabsTrigger has data-slot="tabs-trigger" and renders text', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">Tab A</TabsTrigger>
        </TabsList>
      </Tabs>
    );
    expect(screen.getByText('Tab A')).toBeTruthy();
  });

  it('default value selects the matching trigger', () => {
    render(
      <Tabs defaultValue="b">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
      </Tabs>
    );
    const triggerB = screen.getByText('B');
    expect(triggerB.getAttribute('data-state')).toBe('active');
  });

  it('TabsContent shows when value matches the active tab', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Body of A</TabsContent>
        <TabsContent value="b">Body of B</TabsContent>
      </Tabs>
    );
    expect(screen.getByText('Body of A')).toBeTruthy();
    expect(screen.queryByText('Body of B')).toBeNull();
  });

  it('switching tabs (controlled) swaps the rendered content', () => {
    const { rerender } = render(
      <Tabs value="a" onValueChange={vi.fn()}>
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Body of A</TabsContent>
        <TabsContent value="b">Body of B</TabsContent>
      </Tabs>
    );
    expect(screen.getByText('Body of A')).toBeTruthy();
    rerender(
      <Tabs value="b" onValueChange={vi.fn()}>
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Body of A</TabsContent>
        <TabsContent value="b">Body of B</TabsContent>
      </Tabs>
    );
    expect(screen.getByText('Body of B')).toBeTruthy();
  });

  it('controlled mode shows the tab content matching `value`', () => {
    render(
      <Tabs value="b" onValueChange={vi.fn()}>
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Body of A</TabsContent>
        <TabsContent value="b">Body of B</TabsContent>
      </Tabs>
    );
    expect(screen.getByText('Body of B')).toBeTruthy();
    expect(screen.queryByText('Body of A')).toBeNull();
  });

  it('forwards a custom className on Tabs root', () => {
    const { container } = render(
      <Tabs defaultValue="a" className="my-tabs">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
      </Tabs>
    );
    const root = container.querySelector('[data-slot="tabs"]')!;
    expect(root.className).toContain('my-tabs');
  });
});
