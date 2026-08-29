/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ComponentType } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { buildAlarmColumns, buildEventColumns, formatEventType } from './eventAlarmColumns';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('formatEventType', () => {
  it('humanizes SNAKE_CASE machine types', () => {
    expect(formatEventType('UPDATE_SERVICE')).toBe('Update Service');
  });

  it('splits camelCase types', () => {
    expect(formatEventType('apRegistration')).toBe('Ap Registration');
  });

  it('falls back to Audit for missing types', () => {
    expect(formatEventType(null)).toBe('Audit');
    expect(formatEventType(undefined)).toBe('Audit');
    expect(formatEventType('')).toBe('Audit');
  });

  it('keeps already-presentable labels', () => {
    expect(formatEventType('Login')).toBe('Login');
  });
});

describe('buildEventColumns', () => {
  const columns = buildEventColumns();

  it('defines severity, type, message, user and time columns', () => {
    expect(columns.map((c) => c.colId ?? c.field)).toEqual([
      'severity',
      'type',
      'message',
      'user',
      'timestamp',
    ]);
  });

  it('severity uses the status column type and defaults to Info', () => {
    const severity = columns[0];
    expect(severity.type).toBe('status');
    const getter = severity.valueGetter as (p: any) => string;
    expect(getter({ data: { severity: 'critical' } })).toBe('critical');
    expect(getter({ data: {} })).toBe('Info');
  });

  it('type column humanizes the raw event type', () => {
    const getter = columns[1].valueGetter as (p: any) => string;
    expect(getter({ data: { type: 'DELETE_TOPOLOGY' } })).toBe('Delete Topology');
  });

  it('time column sorts descending by default using the raw epoch', () => {
    const time = columns[4];
    expect(time.sort).toBe('desc');
    const cmp = time.comparator as (a: any, b: any) => number;
    const older = '2026-08-01T00:00:00Z';
    const newer = '2026-08-28T00:00:00Z';
    expect(cmp(older, newer)).toBeLessThan(0);
    expect(cmp(newer, older)).toBeGreaterThan(0);
    expect(cmp(1000, 1000)).toBe(0);
    // Invalid timestamps fold to epoch 0 rather than NaN-poisoning the sort
    expect(cmp('not-a-date', newer)).toBeLessThan(0);
  });
});

describe('buildAlarmColumns', () => {
  it('omits the actions column without handlers', () => {
    const columns = buildAlarmColumns();
    expect(columns.map((c) => c.colId ?? c.field)).toEqual([
      'severity',
      'type',
      'message',
      'source',
      'timestamp',
    ]);
  });

  it('appends the actions column when handlers are given', () => {
    const columns = buildAlarmColumns({ onAcknowledge: vi.fn(), onClear: vi.fn() });
    expect(columns[columns.length - 1].colId).toBe('actions');
    expect(columns[columns.length - 1].sortable).toBe(false);
  });

  it('source column falls back across device and site fields', () => {
    const getter = buildAlarmColumns()[3].valueGetter as (p: any) => string;
    expect(getter({ data: { source: 'AP4000-Lobby' } })).toBe('AP4000-Lobby');
    expect(getter({ data: { deviceName: 'AP-12' } })).toBe('AP-12');
    expect(getter({ data: { siteName: 'HQ' } })).toBe('HQ');
    expect(getter({ data: {} })).toBe('');
  });

  it('actions renderer invokes acknowledge and clear with the alarm id', () => {
    const onAcknowledge = vi.fn();
    const onClear = vi.fn();
    const columns = buildAlarmColumns({ onAcknowledge, onClear });
    const actionsCol = columns[columns.length - 1];
    const Renderer = actionsCol.cellRenderer as ComponentType<any>;

    render(
      <Renderer
        data={{ id: 'alarm-1', title: 'AP down' }}
        {...(actionsCol.cellRendererParams as object)}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /acknowledge alarm: AP down/i }));
    expect(onAcknowledge).toHaveBeenCalledWith('alarm-1');

    fireEvent.click(screen.getByRole('button', { name: /clear alarm: AP down/i }));
    expect(onClear).toHaveBeenCalledWith('alarm-1');
  });
});
