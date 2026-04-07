import { ExternalLink } from 'lucide-react';

interface DevEpicBadgeProps {
  epicKey: string;
  epicTitle: string;
  jiraUrl: string;
  /** Defaults to import.meta.env.DEV — pass explicitly in tests */
  show?: boolean;
}

export function DevEpicBadge({
  epicKey,
  epicTitle,
  jiraUrl,
  show = import.meta.env.DEV,
}: DevEpicBadgeProps) {
  if (!show) return null;
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
