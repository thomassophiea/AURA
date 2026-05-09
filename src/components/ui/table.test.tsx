import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from './table';

describe('Table primitives', () => {
  it('Table renders a container div + <table> with data-slots', () => {
    const { container } = render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>x</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(container.querySelector('[data-slot="table-container"]')).toBeTruthy();
    const table = container.querySelector('[data-slot="table"]')!;
    expect(table.tagName.toLowerCase()).toBe('table');
  });

  it.each([
    [TableHeader, 'table-header', 'thead'],
    [TableBody, 'table-body', 'tbody'],
    [TableFooter, 'table-footer', 'tfoot'],
  ] as const)('%s renders the right tag with data-slot="%s"', (Component, slot, tag) => {
    const { container } = render(
      <table>
        <Component>
          <TableRow>
            <TableCell>x</TableCell>
          </TableRow>
        </Component>
      </table>
    );
    const el = container.querySelector(`[data-slot="${slot}"]`)!;
    expect(el.tagName.toLowerCase()).toBe(tag);
  });

  it('TableRow has data-slot="table-row" + hover class', () => {
    const { container } = render(
      <table>
        <tbody>
          <TableRow>
            <td>x</td>
          </TableRow>
        </tbody>
      </table>
    );
    const row = container.querySelector('[data-slot="table-row"]')!;
    expect(row.tagName.toLowerCase()).toBe('tr');
    expect(row.className).toMatch(/hover:bg-muted/);
  });

  it('TableHead defaults scope="col" + has data-slot', () => {
    const { container } = render(
      <table>
        <thead>
          <tr>
            <TableHead>Name</TableHead>
          </tr>
        </thead>
      </table>
    );
    const th = container.querySelector('[data-slot="table-head"]')!;
    expect(th.tagName.toLowerCase()).toBe('th');
    expect(th.getAttribute('scope')).toBe('col');
    expect(th.textContent).toBe('Name');
  });

  it('TableHead scope can be overridden', () => {
    const { container } = render(
      <table>
        <thead>
          <tr>
            <TableHead scope="row">Row</TableHead>
          </tr>
        </thead>
      </table>
    );
    expect(container.querySelector('[data-slot="table-head"]')!.getAttribute('scope')).toBe('row');
  });

  it('TableCell renders <td> with data-slot', () => {
    const { container } = render(
      <table>
        <tbody>
          <tr>
            <TableCell>cell value</TableCell>
          </tr>
        </tbody>
      </table>
    );
    const td = container.querySelector('[data-slot="table-cell"]')!;
    expect(td.tagName.toLowerCase()).toBe('td');
    expect(td.textContent).toBe('cell value');
  });

  it('TableCaption renders <caption> with data-slot', () => {
    const { container } = render(
      <table>
        <TableCaption>Caption text</TableCaption>
      </table>
    );
    const caption = container.querySelector('[data-slot="table-caption"]')!;
    expect(caption.tagName.toLowerCase()).toBe('caption');
    expect(caption.textContent).toBe('Caption text');
  });

  it('forwards a custom className on Table', () => {
    const { container } = render(
      <Table className="my-table">
        <tbody>
          <tr>
            <td>x</td>
          </tr>
        </tbody>
      </Table>
    );
    expect(container.querySelector('[data-slot="table"]')!.className).toContain('my-table');
  });

  it('composes a full table with header + body + caption', () => {
    const { container } = render(
      <Table>
        <TableCaption>Users</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Alice</TableCell>
            <TableCell>alice@x.com</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(container.querySelector('caption')!.textContent).toBe('Users');
    expect(container.querySelectorAll('th').length).toBe(2);
    expect(container.querySelectorAll('td').length).toBe(2);
  });
});
