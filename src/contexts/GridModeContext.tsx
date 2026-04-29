import { createContext, useContext, type ReactNode } from 'react';

interface GridModeContextValue {
  agGridEnabled: boolean;
  /** Retained for backwards compatibility; legacy tables have been retired so this is now a no-op. */
  toggleGridMode: () => void;
}

const GridModeContext = createContext<GridModeContextValue>({
  agGridEnabled: true,
  toggleGridMode: () => {},
});

export function GridModeProvider({ children }: { children: ReactNode }) {
  return (
    <GridModeContext.Provider value={{ agGridEnabled: true, toggleGridMode: () => {} }}>
      {children}
    </GridModeContext.Provider>
  );
}

export function useGridMode() {
  return useContext(GridModeContext);
}
