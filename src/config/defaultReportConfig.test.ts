import { describe, it, expect } from 'vitest';
import { DEFAULT_REPORT_CONFIG, getWidgetKeysForConfig } from './defaultReportConfig';
import type { ReportConfig } from '../types/reportConfig';

describe('DEFAULT_REPORT_CONFIG', () => {
  it('has 8 default pages', () => {
    expect(DEFAULT_REPORT_CONFIG.pages.length).toBe(8);
  });

  it('every page has id/title/widgets and at least one widget', () => {
    for (const page of DEFAULT_REPORT_CONFIG.pages) {
      expect(page.id).toBeTruthy();
      expect(page.title).toBeTruthy();
      expect(page.icon).toBeTruthy();
      expect(page.category).toBeTruthy();
      expect(Array.isArray(page.widgets)).toBe(true);
      expect(page.widgets.length).toBeGreaterThan(0);
    }
  });

  it('every widget has unique id within its page', () => {
    for (const page of DEFAULT_REPORT_CONFIG.pages) {
      const ids = page.widgets.map((w) => w.id);
      const dedup = new Set(ids);
      expect(dedup.size).toBe(ids.length);
    }
  });

  it('every widget belongs to one of the documented sources', () => {
    for (const page of DEFAULT_REPORT_CONFIG.pages) {
      for (const widget of page.widgets) {
        expect(['metric_computed', 'platform_report']).toContain(widget.source);
      }
    }
  });

  it('source = metric_computed iff widgetKey starts with "_metric_"', () => {
    for (const page of DEFAULT_REPORT_CONFIG.pages) {
      for (const widget of page.widgets) {
        const isComputedKey = widget.widgetKey.startsWith('_metric_');
        if (isComputedKey) {
          expect(widget.source).toBe('metric_computed');
        } else {
          expect(widget.source).toBe('platform_report');
        }
      }
    }
  });

  it('every widget has a valid gridSpan in [1,2,3,4]', () => {
    for (const page of DEFAULT_REPORT_CONFIG.pages) {
      for (const widget of page.widgets) {
        expect([1, 2, 3, 4]).toContain(widget.gridSpan);
      }
    }
  });

  it('default config has its top-level metadata set', () => {
    expect(DEFAULT_REPORT_CONFIG.id).toBe('default');
    expect(DEFAULT_REPORT_CONFIG.name).toBe('Network Report');
    expect(DEFAULT_REPORT_CONFIG.isDefault).toBe(true);
    expect(DEFAULT_REPORT_CONFIG.duration).toBe('24H');
  });
});

describe('getWidgetKeysForConfig', () => {
  it('returns only platform_report widget keys, deduplicated', () => {
    const keys = getWidgetKeysForConfig(DEFAULT_REPORT_CONFIG);
    expect(Array.isArray(keys)).toBe(true);
    expect(keys.length).toBeGreaterThan(0);
    // Every key in the list should NOT have the "_metric_" prefix
    for (const key of keys) {
      expect(key.startsWith('_metric_')).toBe(false);
    }
    // Dedup
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('returns the empty list for a config with no platform widgets', () => {
    const config: ReportConfig = {
      id: 'empty',
      name: 'X',
      description: '',
      createdAt: 0,
      updatedAt: 0,
      duration: '24H',
      pages: [
        {
          id: 'p',
          title: 'P',
          description: '',
          icon: 'X',
          category: 'overview',
          widgets: [
            {
              id: 'm1',
              widgetKey: '_metric_x',
              source: 'metric_computed',
              displayType: 'scorecard',
              gridSpan: 1,
            },
          ],
        },
      ],
    };
    expect(getWidgetKeysForConfig(config)).toEqual([]);
  });
});
