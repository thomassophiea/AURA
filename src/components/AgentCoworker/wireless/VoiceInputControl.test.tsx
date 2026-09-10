import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VoiceInputControl } from './VoiceInputControl';

const noop = () => {};

/**
 * The point of these tests is that the four ways voice can fail are NOT
 * interchangeable. Before this, every one of them rendered "Microphone
 * permission denied", which sent operators into their browser settings to fix
 * a Permissions-Policy response header they could not see and could not change.
 */
describe('VoiceInputControl', () => {
  it('shows Talk when idle', () => {
    render(<VoiceInputControl state="idle" onStart={noop} onStop={noop} onCancel={noop} />);
    // The button and the status label both read "Talk" in this state, so query
    // the control by role rather than by text.
    expect(screen.getByRole('button', { name: /Talk/i })).toBeDefined();
  });

  it('offers Stop and Cancel while listening', () => {
    render(<VoiceInputControl state="listening" onStart={noop} onStop={noop} onCancel={noop} />);
    expect(screen.getByText('Stop')).toBeDefined();
    expect(screen.getByText('Cancel')).toBeDefined();
  });

  describe('failure modes are distinguished', () => {
    it('a user-blocked microphone points at the browser padlock', () => {
      render(
        <VoiceInputControl state="permission_denied" onStart={noop} onStop={noop} onCancel={noop} />
      );
      expect(screen.getByText(/Microphone blocked in your browser/)).toBeDefined();
      expect(screen.getByText(/padlock in the address bar/)).toBeDefined();
    });

    it('a policy block says it is a server setting, NOT a browser one', () => {
      // This is the case that was previously mislabelled. The operator must be
      // told not to go hunting in their own settings.
      render(
        <VoiceInputControl state="blocked_by_policy" onStart={noop} onStop={noop} onCancel={noop} />
      );
      expect(screen.getByText(/Microphone disabled for this site/)).toBeDefined();
      const guidance = screen.getByText(/server setting rather than a browser one/);
      expect(guidance).toBeDefined();
      expect(guidance.textContent).toMatch(/Permissions-Policy/);
      // It must NOT tell them to change a browser permission.
      expect(screen.queryByText(/padlock in the address bar/)).toBeNull();
    });

    it('an insecure context names HTTPS as the cause', () => {
      render(
        <VoiceInputControl state="insecure_context" onStart={noop} onStop={noop} onCancel={noop} />
      );
      expect(screen.getByText(/Voice needs an HTTPS connection/)).toBeDefined();
      expect(screen.getByText(/unavailable on plain HTTP/)).toBeDefined();
    });

    it('missing hardware is reported as missing hardware', () => {
      render(
        <VoiceInputControl state="no_microphone" onStart={noop} onStop={noop} onCancel={noop} />
      );
      expect(screen.getByText(/No microphone found/)).toBeDefined();
      expect(screen.getByText(/Connect a microphone/)).toBeDefined();
    });

    it('an unsupported browser names the browsers that do work', () => {
      render(
        <VoiceInputControl state="unsupported" onStart={noop} onStop={noop} onCancel={noop} />
      );
      expect(screen.getByText(/Chrome, Edge and Safari support speech recognition/)).toBeDefined();
      // Text input must be advertised as still working.
      expect(screen.getByText(/Text input works normally/)).toBeDefined();
    });

    it('prefers the specific reason over a raw browser code', () => {
      render(
        <VoiceInputControl
          state="unsupported"
          onStart={noop}
          onStop={noop}
          onCancel={noop}
          error="This browser has no built-in speech recognition."
        />
      );
      expect(screen.getByText(/no built-in speech recognition/)).toBeDefined();
    });

    it('falls back to the raw code only when there is no better guidance', () => {
      render(
        <VoiceInputControl
          state="error"
          onStart={noop}
          onStop={noop}
          onCancel={noop}
          error="network"
        />
      );
      expect(screen.getByText('Speech recognition error')).toBeDefined();
      expect(screen.getByText('network')).toBeDefined();
    });

    it('does not show error guidance in a healthy state', () => {
      render(
        <VoiceInputControl
          state="idle"
          onStart={noop}
          onStop={noop}
          onCancel={noop}
          error="not-allowed"
        />
      );
      // A stale error string must not leak into the idle label.
      expect(screen.queryByText(/padlock/)).toBeNull();
      expect(screen.getByRole('button', { name: /Talk/i })).toBeDefined();
    });
  });
});
