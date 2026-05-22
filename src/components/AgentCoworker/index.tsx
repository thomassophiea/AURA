import { useEffect, useState } from 'react';
import { AgentCommandBar } from './AgentCommandBar';
import { AgentWorkspace } from './AgentWorkspace';
import { useAgentWorkspace } from './useAgentWorkspace';
import { useUltronContext } from '../../contexts/UltronContext';

// Detail-panel callbacks are preserved for the App.tsx mount signature but
// are no longer wired — the LLM coworker that surfaced these is gone in
// Dev mode.
interface AgentCoworkerProps {
  onShowClientDetail?: (mac: string, name?: string) => void;
  onShowAccessPointDetail?: (serial: string, name?: string) => void;
  onShowSiteDetail?: (siteId: string, siteName: string) => void;
}

export function AgentCoworker(_props: AgentCoworkerProps) {
  const ws = useAgentWorkspace();
  const ctx = useUltronContext();
  const [driftCount, setDriftCount] = useState(0);

  useEffect(() => {
    const OPS_PANEL_KEYS: Record<string, Parameters<typeof ws.setActivePanel>[0]> = {
      '1': 'conversation',
      '2': 'validate',
      '3': 'drift',
      '4': 'execution',
      '5': 'diff',
      '6': 'audit',
      '7': 'timeline',
    };

    const handler = (e: KeyboardEvent) => {
      const isOpen = ws.mode === 'open' || ws.mode === 'pinned';

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          ws.dismiss();
          ctx.closeUltr0n();
        } else {
          ctx.openUltr0n();
          ws.open();
        }
        return;
      }

      if (!isOpen) return;

      // ⌘1 / Ctrl+1 → Terminal tab, ⌘2 / Ctrl+2 → Ops tab
      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault();
        ws.setPrimaryTab('terminal');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault();
        ws.setPrimaryTab('ops');
        return;
      }

      // 1–7 without modifier → Ops sub-panel (only when Ops tab is active)
      if (!e.metaKey && !e.ctrlKey && !e.altKey && ws.primaryTab === 'ops') {
        const panel = OPS_PANEL_KEYS[e.key];
        if (
          panel &&
          !(e.target instanceof HTMLInputElement) &&
          !(e.target instanceof HTMLTextAreaElement)
        ) {
          e.preventDefault();
          ws.setActivePanel(panel);
          return;
        }
      }

      if (e.key === 'Escape') {
        ctx.closeUltr0n();
        ws.dismiss();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [ctx, ws]);

  return (
    <>
      {ws.mode === 'idle' && (
        <AgentCommandBar
          onOpen={() => {
            ctx.openUltr0n();
            ws.open();
          }}
          driftCount={driftCount}
        />
      )}

      <AgentWorkspace
        mode={ws.mode}
        size={ws.size}
        primaryTab={ws.primaryTab}
        activePanel={ws.activePanel}
        onClose={() => {
          ws.dismiss();
          ctx.closeUltr0n();
        }}
        onMinimize={ws.minimize}
        onPin={ws.pin}
        onDismiss={() => {
          ws.dismiss();
          ctx.closeUltr0n();
        }}
        onSetSize={ws.setSize}
        onSetPrimaryTab={ws.setPrimaryTab}
        onSetActivePanel={ws.setActivePanel}
        onDriftCount={setDriftCount}
      />
    </>
  );
}
