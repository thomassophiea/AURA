import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { initVersionGate, getAppVersion, getCacheVersion } from "./lib/versionGate.ts";
import "./styles/globals.css";
import "./index.css";

/**
 * Remove the boot surface after app hydration
 * Fades out smoothly then removes from DOM
 */
function removeBootSurface(): void {
  const bootSurface = document.getElementById('boot-surface');
  if (!bootSurface) return;

  // Fade out
  bootSurface.classList.add('fade-out');

  // Remove after transition
  bootSurface.addEventListener('transitionend', () => {
    bootSurface.remove();
    // Also remove boot styles to reduce DOM size
    document.getElementById('boot-styles')?.remove();
  }, { once: true });

  // Fallback removal if transition doesn't fire
  setTimeout(() => {
    bootSurface.remove();
    document.getElementById('boot-styles')?.remove();
  }, 300);
}

/**
 * Initialize the application with version gate check
 * This ensures clean state on version changes before React mounts
 */
async function initApp() {
  // Check version gate FIRST - this may trigger a reload
  await initVersionGate();

  // If we get here, version is OK - render the app
  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );

  // Remove boot surface after a brief delay to ensure React has rendered
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      removeBootSurface();
    });
  });

  // Register service worker for caching static assets (production only)
  registerServiceWorker();
}

/**
 * Register and manage service worker
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) {
    return;
  }

  // Track if a SW was already controlling the page (i.e., this is a return visit)
  // On first visit, controller is null — we should NOT reload when it first activates
  const wasControlled = !!navigator.serviceWorker.controller;

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log(`[SW] Registered: ${registration.scope}`);

      // Listen for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          console.log('[SW] Update found, installing...');
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available - tell it to skip waiting
              console.log('[SW] New version installed, activating...');
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        }
      });

      // Listen for controller change (new SW took over)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (wasControlled) {
          // Only reload when replacing an existing SW (update scenario)
          console.log('[SW] Controller changed, reloading...');
          window.location.reload();
        } else {
          console.log('[SW] First controller set, no reload needed');
        }
      });

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SW_ACTIVATED') {
          console.log(`[SW] Activated version ${event.data.version}`);
        }
        if (event.data?.type === 'CACHES_CLEARED') {
          console.log('[SW] All caches cleared');
        }
      });

    } catch (error) {
      console.log('[SW] Registration failed:', error);
    }
  });
}

// Log version info on startup
console.log(`[App] Version: ${getAppVersion()} (cache: ${getCacheVersion()})`);

// Start the app
initApp();
