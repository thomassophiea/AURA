import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VoiceInputControl } from './VoiceInputControl';

const noop = vi.fn();

describe('VoiceInputControl', () => {
  it('shows the raw browser error code alongside the label — "permission denied" and "service blocked" must not look identical', () => {
    const { rerender } = render(
      <VoiceInputControl state="permission_denied" onStart={noop} onStop={noop} onCancel={noop} error="not-allowed" />
    );
    expect(screen.getByText(/Microphone permission denied/)).toBeDefined();
    expect(screen.getByText(/not-allowed/)).toBeDefined();

    rerender(
      <VoiceInputControl
        state="permission_denied"
        onStart={noop}
        onStop={noop}
        onCancel={noop}
        error="service-not-allowed"
      />
    );
    expect(screen.getByText(/service-not-allowed/)).toBeDefined();
  });

  it('shows the raw error code for the generic error state too', () => {
    render(<VoiceInputControl state="error" onStart={noop} onStop={noop} onCancel={noop} error="audio-capture" />);
    expect(screen.getByText(/Speech recognition error/)).toBeDefined();
    expect(screen.getByText(/audio-capture/)).toBeDefined();
  });

  it('falls back to the plain label when no error code is available', () => {
    render(<VoiceInputControl state="permission_denied" onStart={noop} onStop={noop} onCancel={noop} />);
    expect(screen.getByText('Microphone permission denied')).toBeDefined();
  });

  it('does not show an error code in normal states', () => {
    render(<VoiceInputControl state="idle" onStart={noop} onStop={noop} onCancel={noop} error="not-allowed" />);
    expect(screen.queryByText(/not-allowed/)).toBeNull();
  });

  it('renders the unsupported message distinctly, ignoring any error prop', () => {
    render(<VoiceInputControl state="unsupported" onStart={noop} onStop={noop} onCancel={noop} />);
    expect(screen.getByText(/not configured/)).toBeDefined();
  });
});
