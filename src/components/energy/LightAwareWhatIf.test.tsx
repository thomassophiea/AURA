import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { LightAwareWhatIf } from './LightAwareWhatIf';

// Radix Slider observes its track size; jsdom has no ResizeObserver.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const aps = [{ watts: 12 }, { watts: 10 }, { watts: 14 }];

function renderPanel() {
  return render(
    <LightAwareWhatIf aps={aps} reportingCount={6} ratePerKwh={0.14} currencySymbol="$" />
  );
}

describe('LightAwareWhatIf', () => {
  it('shows the real sensor-capable count and the modeled disclaimer', () => {
    renderPanel();
    expect(screen.getByText('Sensor-capable APs').parentElement).toHaveTextContent(/3\s*\/\s*6/);
    expect(
      screen.getByText(/Live sensor telemetry will replace these assumptions/i)
    ).toBeInTheDocument();
    expect(screen.getAllByRole('slider').length).toBe(2);
  });

  it('projects a non-zero annual saving at the default modeled hours', () => {
    renderPanel();
    const cost = screen.getByTestId('whatif-annual-cost').textContent ?? '';
    expect(cost).toMatch(/\$/);
    expect(cost).not.toMatch(/\$0(\.00)?$/);
  });

  it('drops the projection to zero when both sliders are set to zero', () => {
    renderPanel();
    for (const s of screen.getAllByRole('slider')) {
      // Radix Slider: Home moves the focused thumb to its minimum (0).
      fireEvent.keyDown(s, { key: 'Home' });
    }
    const cost = screen.getByTestId('whatif-annual-cost').textContent ?? '';
    expect(cost).toMatch(/\$0(\.00)?/);
  });
});
