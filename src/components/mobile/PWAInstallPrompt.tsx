/**
 * PWAInstallPrompt - Bottom sheet prompt for PWA installation
 */

import React from 'react';
import { Download, X } from 'lucide-react';

interface PWAInstallPromptProps {
  onInstall: () => void;
  onDismiss: () => void;
}

export function PWAInstallPrompt({ onInstall, onDismiss }: PWAInstallPromptProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom duration-300">
      <div
        className="mx-4 mb-4 rounded-2xl border border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="p-4">
          <div className="flex items-start gap-4">
            {/* App Icon */}
            <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-7 h-7 text-white"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-foreground">
                Install AURA for quick access
              </h3>
              <p className="mt-1 text-sm text-muted-foreground leading-snug">
                Add to your home screen for faster loading and offline access
              </p>
            </div>

            {/* Close button */}
            <button
              onClick={onDismiss}
              className="flex-shrink-0 -mt-1 -mr-1 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 mt-4">
            <button
              onClick={onDismiss}
              className="flex-1 py-2.5 px-4 rounded-xl text-sm font-medium text-muted-foreground bg-muted/50 hover:bg-muted transition-colors"
            >
              Maybe Later
            </button>
            <button
              onClick={onInstall}
              className="flex-1 py-2.5 px-4 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 transition-all shadow-md flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Install
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
