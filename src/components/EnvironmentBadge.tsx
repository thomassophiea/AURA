import { useEffect, useState } from 'react';

/**
 * Which deployment you are looking at.
 *
 * Integration and Production Demo are visually identical, which is a real
 * hazard during a demo: it is entirely possible to revoke a guest in the wrong
 * environment, or to demo from the environment that is mid-deploy. This chip
 * removes the ambiguity without turning the header into a warning banner.
 *
 * It renders only when the server declares an environment explicitly
 * (`AURA_ENVIRONMENT` set), so local development stays uncluttered and both
 * deployed environments are always labelled.
 */

interface SystemVersion {
  environment: 'integration' | 'production';
  shortLabel: string;
  label: string;
  explicit: boolean;
  commit?: string;
  branch?: string;
  releaseTag?: string | null;
}

export function EnvironmentBadge() {
  const [info, setInfo] = useState<SystemVersion | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/system/version', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SystemVersion | null) => {
        if (data?.explicit) setInfo(data);
      })
      // A missing or failing endpoint must never break the header — an older
      // server simply has no chip.
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (!info) return null;

  const isProduction = info.environment === 'production';
  const tooltip = [
    info.label,
    info.releaseTag ? `release ${info.releaseTag}` : null,
    info.commit ? `commit ${info.commit}` : null,
    info.branch ? `branch ${info.branch}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <span
      title={tooltip}
      data-environment={info.environment}
      className={
        'text-xs font-semibold rounded px-2 py-0.5 border ' +
        (isProduction
          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400'
          : 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400')
      }
      style={{ letterSpacing: '0.08em', flexShrink: 0 }}
    >
      {info.shortLabel}
    </span>
  );
}
