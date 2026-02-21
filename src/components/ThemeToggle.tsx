import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Sun, Moon, Monitor, Palmtree } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  
  const getIcon = () => {
    if (resolvedTheme === 'synthwave') return <Palmtree className="h-4 w-4" />;
    if (resolvedTheme === 'dark') return <Moon className="h-4 w-4" />;
    return <Sun className="h-4 w-4" />;
  };
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
          {getIcon()}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="h-4 w-4 mr-2" />
          Light
          {theme === 'light' && ' ✓'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="h-4 w-4 mr-2" />
          Dark
          {theme === 'dark' && ' ✓'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('synthwave')}>
          <Palmtree className="h-4 w-4 mr-2" />
          Miami Vice
          {theme === 'synthwave' && ' ✓'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Monitor className="h-4 w-4 mr-2" />
          System
          {theme === 'system' && ' ✓'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeToggleSimple() {
  const { toggleTheme, isDark } = useTheme();
  
  return (
    <Button variant="ghost" size="sm" onClick={toggleTheme} className="h-9 w-9 p-0">
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
