/**
 * Site Group Settings — per-site-group configuration preferences.
 */

export interface SiteGroupSettings {
  connection: {
    timeout_ms: number;
    retry_count: number;
    preferred_protocol: 'https' | 'http';
  };
  deployment: {
    auto_deploy: boolean;
    deployment_mode: 'create_only' | 'create_or_update';
    notify_on_failure: boolean;
  };
  custom: Record<string, unknown>;
}

export const DEFAULT_SITE_GROUP_SETTINGS: SiteGroupSettings = {
  connection: {
    timeout_ms: 10000,
    retry_count: 3,
    preferred_protocol: 'https',
  },
  deployment: {
    auto_deploy: false,
    deployment_mode: 'create_or_update',
    notify_on_failure: true,
  },
  custom: {},
};
