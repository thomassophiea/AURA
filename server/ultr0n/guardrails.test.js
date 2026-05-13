import { describe, it, expect } from 'vitest';
import { isDisruptiveCall, checkGuardrails } from './guardrails.js';

describe('isDisruptiveCall', () => {
  it('flags AP reboot as disruptive', () => {
    expect(isDisruptiveCall('PUT', '/v1/aps/AP123/reboot')).toBe(true);
  });
  it('flags AP reset as disruptive', () => {
    expect(isDisruptiveCall('PUT', '/v1/aps/AP123/reset')).toBe(true);
  });
  it('flags AP upgrade as disruptive', () => {
    expect(isDisruptiveCall('PUT', '/v1/aps/AP123/upgrade')).toBe(true);
  });
  it('flags packet capture as disruptive', () => {
    expect(isDisruptiveCall('PUT', '/v1/aps/AP123/realcapture')).toBe(true);
  });
  it('flags log download as disruptive', () => {
    expect(isDisruptiveCall('PUT', '/v1/aps/AP123/logs')).toBe(true);
  });
  it('does not flag GET station as disruptive', () => {
    expect(isDisruptiveCall('GET', '/v1/stations/aa:bb:cc:dd:ee:ff')).toBe(false);
  });
  it('does not flag AP locate as disruptive', () => {
    expect(isDisruptiveCall('PUT', '/v1/aps/AP123/locate')).toBe(false);
  });
});

describe('checkGuardrails', () => {
  const readPlan = [{ method: 'GET', path: '/v1/stations/mac', disruptive: false }];
  const rebootPlan = [{ method: 'PUT', path: '/v1/aps/AP123/reboot', disruptive: true, description: 'Reboot AP' }];

  it('allows read-only plan without token', () => {
    const result = checkGuardrails(readPlan, undefined);
    expect(result.blocked).toBe(false);
  });
  it('blocks disruptive plan without token', () => {
    const result = checkGuardrails(rebootPlan, undefined);
    expect(result.blocked).toBe(true);
    expect(result.action).toBe('Reboot AP');
    expect(typeof result.confirmationToken).toBe('string');
  });
  it('allows disruptive plan with valid token', () => {
    const result = checkGuardrails(rebootPlan, 'some-token');
    expect(result.blocked).toBe(false);
  });
});
