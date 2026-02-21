import { useEffect, useCallback } from 'react';

interface ShortcutHandler {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  handler: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: ShortcutHandler[], enabled: boolean = true) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;
    
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }
    
    for (const shortcut of shortcuts) {
      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
      const ctrlMatch = shortcut.ctrlKey ? event.ctrlKey : !event.ctrlKey;
      const metaMatch = shortcut.metaKey ? event.metaKey : !event.metaKey;
      const shiftMatch = shortcut.shiftKey ? event.shiftKey : !event.shiftKey;
      const altMatch = shortcut.altKey ? event.altKey : !event.altKey;
      
      const cmdOrCtrl = (shortcut.ctrlKey || shortcut.metaKey) && (event.ctrlKey || event.metaKey);
      
      if (keyMatch && (cmdOrCtrl || (ctrlMatch && metaMatch)) && shiftMatch && altMatch) {
        event.preventDefault();
        shortcut.handler();
        break;
      }
    }
  }, [shortcuts, enabled]);
  
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export const defaultShortcuts = {
  goToDashboard: { key: 'd', metaKey: true },
  goToClients: { key: 'c', metaKey: true },
  goToAccessPoints: { key: 'a', metaKey: true },
  goToNetworks: { key: 'n', metaKey: true },
  search: { key: 'k', metaKey: true },
  refresh: { key: 'r', metaKey: true },
  help: { key: '/', shiftKey: true }
};
