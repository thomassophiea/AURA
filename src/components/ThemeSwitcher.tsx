import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Palette } from 'lucide-react';
import { applyTheme, getStoredTheme, themes, type ThemeMode } from '../lib/themes';

export function ThemeSwitcher() {
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(getStoredTheme());
  const [showHighDialog, setShowHighDialog] = useState(false);

  useEffect(() => {
    // Apply theme on mount
    applyTheme(currentTheme);
  }, []);

  const handleThemeChange = (theme: ThemeMode) => {
    // Show "Are you high?" dialog when switching to Hello Kitty mode
    if (theme === 'hello-kitty' && currentTheme !== 'hello-kitty') {
      setShowHighDialog(true);
    }

    setCurrentTheme(theme);
    applyTheme(theme);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="relative">
            <Palette className="h-5 w-5" />
            <span className="absolute -top-1 -right-1 text-xs">
              {themes[currentTheme].emoji}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <div className="px-2 py-1.5 text-sm font-semibold">Choose Theme</div>
          {(Object.keys(themes) as ThemeMode[]).map((themeKey) => {
            const theme = themes[themeKey];
            return (
              <DropdownMenuItem
                key={themeKey}
                onClick={() => handleThemeChange(themeKey)}
                className={`flex items-center justify-between cursor-pointer ${
                  currentTheme === themeKey ? 'bg-accent' : ''
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-lg">{theme.emoji}</span>
                  <span>{theme.displayName}</span>
                </span>
                {currentTheme === themeKey && (
                  <span className="text-xs">✓</span>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* "Are you high?" dialog for Hello Kitty mode */}
      <AlertDialog open={showHighDialog} onOpenChange={setShowHighDialog}>
        <AlertDialogContent className="bg-gradient-to-br from-pink-50 to-pink-100 border-4 border-pink-300">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-3xl text-center">
              🎀 Hello Kitty Mode Activated! 🎀
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xl text-center py-4">
              <div className="space-y-3">
                <div className="text-4xl">😺✨💕</div>
                <div className="text-2xl font-bold text-pink-600">
                  Are you high? 🌿
                </div>
                <div className="text-sm text-pink-500">
                  (It's okay, we don't judge! Everything is kawaii here! 🎀)
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-3 sm:gap-3">
            <AlertDialogCancel className="bg-pink-200 hover:bg-pink-300 border-pink-400">
              Maybe... 😳
            </AlertDialogCancel>
            <AlertDialogAction className="bg-gradient-to-r from-pink-400 to-pink-600 hover:from-pink-500 hover:to-pink-700 text-white">
              Yes! 🌈✨
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
