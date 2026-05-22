import { useEffect } from 'react';
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (ws.mode === 'open' || ws.mode === 'pinned') {
          ws.dismiss();
          ctx.closeUltr0n();
        } else {
          ctx.openUltr0n();
          ws.open();
        }
      }
      if (e.key === 'Escape' && ws.mode === 'open') {
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
      />
    </>
  );
}
