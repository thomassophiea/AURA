import { describe, it, expect } from 'vitest';
import {
  normalizeStatus,
  statusDisplayLabel,
  statusTone,
  STATUS_TONES,
  STATUS_LABELS,
  STATUS_SEVERITY_ORDER,
  type SemanticStatus,
} from './statusColors';
import { STATUS_COLORS, STATUS_COLORS_LIGHT } from '../config/colorPalette';
import { getContrastRatio } from './colorValidator';

const ALL: SemanticStatus[] = ['healthy', 'warning', 'critical', 'offline', 'info', 'neutral'];

describe('normalizeStatus', () => {
  it('folds healthy vocabulary', () => {
    for (const raw of ['online', 'Connected', 'UP', 'InService', 'in service', 'In-Service', 'ok', 'Healthy']) {
      expect(normalizeStatus(raw), raw).toBe('healthy');
    }
  });

  it('folds warning vocabulary', () => {
    for (const raw of ['warning', 'Degraded', 'PENDING', 'minor', 'stale']) {
      expect(normalizeStatus(raw), raw).toBe('warning');
    }
  });

  it('folds critical vocabulary', () => {
    for (const raw of ['critical', 'Error', 'FAILED', 'major', 'malicious', 'poor']) {
      expect(normalizeStatus(raw), raw).toBe('critical');
    }
  });

  it('folds the wireless-assistant provisioning/confidence vocabulary', () => {
    for (const raw of ['completed', 'bound', 'HIGH']) {
      expect(normalizeStatus(raw), raw).toBe('healthy');
    }
    for (const raw of ['MEDIUM']) {
      expect(normalizeStatus(raw), raw).toBe('warning');
    }
    for (const raw of ['block', 'blocked', 'LOW']) {
      expect(normalizeStatus(raw), raw).toBe('critical');
    }
  });

  it('folds offline vocabulary — device state, not alarm severity', () => {
    for (const raw of ['offline', 'Disconnected', 'down', 'Inactive', 'unreachable', 'Out Of Service']) {
      expect(normalizeStatus(raw), raw).toBe('offline');
    }
  });

  it('treats empty/unknown/dash values as neutral', () => {
    for (const raw of [null, undefined, '', 'unknown', 'n/a', 'whatever-this-is']) {
      expect(normalizeStatus(raw)).toBe('neutral');
    }
  });

  it('handles snake/camel API values', () => {
    expect(normalizeStatus('IN_SERVICE')).toBe('healthy');
    expect(normalizeStatus('OUT_OF_SERVICE')).toBe('offline');
  });
});

describe('statusDisplayLabel', () => {
  it('rewrites machine-speak into canonical labels', () => {
    expect(statusDisplayLabel('InService')).toBe('Online');
    expect(statusDisplayLabel('inservice')).toBe('Online');
    expect(statusDisplayLabel('up')).toBe('Online');
    expect(statusDisplayLabel('-')).toBe('Unknown');
  });

  it('keeps already-presentable labels verbatim', () => {
    expect(statusDisplayLabel('Online')).toBe('Online');
    expect(statusDisplayLabel('Needs Attention')).toBe('Needs Attention');
  });
});

describe('STATUS_TONES', () => {
  it('covers every semantic status with a complete tone', () => {
    for (const s of ALL) {
      const tone = STATUS_TONES[s];
      expect(tone.text).toContain('--status-');
      expect(tone.bg).toContain('--status-');
      expect(tone.dot).toContain('--status-');
      expect(tone.color).toContain('--status-');
      expect(tone.badgeVariant).toBeTruthy();
    }
  });

  it('statusTone routes through normalizeStatus', () => {
    expect(statusTone('InService')).toBe(STATUS_TONES.healthy);
    expect(statusTone(undefined)).toBe(STATUS_TONES.neutral);
  });

  it('labels and severity order cover the vocabulary', () => {
    for (const s of ALL) {
      expect(STATUS_LABELS[s]).toBeTruthy();
      expect(STATUS_SEVERITY_ORDER[s]).toBeGreaterThanOrEqual(0);
    }
    expect(STATUS_SEVERITY_ORDER.critical).toBeLessThan(STATUS_SEVERITY_ORDER.healthy);
  });
});

describe('offline/neutral palette additions — measured contrast', () => {
  const EP1_BASE = '#1e1f2a';
  const EP1_CARD = '#2d2f3e';
  const WHITE = '#ffffff';

  it('offline clears AA text on dark base and card', () => {
    expect(getContrastRatio(STATUS_COLORS.offline, EP1_BASE)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(STATUS_COLORS.offline, EP1_CARD)).toBeGreaterThanOrEqual(4.5);
  });

  it('neutral clears AA text on dark base and 3:1 non-text on card', () => {
    expect(getContrastRatio(STATUS_COLORS.neutral, EP1_BASE)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(STATUS_COLORS.neutral, EP1_CARD)).toBeGreaterThanOrEqual(3);
  });

  it('light variants clear AA text on white', () => {
    expect(getContrastRatio(STATUS_COLORS_LIGHT.offline, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(STATUS_COLORS_LIGHT.neutral, WHITE)).toBeGreaterThanOrEqual(4.5);
  });
});
