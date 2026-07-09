/**
 * Component tests for the WLAN editor drawer: edit-mode auth lock, MBA/CP
 * gating, dirty+valid Save gating and privacy synthesis through the save
 * flow. Services are mocked — no controller traffic.
 */
import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../../../services/configure', () => ({
  profilesService: { update: vi.fn(), list: vi.fn(async () => []) },
}));

import type { WlanService } from '../../../types/configure';
import { WlanEditorSheet, type WlanEditorSheetProps } from './WlanEditorSheet';
import { DEFAULTS, LAB_6GHZ, SKYNET } from './wlanFixtures';

beforeAll(() => {
  // Radix primitives probe pointer-capture APIs jsdom does not implement.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
});

const refs: WlanEditorSheetProps['refs'] = {
  roles: [],
  topologies: [],
  cos: [],
  aaaPolicies: [],
  eguests: [],
  profiles: [],
  loading: false,
  reloadProfiles: vi.fn(async () => undefined),
};

function renderEditor(seed: WlanService, isEdit: boolean, onSave = vi.fn(async () => seed)) {
  const utils = render(
    <WlanEditorSheet
      open
      onOpenChange={vi.fn()}
      seed={seed}
      isEdit={isEdit}
      refs={refs}
      saving={false}
      onSave={onSave}
    />
  );
  return { ...utils, onSave };
}

/** Radix TabsTrigger activates on mousedown; click alone is not enough. */
function switchToTab(name: string) {
  const tab = screen.getByRole('tab', { name });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

/** Find the Switch rendered in the same inline FieldRow as a label. */
function switchForLabel(label: string) {
  const labelEl = screen.getByText(label);
  const row = labelEl.parentElement?.parentElement;
  expect(row).toBeTruthy();
  return within(row as HTMLElement).getByRole('switch');
}

describe('WlanEditorSheet — auth lock in edit mode', () => {
  it('shows the derived WPA3-Personal auth type, locked, for the real LAB-6GHz record', () => {
    renderEditor(structuredClone(LAB_6GHZ), true);
    switchToTab('Authentication');
    const authSelect = screen.getByRole('combobox');
    expect(authSelect).toHaveTextContent('WPA3-Personal');
    expect(authSelect).toBeDisabled();
  });
});

describe('WlanEditorSheet — MBA / captive-portal gating', () => {
  it('locks the MBA toggle while an Internal captive portal is enabled', () => {
    const record: WlanService = {
      ...structuredClone(SKYNET),
      enableCaptivePortal: true,
      captivePortalType: 'Internal',
    };
    renderEditor(record, true);
    switchToTab('Authentication');
    expect(switchForLabel('MAC-based authentication (MBA)')).toBeDisabled();
  });

  it('keeps the MBA toggle available when no captive portal is enabled', () => {
    renderEditor(structuredClone(SKYNET), true);
    switchToTab('Authentication');
    expect(switchForLabel('MAC-based authentication (MBA)')).toBeEnabled();
  });

  it('hides the MBA timeout role under an Internal portal but shows it otherwise', () => {
    const mbaOn: WlanService = { ...structuredClone(SKYNET), mbaAuthorization: true };
    const { unmount } = renderEditor(mbaOn, true);
    switchToTab('Authentication');
    expect(screen.getByText('MBA Timeout Role')).toBeInTheDocument();
    unmount();

    const internalCp: WlanService = {
      ...mbaOn,
      enableCaptivePortal: true,
      captivePortalType: 'Internal',
    };
    renderEditor(internalCp, true);
    switchToTab('Authentication');
    expect(screen.queryByText('MBA Timeout Role')).not.toBeInTheDocument();
  });
});

describe('WlanEditorSheet — Save gating (dirty + valid)', () => {
  it('disables Save until the form is both dirty and valid', () => {
    renderEditor(structuredClone(DEFAULTS), false);
    const save = screen.getByRole('button', { name: 'Save' });
    // Pristine + invalid (empty name/SSID).
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Network Name/), { target: { value: 'Lab WLAN' } });
    // Dirty but still invalid (SSID empty).
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/SSID/), { target: { value: 'lab-wlan' } });
    expect(save).toBeEnabled();

    fireEvent.change(screen.getByLabelText(/SSID/), { target: { value: '' } });
    expect(save).toBeDisabled();
  });

  it('keeps Save disabled on a pristine valid record until an edit is made', () => {
    renderEditor(structuredClone(SKYNET), true);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.click(switchForLabel('Suppress (hide) SSID'));
    expect(save).toBeEnabled();
  });
});

describe('WlanEditorSheet — save flow synthesizes the privacy element', () => {
  it('passes a payload with exactly one privacy element and pinned PMF', async () => {
    const record = structuredClone(LAB_6GHZ);
    // Simulate drift: pure WPA3 record whose PMF was weakened by older tooling.
    (record.privacy!.WpaSaeElement as { pmfMode: string }).pmfMode = 'disabled';
    const onSave = vi.fn(async (payload: WlanService, _id?: string) => payload);
    renderEditor(record, true, onSave);

    fireEvent.click(switchForLabel('Suppress (hide) SSID'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [payload, id] = onSave.mock.calls[0];
    expect(id).toBe(LAB_6GHZ.id);
    expect(Object.keys(payload.privacy ?? {})).toEqual(['WpaSaeElement']);
    expect(payload.privacy?.WpaSaeElement).toMatchObject({
      pmfMode: 'required',
      saeMethod: 'SaeH2e',
    });
    expect(payload.suppressSsid).toBe(true);
  });
});
