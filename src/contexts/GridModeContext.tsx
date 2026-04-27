import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

const STORAGE_KEY = 'aura_grid_mode';

interface GridModeContextValue {
  agGridEnabled: boolean;
  toggleGridMode: () => void;
}

const GridModeContext = createContext<GridModeContextValue>({
  agGridEnabled: false,
  toggleGridMode: () => {},
});

export function GridModeProvider({ children }: { children: ReactNode }) {
  const [agGridEnabled, setAgGridEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(agGridEnabled));
    } catch {
      // ignore
    }
  }, [agGridEnabled]);

  const toggleGridMode = () => setAgGridEnabled((prev) => !prev);

  return (
    <GridModeContext.Provider value={{ agGridEnabled, toggleGridMode }}>
      {children}
    </GridModeContext.Provider>
  );
}

export function useGridMode() {
  return useContext(GridModeContext);
}
