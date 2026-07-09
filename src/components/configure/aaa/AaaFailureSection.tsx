/**
 * Reauthentication & failure-handling section of the AAA editor (parity
 * A2/A3/A4): Override Reauthentication Timeout maps to reauthTimeoutOvr
 * (0 = off, 60-300 when on) and Deny-on-auth-failure maps to the NULLABLE
 * denyOnAuthFailure object (null = off; attempts 1-10 / interval 1-10 /
 * timeout 1-300 when on).
 */
import React from 'react';
import { Section } from '../_kit';
import { NumberField, SwitchField } from './fields';
import {
  isDenyEnabled,
  isReauthEnabled,
  setDenyEnabled,
  setReauthEnabled,
  type AaaPolicyForm,
  type DenyOnAuthFailureForm,
} from './aaaModel';

export interface AaaFailureSectionProps {
  form: AaaPolicyForm;
  errs: Record<string, string>;
  disabled: boolean;
  setForm: React.Dispatch<React.SetStateAction<AaaPolicyForm>>;
}

export function AaaFailureSection({ form, errs, disabled, setForm }: AaaFailureSectionProps) {
  const denyOn = isDenyEnabled(form);
  const reauthOn = isReauthEnabled(form);
  const updDeny = (patch: Partial<DenyOnAuthFailureForm>) =>
    setForm((prev) =>
      prev.denyOnAuthFailure
        ? { ...prev, denyOnAuthFailure: { ...prev.denyOnAuthFailure, ...patch } }
        : prev
    );

  return (
    <Section title="Reauthentication & Failure Handling">
      <SwitchField
        label="Override Reauthentication Timeout"
        description="0 disables the override on the controller"
        checked={reauthOn}
        onChange={(v) => setForm((prev) => setReauthEnabled(prev, v))}
        disabled={disabled}
      />
      {reauthOn && (
        <NumberField
          label="Reauthentication Timeout (seconds)"
          value={form.reauthTimeoutOvr}
          onChange={(v) => setForm((prev) => ({ ...prev, reauthTimeoutOvr: v }))}
          min={60}
          max={300}
          error={errs.reauth}
          disabled={disabled}
          required
        />
      )}
      <SwitchField
        label="Deny on repeated failed Authentications"
        checked={denyOn}
        onChange={(v) => setForm((prev) => setDenyEnabled(prev, v))}
        disabled={disabled}
      />
      {denyOn && form.denyOnAuthFailure && (
        <>
          <NumberField
            label="Consecutive failed Authentications"
            value={form.denyOnAuthFailure.attempts}
            onChange={(v) => updDeny({ attempts: v })}
            min={1}
            max={10}
            error={errs.denyAttempts}
            disabled={disabled}
            required
          />
          <NumberField
            label="Elapsed time for failed Authentications (seconds)"
            value={form.denyOnAuthFailure.interval}
            onChange={(v) => updDeny({ interval: v })}
            min={1}
            max={10}
            error={errs.denyInterval}
            disabled={disabled}
            required
          />
          <NumberField
            label="Quiet Timeout (seconds)"
            value={form.denyOnAuthFailure.timeout}
            onChange={(v) => updDeny({ timeout: v })}
            min={1}
            max={300}
            error={errs.denyTimeout}
            disabled={disabled}
            required
          />
        </>
      )}
    </Section>
  );
}
