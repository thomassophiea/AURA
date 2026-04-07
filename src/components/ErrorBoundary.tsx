/**
 * Re-exports ErrorBoundary from the canonical implementation in ui/ErrorBoundary.
 * Import from either path — both resolve to the same component.
 */
export { ErrorBoundary, ErrorFallback, withErrorBoundary } from './ui/ErrorBoundary';
export { ErrorBoundary as default } from './ui/ErrorBoundary';
