import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { RefreshCw, Code, Copy, Check, BarChart3, AlertCircle } from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'sonner';

interface TopApp {
  app: string;
  bytes: number;
  flows: number;
  site: string;
}

export function TopApplicationsDebug() {
  const [loading, setLoading] = useState(false);
  const [rawResponse, setRawResponse] = useState<any>(null);
  const [parsedApps, setParsedApps] = useState<TopApp[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [responseTime, setResponseTime] = useState<number | null>(null);

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    setLoading(true);
    setError(null);
    const startTime = Date.now();

    try {
      console.log('[TopApplicationsDebug] Fetching /v1/applications...');
      
      const response = await apiService.makeAuthenticatedRequest(
        '/v1/applications', 
        { method: 'GET' }, 
        10000
      );
      
      const endTime = Date.now();
      setResponseTime(endTime - startTime);

      if (response.ok) {
        const data = await response.json();
        console.log('[TopApplicationsDebug] Raw API Response:', data);
        
        setRawResponse(data);
        
        // Try to parse the data
        const apps = parseApplicationData(data);
        setParsedApps(apps);
        
        toast.success('Applications loaded', {
          description: `Found ${apps.length} applications in ${endTime - startTime}ms`
        });
      } else {
        const errorText = await response.text();
        setError(`HTTP ${response.status}: ${errorText || response.statusText}`);
        console.error('[TopApplicationsDebug] Error response:', response.status, errorText);
        
        toast.error('Failed to load applications', {
          description: `HTTP ${response.status}`
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('[TopApplicationsDebug] Exception:', err);
      
      toast.error('Failed to load applications', {
        description: errorMessage
      });
    } finally {
      setLoading(false);
    }
  };

  const parseApplicationData = (data: any): TopApp[] => {
    const apps: TopApp[] = [];
    
    console.log('[TopApplicationsDebug] Parsing data, type:', typeof data, 'isArray:', Array.isArray(data));
    
    // Strategy 1: Direct array
    if (Array.isArray(data)) {
      console.log('[TopApplicationsDebug] Data is direct array, length:', data.length);
      data.slice(0, 20).forEach((app: any, index: number) => {
        console.log(`[TopApplicationsDebug] App ${index}:`, app);
        apps.push({
          app: app.name || app.applicationName || app.application || app.app || `Unknown-${index}`,
          bytes: app.bytes || app.totalBytes || app.byteCount || 0,
          flows: app.flows || app.sessionCount || app.sessions || app.flowCount || 0,
          site: app.site || app.siteName || app.location || 'N/A'
        });
      });
    }
    // Strategy 2: Object with applications array
    else if (data && typeof data === 'object') {
      // Try common property names
      const possibleKeys = ['applications', 'apps', 'data', 'items', 'results'];
      
      for (const key of possibleKeys) {
        if (data[key] && Array.isArray(data[key])) {
          console.log(`[TopApplicationsDebug] Found array at data.${key}, length:`, data[key].length);
          data[key].slice(0, 20).forEach((app: any, index: number) => {
            console.log(`[TopApplicationsDebug] App ${index} from ${key}:`, app);
            apps.push({
              app: app.name || app.applicationName || app.application || app.app || `Unknown-${index}`,
              bytes: app.bytes || app.totalBytes || app.byteCount || 0,
              flows: app.flows || app.sessionCount || app.sessions || app.flowCount || 0,
              site: app.site || app.siteName || app.location || 'N/A'
            });
          });
          break;
        }
      }
      
      // If still no apps found, log all top-level keys
      if (apps.length === 0) {
        console.log('[TopApplicationsDebug] No apps found, available keys:', Object.keys(data));
      }
    }
    
    console.log('[TopApplicationsDebug] Parsed apps:', apps);
    return apps;
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const copyToClipboard = () => {
    if (rawResponse) {
      navigator.clipboard.writeText(JSON.stringify(rawResponse, null, 2));
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Top Applications API Debug</h3>
          <p className="text-sm text-muted-foreground">
            Endpoint: <code className="bg-muted px-1 rounded">/v1/applications</code>
          </p>
        </div>
        <Button
          onClick={loadApplications}
          disabled={loading}
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Reload
        </Button>
      </div>

      {/* Response Metadata */}
      {responseTime !== null && (
        <div className="flex gap-4">
          <Badge variant="outline">
            Response Time: {responseTime}ms
          </Badge>
          {parsedApps.length > 0 && (
            <Badge variant="default">
              {parsedApps.length} applications found
            </Badge>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <Card className="surface-2dp border-destructive/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <CardTitle>Error Loading Applications</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <code className="text-sm text-destructive">{error}</code>
          </CardContent>
        </Card>
      )}

      {/* Parsed Applications */}
      {parsedApps.length > 0 && (
        <Card className="surface-2dp border-primary/10">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <CardTitle>Parsed Applications</CardTitle>
              </div>
              <Badge variant="outline">{parsedApps.length} apps</Badge>
            </div>
            <CardDescription>
              Successfully parsed application data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {parsedApps.map((app, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/5 hover:bg-muted/10 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-medium">{app.app}</p>
                    <p className="text-xs text-muted-foreground">
                      {app.site}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{formatBytes(app.bytes)}</p>
                    <p className="text-xs text-muted-foreground">{app.flows} flows</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Raw JSON Response */}
      {rawResponse && (
        <Card className="surface-2dp border-secondary/10">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code className="h-5 w-5 text-secondary" />
                <CardTitle>Raw API Response</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={copyToClipboard}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy JSON
                  </>
                )}
              </Button>
            </div>
            <CardDescription>
              Raw JSON response from the API
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/20 rounded-lg p-4 overflow-auto max-h-96">
              <pre className="text-xs font-mono">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            </div>
            
            {/* Data Structure Analysis */}
            <div className="mt-4 p-3 bg-info/10 border border-info/20 rounded-lg">
              <h4 className="text-sm font-semibold mb-2">Data Structure Analysis:</h4>
              <ul className="text-xs space-y-1 text-muted-foreground">
                <li>• Type: {Array.isArray(rawResponse) ? 'Array' : typeof rawResponse}</li>
                {Array.isArray(rawResponse) && (
                  <li>• Array Length: {rawResponse.length}</li>
                )}
                {typeof rawResponse === 'object' && !Array.isArray(rawResponse) && (
                  <>
                    <li>• Top-level Keys: {Object.keys(rawResponse).join(', ')}</li>
                    {Object.keys(rawResponse).map(key => {
                      const value = rawResponse[key];
                      return (
                        <li key={key}>
                          • {key}: {Array.isArray(value) ? `Array[${value.length}]` : typeof value}
                        </li>
                      );
                    })}
                  </>
                )}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && !rawResponse && (
        <Card className="surface-2dp border-primary/10">
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center space-y-4">
              <RefreshCw className="h-12 w-12 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                Loading applications from the controller...
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Data State */}
      {!loading && !rawResponse && !error && (
        <Card className="surface-2dp border-border">
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center space-y-4">
              <BarChart3 className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Click "Reload" to fetch application data
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
