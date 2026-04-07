import { ExternalLink } from 'lucide-react';
import { useIsDevTheme } from '@/contexts/PersonaContext';

interface DevEpicBadgeProps {
  epicKey: string;
  epicTitle: string;
  jiraUrl: string;
  /** Defaults to true in dev build or when the "dev" theme is active — pass explicitly in tests */
  show?: boolean;
}

export function DevEpicBadge({
  epicKey,
  epicTitle,
  jiraUrl,
  show,
}: DevEpicBadgeProps) {
  const isDevTheme = useIsDevTheme();
  const visible = show ?? (import.meta.env.DEV || isDevTheme);
  if (!visible) return null;
  return (
    <a
      href={jiraUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs font-mono text-blue-400 hover:text-blue-300 border border-blue-500/30 rounded px-2 py-0.5 bg-blue-500/10 transition-colors"
    >
      <span className="font-semibold">{epicKey}</span>
      <span className="text-blue-400/50">·</span>
      <span className="font-sans font-normal">{epicTitle}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}
