/**
 * Version Badge Component
 *
 * Displays deployment version information in the UI
 * Fetches from /api/version endpoint
 */

import { useEffect, useState } from 'react';
import { Badge } from './ui/badge';
import { Info, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';

interface VersionInfo {
  version: string;
  commit: string;
  commitFull: string;
  buildDate: string;
  message: string;
  features?: string[];
  error?: string;
}

export function VersionBadge() {
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchVersion = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/version');
      const data = await response.json();
      setVersion(data);
    } catch (error) {
      console.error('[VersionBadge] Failed to fetch version:', error);
      setVersion({
        version: 'unknown',
        commit: 'unknown',
        commitFull: '',
        buildDate: new Date().toISOString(),
        message: 'Failed to fetch version',
        error: 'Network error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVersion();
  }, []);

  if (!version) {
    return null;
  }

  const displayVersion = version.commit || version.version || 'dev';
  const buildDate = version.buildDate ? new Date(version.buildDate).toLocaleString() : 'Unknown';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs font-mono"
        >
          <Info className="h-3 w-3 mr-1" />
          {displayVersion}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Deployment Information</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchVersion}
              disabled={isLoading}
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <div className="space-y-2 text-xs">
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">Version:</span>
              <span className="col-span-2 font-mono">{version.version || 'N/A'}</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">Commit:</span>
              <span className="col-span-2 font-mono break-all">
                {version.commit || 'N/A'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">Build Date:</span>
              <span className="col-span-2">{buildDate}</span>
            </div>

            {version.message && (
              <div className="pt-2 border-t">
                <p className="text-muted-foreground mb-1">Message:</p>
                <p className="font-medium">{version.message}</p>
              </div>
            )}

            {version.features && version.features.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-muted-foreground mb-2">Features:</p>
                <div className="flex flex-wrap gap-1">
                  {version.features.map((feature, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {feature}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {version.error && (
              <div className="pt-2 border-t">
                <Badge variant="destructive" className="text-xs">
                  {version.error}
                </Badge>
              </div>
            )}
          </div>

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              Extreme Platform ONE | API
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
