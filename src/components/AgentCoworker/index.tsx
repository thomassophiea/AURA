import { useEffect, useState } from 'react';
import { AgentCommandBar } from './AgentCommandBar';
import { AgentWorkspace } from './AgentWorkspace';
import { useAgentWorkspace } from './useAgentWorkspace';
import { useCortexContext } from '../../contexts/CortexContext';
import { markCortexAvailable, CORTEX_DIAGNOSE_EVENT } from '../../lib/cortexLauncher';

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
  const ctx = useCortexContext();
  const [driftCount, setDriftCount] = useState(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isOpen = ws.mode === 'open' || ws.mode === 'pinned';

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          ws.dismiss();
          ctx.closeCortex();
        } else {
          ctx.openCortex();
          ws.open();
        }
        return;
      }

      if (isOpen && e.key === 'Escape') {
        ctx.closeCortex();
        ws.dismiss();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [ctx, ws]);

  // Let distant pages (alert rows, detail panels) open the workspace — the
  // prompt itself is picked up and routed (read-only vs. WLAN configuration)
  // by WirelessAssistantPanel's own CORTEX_DIAGNOSE_EVENT listener, which is
  // always mounted once the workspace exists.
  useEffect(() => {
    markCortexAvailable(true);
    const diagnose = (e: Event) => {
      const prompt = (e as CustomEvent).detail?.prompt;
      if (typeof prompt !== 'string' || !prompt) return;
      ctx.openCortex();
      ws.open();
    };
    window.addEventListener(CORTEX_DIAGNOSE_EVENT, diagnose);
    return () => {
      markCortexAvailable(false);
      window.removeEventListener(CORTEX_DIAGNOSE_EVENT, diagnose);
    };
  }, [ctx, ws]);

  return (
    <>
      {ws.mode === 'idle' && (
        <AgentCommandBar
          onOpen={() => {
            ctx.openCortex();
            ws.open();
          }}
          driftCount={driftCount}
        />
      )}

      <AgentWorkspace
        mode={ws.mode}
        size={ws.size}
        onClose={() => {
          ws.dismiss();
          ctx.closeCortex();
        }}
        onMinimize={ws.minimize}
        onPin={ws.pin}
        onDismiss={() => {
          ws.dismiss();
          ctx.closeCortex();
        }}
        onSetSize={ws.setSize}
        onDriftCount={setDriftCount}
      />
    </>
  );
}
