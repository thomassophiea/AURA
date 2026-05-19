import { useCallback, useRef, useState } from 'react';

// Dev mode is no longer reachable from the theme cycle. Entry: tap the
// brand logo TAP_THRESHOLD times within TAP_WINDOW_MS, then enter the PIN.
// This is a casual-access barrier (the bundle is client-side, so anyone
// with devtools can bypass it) — its job is to keep dev tooling out of
// sight during customer demos, not to gate sensitive data.
const STORAGE_KEY = 'dev_mode_unlocked';
const TAP_THRESHOLD = 7;
const TAP_WINDOW_MS = 3000;
const PIN = '8675309';

export interface DevModeUnlock {
  isUnlocked: boolean;
  pinPromptOpen: boolean;
  closePinPrompt: () => void;
  registerBrandTap: () => void;
  attemptUnlock: (pin: string) => boolean;
  lock: () => void;
}

function readInitial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useDevModeUnlock(): DevModeUnlock {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(readInitial);
  const [pinPromptOpen, setPinPromptOpen] = useState(false);
  const tapsRef = useRef<number[]>([]);

  const registerBrandTap = useCallback(() => {
    if (isUnlocked) return;
    const now = Date.now();
    tapsRef.current = [...tapsRef.current.filter((t) => now - t < TAP_WINDOW_MS), now];
    if (tapsRef.current.length >= TAP_THRESHOLD) {
      tapsRef.current = [];
      setPinPromptOpen(true);
    }
  }, [isUnlocked]);

  const attemptUnlock = useCallback((pin: string) => {
    if (pin !== PIN) return false;
    setIsUnlocked(true);
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      /* ignore */
    }
    setPinPromptOpen(false);
    return true;
  }, []);

  const lock = useCallback(() => {
    setIsUnlocked(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    tapsRef.current = [];
  }, []);

  const closePinPrompt = useCallback(() => setPinPromptOpen(false), []);

  return { isUnlocked, pinPromptOpen, closePinPrompt, registerBrandTap, attemptUnlock, lock };
}
