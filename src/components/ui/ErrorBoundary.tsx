import React, { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ClipboardCheck, Clipboard } from 'lucide-react';
import { Button } from './button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './card';
import { apiService } from '../../services/api';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  onReset?: () => void;
  /** When true, wraps the default fallback in a full-screen centred container.
   *  Use this for top-level app boundaries. Defaults to false (inline card). */
  fullScreen?: boolean;
  /** Optional title shown in the fallback UI */
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  reportCopied: boolean;
}

function buildReport(error: Error, errorInfo: React.ErrorInfo | null): string {
  const lines: string[] = [];
  lines.push('=== AURA Error Report ===');
  lines.push(`Time: ${new Date().toISOString()}`);
  lines.push(`URL: ${typeof window !== 'undefined' ? window.location.href : '(no window)'}`);
  lines.push(`User-Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : '(no nav)'}`);
  lines.push('');
  lines.push('--- Error ---');
  lines.push(`Name: ${error.name}`);
  lines.push(`Message: ${error.message}`);
  if (error.stack) {
    lines.push('');
    lines.push('--- Stack ---');
    lines.push(error.stack);
  }
  if (errorInfo?.componentStack) {
    lines.push('');
    lines.push('--- Component Stack ---');
    lines.push(errorInfo.componentStack);
  }
  try {
    const recentLogs = apiService.getApiLogs().slice(-50);
    if (recentLogs.length > 0) {
      lines.push('');
      lines.push(`--- Last ${recentLogs.length} API calls ---`);
      for (const log of recentLogs) {
        const ts =
          log.timestamp instanceof Date ? log.timestamp.toISOString() : String(log.timestamp);
        const status = log.status ?? (log.isPending ? 'pending' : 'no-status');
        const dur = log.duration ? `${log.duration}ms` : '—';
        const err = log.error ? ` err=${log.error}` : '';
        lines.push(`[${ts}] ${log.method} ${log.endpoint} ${status} ${dur}${err}`);
      }
    }
  } catch {
    /* swallow — diagnostics shouldn't itself break */
  }
  return lines.join('\n');
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      reportCopied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });

    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      reportCopied: false,
    });

    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleCopyReport = async (): Promise<void> => {
    if (!this.state.error) return;
    const report = buildReport(this.state.error, this.state.errorInfo);
    try {
      if (navigator?.clipboard) {
        await navigator.clipboard.writeText(report);
      } else {
        // Fallback for environments without Clipboard API.
        const ta = document.createElement('textarea');
        ta.value = report;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      this.setState({ reportCopied: true });
      setTimeout(() => this.setState({ reportCopied: false }), 2500);
    } catch (err) {
      console.error('[ErrorBoundary] Failed to copy report:', err);
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const title = this.props.fallbackTitle || 'Something went wrong';
      const card = (
        <Card className="m-4 border-destructive/50 bg-destructive/5 max-w-2xl w-full">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {title}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 space-y-3">
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred while rendering this component.
            </p>
            {this.state.error && (
              <p className="text-xs font-mono text-destructive/80 bg-destructive/10 p-2 rounded">
                {this.state.error.message}
              </p>
            )}
            {import.meta.env.DEV && this.state.errorInfo && (
              <details className="rounded-md bg-muted p-3">
                <summary className="text-xs font-medium cursor-pointer mb-1">
                  Stack Trace (Dev Only)
                </summary>
                <pre className="text-xs overflow-auto max-h-64 text-muted-foreground whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </CardContent>
          <CardFooter className="gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={this.handleReset} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
            <Button size="sm" onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={this.handleCopyReport}
              className="gap-2 ml-auto"
              title="Copy a diagnostic report (error + component stack + last 50 API calls) to your clipboard."
            >
              {this.state.reportCopied ? (
                <>
                  <ClipboardCheck className="h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Clipboard className="h-4 w-4" />
                  Copy report
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      );

      if (this.props.fullScreen) {
        return (
          <div className="flex items-center justify-center min-h-screen bg-background p-4">
            {card}
          </div>
        );
      }

      return card;
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary?: () => void;
  title?: string;
  description?: string;
}

export function ErrorFallback({
  error,
  resetErrorBoundary,
  title = 'Something went wrong',
  description = 'An unexpected error occurred.',
}: ErrorFallbackProps): React.JSX.Element {
  return (
    <Card className="m-4 border-destructive/50 bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-sm text-muted-foreground">{description}</p>
        <p className="mt-2 text-xs font-mono text-destructive/80 bg-destructive/10 p-2 rounded">
          {error.message}
        </p>
      </CardContent>
      {resetErrorBoundary && (
        <CardFooter>
          <Button variant="outline" size="sm" onClick={resetErrorBoundary} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
): React.FC<P> {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const ComponentWithErrorBoundary: React.FC<P> = (props) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;

  return ComponentWithErrorBoundary;
}

export default ErrorBoundary;
