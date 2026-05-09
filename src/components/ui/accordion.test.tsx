import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './accordion';

describe('Accordion primitives', () => {
  it('renders root with data-slot="accordion"', () => {
    const { container } = render(
      <Accordion type="single" collapsible>
        <AccordionItem value="a">
          <AccordionTrigger>A</AccordionTrigger>
          <AccordionContent>Body</AccordionContent>
        </AccordionItem>
      </Accordion>
    );
    expect(container.querySelector('[data-slot="accordion"]')).toBeTruthy();
  });

  it('item has data-slot="accordion-item" + border classes', () => {
    const { container } = render(
      <Accordion type="single" collapsible>
        <AccordionItem value="a">
          <AccordionTrigger>A</AccordionTrigger>
          <AccordionContent>Body</AccordionContent>
        </AccordionItem>
      </Accordion>
    );
    const item = container.querySelector('[data-slot="accordion-item"]')!;
    expect(item.className).toContain('border-b');
  });

  it('trigger renders the children + has data-slot', () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="a">
          <AccordionTrigger>Section A</AccordionTrigger>
          <AccordionContent>Body</AccordionContent>
        </AccordionItem>
      </Accordion>
    );
    expect(screen.getByText('Section A')).toBeTruthy();
  });

  it('content renders text when defaultValue makes the section open', () => {
    render(
      <Accordion type="single" defaultValue="a" collapsible>
        <AccordionItem value="a">
          <AccordionTrigger>A</AccordionTrigger>
          <AccordionContent>Body of A</AccordionContent>
        </AccordionItem>
        <AccordionItem value="b">
          <AccordionTrigger>B</AccordionTrigger>
          <AccordionContent>Body of B</AccordionContent>
        </AccordionItem>
      </Accordion>
    );
    expect(screen.getByText('Body of A')).toBeTruthy();
  });

  it('forwards a custom className on AccordionItem', () => {
    const { container } = render(
      <Accordion type="single" collapsible>
        <AccordionItem value="a" className="my-item">
          <AccordionTrigger>A</AccordionTrigger>
          <AccordionContent>Body</AccordionContent>
        </AccordionItem>
      </Accordion>
    );
    expect(container.querySelector('[data-slot="accordion-item"]')!.className).toContain('my-item');
  });
});
