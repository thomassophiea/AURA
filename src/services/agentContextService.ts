/**
 * Agent context service — builds a live session snapshot and writes it to
 * .aura-session.md on the server (via POST /api/cortex/shell/context) so
 * Claude reads it silently through the @.aura-session.md import in CLAUDE.md.
 *
 * Also persists to localStorage so context survives page reloads and works
 * independently per browser/user session.
 */

import { getGlobalFilters } from '../hooks/useGlobalFilters';

const LS_KEY = 'aura_agent_context';

interface ContextInput {
  navigationScope: string;
  siteGroupName?: string;
  controllerUrl?: string;
}

async function fetchClientCount(): Promise<number | null> {
  try {
    const token = localStorage.getItem('access_token') ?? '';
    if (!token) return null;
    const res = await fetch('/api/management/v1/stations?limit=500&fields=mac', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data.length : null;
  } catch {
    return null;
  }
}

async function fetchAPSummary(): Promise<{ total: number; up: number } | null> {
  try {
    const token = localStorage.getItem('access_token') ?? '';
    if (!token) return null;
    const res = await fetch('/api/management/v1/aps/query?fields=status,clientCount&limit=500', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const aps: { status?: string; clientCount?: number }[] = Array.isArray(data) ? data : [];
    const up = aps.filter((a) => a.status === 'connected' || a.status === 'up').length;
    return { total: aps.length, up };
  } catch {
    return null;
  }
}

function buildMarkdown(
  input: ContextInput,
  clients: number | null,
  aps: { total: number; up: number } | null
): string {
  const f = getGlobalFilters();
  const ts = new Date().toISOString();

  const lines = [
    `## AURA Live Session Context`,
    `> Auto-generated ${ts} — do not edit manually.`,
    ``,
    `| Field | Value |`,
    `|---|---|`,
    `| URL | ${window.location.pathname} |`,
    `| Scope | ${input.navigationScope} |`,
    `| Site Group | ${input.siteGroupName ?? 'none'} |`,
    `| Controller | ${input.controllerUrl ?? 'none'} |`,
    `| Time Range | ${f.timeRange} |`,
    ...(f.site && f.site !== 'all' ? [`| Site Filter | ${f.site} |`] : []),
    ...(f.environment && f.environment !== 'all' ? [`| Environment | ${f.environment} |`] : []),
    ...(clients !== null ? [`| Connected Clients | ${clients} |`] : []),
    ...(aps !== null ? [`| Access Points | ${aps.up} up / ${aps.total} total |`] : []),
  ];

  return lines.join('\n');
}

export async function writeAgentContext(input: ContextInput): Promise<void> {
  const [clients, aps] = await Promise.all([fetchClientCount(), fetchAPSummary()]);
  const markdown = buildMarkdown(input, clients, aps);

  // Persist locally so it survives reloads
  try {
    localStorage.setItem(LS_KEY, markdown);
  } catch {
    // storage full — ignore
  }

  // Write to server so Claude reads it via CLAUDE.md @import at startup
  try {
    const token = localStorage.getItem('access_token') ?? '';
    await fetch('/api/cortex/shell/context', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ markdown }),
    });
  } catch {
    // non-fatal — Claude will use stale context if file already exists
  }
}
