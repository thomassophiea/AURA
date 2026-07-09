/**
 * RateLimiterDialog: two-field editor with controller validation — name
 * required, CIR 128-500000; Save stays disabled until valid and submits the
 * numeric cirKbps.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The _kit barrel pulls in useResourceCrud → services/configure → api.ts,
// whose module-load side effects (localStorage tokens) don't run under vitest.
vi.mock('../../../services/configure', () => ({
  ConfigureApiError: class ConfigureApiError extends Error {},
}));

import { RateLimiterDialog } from './RateLimiterDialog';
import type { RateLimiter } from '../../../types/configure';

describe('RateLimiterDialog', () => {
  it('gates Save on name + CIR range and submits numeric cirKbps', () => {
    const onSubmit = vi.fn();
    render(
      <RateLimiterDialog open onOpenChange={() => {}} record={null} onSubmit={onSubmit} />
    );

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Guest_RL' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '100' } });
    expect(save).toBeDisabled(); // 100 < 128

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2048' } });
    expect(save).toBeEnabled();

    fireEvent.click(save);
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Guest_RL', cirKbps: 2048 }, undefined);
  });

  it('edits an existing record preserving its identity fields', () => {
    const onSubmit = vi.fn();
    const record: RateLimiter = {
      id: 'rl-1',
      name: 'Uplink',
      cirKbps: 5000,
      canEdit: true,
      canDelete: true,
    };
    render(
      <RateLimiterDialog open onOpenChange={() => {}} record={record} onSubmit={onSubmit} />
    );

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '10000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rl-1', name: 'Uplink', cirKbps: 10000 }),
      'rl-1'
    );
  });
});
