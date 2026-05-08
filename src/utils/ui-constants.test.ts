import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TYPOGRAPHY,
  SPACING,
  CARD_STYLES,
  BUTTON_STYLES,
  STATUS,
  SEMANTIC_COLORS,
  TABLE_SEMANTIC,
  BADGE_STYLES,
  ICON_SIZES,
  TERMINOLOGY,
  LAYOUTS,
  TABLE_STYLES,
  STATES,
  ANIMATION,
  formatDateTime,
  formatMetric,
} from './ui-constants';

const allNonEmptyStrings = (obj: Record<string, unknown>) =>
  Object.values(obj).every((v) => typeof v === 'string' && v.length > 0);

describe('TYPOGRAPHY', () => {
  it('exposes all expected typography roles as non-empty class strings', () => {
    expect(allNonEmptyStrings(TYPOGRAPHY)).toBe(true);
    expect(TYPOGRAPHY.pageTitle).toMatch(/text-2xl/);
    expect(TYPOGRAPHY.metricLabel).toMatch(/uppercase/);
  });
});

describe('SPACING', () => {
  it('every spacing token is a non-empty class string', () => {
    expect(allNonEmptyStrings(SPACING)).toBe(true);
    expect(SPACING.pageContainer).toBe('p-6');
  });
});

describe('CARD_STYLES', () => {
  it('exposes base / interactive / header / body / footer / compact', () => {
    expect(allNonEmptyStrings(CARD_STYLES)).toBe(true);
    expect(CARD_STYLES.interactive).toMatch(/cursor-pointer/);
    expect(CARD_STYLES.compact).toMatch(/rounded-lg/);
  });
});

describe('BUTTON_STYLES', () => {
  it('all entries non-empty', () => {
    expect(allNonEmptyStrings(BUTTON_STYLES)).toBe(true);
  });
});

describe('STATUS', () => {
  it('each status variant has text/bg/border/icon classes', () => {
    for (const variant of ['healthy', 'warning', 'critical', 'info', 'neutral'] as const) {
      const v = STATUS[variant];
      expect(v.text).toMatch(/^text-/);
      expect(v.bg).toMatch(/^bg-/);
      expect(v.border).toMatch(/^border-/);
      expect(v.icon).toMatch(/^text-/);
    }
  });
});

describe('SEMANTIC_COLORS', () => {
  it('every entry references a CSS variable', () => {
    for (const value of Object.values(SEMANTIC_COLORS)) {
      expect(value).toMatch(/var\(--/);
    }
  });
});

describe('TABLE_SEMANTIC', () => {
  it('every entry references a --table-* CSS variable', () => {
    for (const value of Object.values(TABLE_SEMANTIC)) {
      expect(value).toMatch(/var\(--table-/);
    }
  });
});

describe('BADGE_STYLES', () => {
  it('every entry has bg + text + border classes', () => {
    for (const value of Object.values(BADGE_STYLES)) {
      expect(value).toMatch(/bg-/);
      expect(value).toMatch(/text-/);
      expect(value).toMatch(/border-/);
    }
  });
});

describe('ICON_SIZES', () => {
  it('all five sizes are h-* w-* class pairs', () => {
    for (const value of Object.values(ICON_SIZES)) {
      expect(value).toMatch(/^h-\d+ w-\d+$/);
    }
    expect(Object.keys(ICON_SIZES)).toEqual(['xs', 'sm', 'md', 'lg', 'xl']);
  });
});

describe('TERMINOLOGY', () => {
  it('all terminology values are non-empty user-facing strings', () => {
    expect(allNonEmptyStrings(TERMINOLOGY)).toBe(true);
    expect(TERMINOLOGY.accessPoint).toBe('Access Point');
    expect(TERMINOLOGY.accessPointShort).toBe('AP');
  });
});

describe('LAYOUTS', () => {
  it('grid layouts include responsive breakpoint prefixes', () => {
    expect(LAYOUTS.grid2Col).toMatch(/md:grid-cols-2/);
    expect(LAYOUTS.grid3Col).toMatch(/lg:grid-cols-3/);
    expect(LAYOUTS.grid4Col).toMatch(/lg:grid-cols-4/);
    expect(LAYOUTS.metricGrid).toMatch(/lg:grid-cols-4/);
  });
});

describe('TABLE_STYLES', () => {
  it('wrapper, table, header, and body are all defined', () => {
    expect(TABLE_STYLES.wrapper).toMatch(/rounded-xl/);
    expect(TABLE_STYLES.table).toBe('w-full');
    expect(TABLE_STYLES.headerCell).toMatch(/uppercase/);
  });
});

describe('STATES', () => {
  it('loading/error/empty are flexbox classes', () => {
    for (const value of Object.values(STATES)) {
      expect(value).toMatch(/^flex/);
    }
  });
});

describe('ANIMATION', () => {
  it('exposes ascending fast/normal/slow durations', () => {
    expect(ANIMATION.fast).toBeLessThan(ANIMATION.normal);
    expect(ANIMATION.normal).toBeLessThan(ANIMATION.slow);
  });
});

describe('formatDateTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-07T15:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('full() returns "Mon DD, YYYY at H:MM AM/PM"', () => {
    const out = formatDateTime.full('2026-05-01T14:30:00Z');
    expect(out).toMatch(/May 1, 2026/);
    expect(out).toMatch(/(AM|PM)/);
  });

  it('date() returns date-only string', () => {
    const out = formatDateTime.date('2026-05-01T14:30:00Z');
    expect(out).toBe('May 1, 2026');
  });

  it('time() returns time-only string', () => {
    const out = formatDateTime.time('2026-05-01T14:30:00Z');
    expect(out).toMatch(/(AM|PM)/);
  });

  it('iso() returns ISO 8601 string', () => {
    const out = formatDateTime.iso('2026-05-01T14:30:00Z');
    expect(out).toBe('2026-05-01T14:30:00.000Z');
  });

  it('relative() < 60s → "just now"', () => {
    expect(formatDateTime.relative(Date.now() - 10_000)).toBe('just now');
  });

  it('relative() minutes ago', () => {
    expect(formatDateTime.relative(Date.now() - 5 * 60_000)).toBe('5 minutes ago');
    expect(formatDateTime.relative(Date.now() - 1 * 60_000)).toBe('1 minute ago');
  });

  it('relative() hours ago', () => {
    expect(formatDateTime.relative(Date.now() - 2 * 3600_000)).toBe('2 hours ago');
    expect(formatDateTime.relative(Date.now() - 1 * 3600_000)).toBe('1 hour ago');
  });

  it('relative() days ago', () => {
    expect(formatDateTime.relative(Date.now() - 3 * 86_400_000)).toBe('3 days ago');
  });

  it('relative() ≥ 7d falls back to date()', () => {
    const out = formatDateTime.relative(Date.now() - 10 * 86_400_000);
    expect(out).toMatch(/2026/);
  });
});

describe('formatMetric', () => {
  describe('bytes', () => {
    it('returns "0 B" for 0', () => {
      expect(formatMetric.bytes(0)).toBe('0 B');
    });
    it('formats B/KB/MB/GB', () => {
      expect(formatMetric.bytes(512)).toBe('512.0 B');
      expect(formatMetric.bytes(2048)).toBe('2.0 KB');
      expect(formatMetric.bytes(5 * 1024 * 1024)).toBe('5.0 MB');
      expect(formatMetric.bytes(2 * 1024 ** 3)).toBe('2.0 GB');
    });
  });

  describe('bps', () => {
    it('returns "0 bps" for 0', () => {
      expect(formatMetric.bps(0)).toBe('0 bps');
    });
    it('formats bps/Kbps/Mbps/Gbps', () => {
      expect(formatMetric.bps(500)).toBe('500.0 bps');
      expect(formatMetric.bps(2000)).toBe('2.0 Kbps');
      expect(formatMetric.bps(5_000_000)).toBe('5.0 Mbps');
      expect(formatMetric.bps(2_000_000_000)).toBe('2.0 Gbps');
    });
  });

  it('number adds thousands separators', () => {
    expect(formatMetric.number(1234567)).toBe('1,234,567');
  });

  it('percentage defaults to 1 decimal', () => {
    expect(formatMetric.percentage(45.234)).toBe('45.2%');
    expect(formatMetric.percentage(45.234, 0)).toBe('45%');
    expect(formatMetric.percentage(45.234, 2)).toBe('45.23%');
  });

  describe('duration', () => {
    it('< 60s → "Ns"', () => {
      expect(formatMetric.duration(45)).toBe('45s');
    });
    it('< 1h → "Nm"', () => {
      expect(formatMetric.duration(120)).toBe('2m');
    });
    it('hours only', () => {
      expect(formatMetric.duration(3600)).toBe('1h');
      expect(formatMetric.duration(7200)).toBe('2h');
    });
    it('hours + minutes', () => {
      expect(formatMetric.duration(3600 + 30 * 60)).toBe('1h 30m');
    });
  });

  it('latency rounds to whole ms', () => {
    expect(formatMetric.latency(12.7)).toBe('13 ms');
    expect(formatMetric.latency(0)).toBe('0 ms');
  });

  it('signal renders dBm', () => {
    expect(formatMetric.signal(-45)).toBe('-45 dBm');
  });
});
