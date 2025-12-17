import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { RefreshCw, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { apiService } from '../services/api';

interface EndpointResult {
  endpoint: string;
  status: 'testing' | 'success' | 'failed';
  statusCode?: number;
  data?: any;
  error?: string;
}

export function ApplicationEndpointTester() {
  const [results, setResults] = useState<EndpointResult[]>([]);
  const [testing, setTesting] = useState(false);

  const ENDPOINTS_TO_TEST = [
    '/v1/applications',
    '/v1/application-analytics',
    '/v1/analytics/applications',
    '/v1/reports/applications',
    '/v1/application-categories',
    '/v1/application/categories',
    '/v1/applications/statistics',
    '/v1/applications/summary',
    '/v1/analytics/application-categories',
    '/v1/analytics/categories',
    '/platformmanager/v1/applications',
    '/platformmanager/v1/analytics/applications',
  ];

  const testEndpoints = async () => {
    setTesting(true);
    const initialResults: EndpointResult[] = ENDPOINTS_TO_TEST.map(endpoint => ({
      endpoint,
      status: 'testing'
    }));
    setResults(initialResults);

    for (let i = 0; i < ENDPOINTS_TO_TEST.length; i++) {
      const endpoint = ENDPOINTS_TO_TEST[i];

      try {
        console.log(`[Endpoint Tester] Testing: ${endpoint}`);

        const response = await apiService.makeAuthenticatedRequest(endpoint, {
          method: 'GET'
        }, 5000);

        const statusCode = response.status;
        let data = null;
        let resultStatus: 'success' | 'failed' = 'failed';

        if (response.ok) {
          try {
            data = await response.json();
            resultStatus = 'success';
            console.log(`[Endpoint Tester] ✓ ${endpoint} -> ${statusCode}`, data);
          } catch (e) {
            console.log(`[Endpoint Tester] ✓ ${endpoint} -> ${statusCode} (no JSON)`);
          }
        } else {
          console.log(`[Endpoint Tester] ✗ ${endpoint} -> ${statusCode}`);
        }

        setResults(prev => prev.map((r, idx) =>
          idx === i
            ? { ...r, status: resultStatus, statusCode, data }
            : r
        ));

      } catch (error) {
        console.log(`[Endpoint Tester] ✗ ${endpoint} -> Error:`, error);
        setResults(prev => prev.map((r, idx) =>
          idx === i
            ? { ...r, status: 'failed', error: error instanceof Error ? error.message : 'Unknown error' }
            : r
        ));
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setTesting(false);
  };

  const getStatusIcon = (status: EndpointResult['status']) => {
    switch (status) {
      case 'testing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const successfulEndpoints = results.filter(r => r.status === 'success');

  return (
    <Card className="border-2 border-yellow-500">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Application Endpoint Tester (Debug Tool)</CardTitle>
            <p className="text-sm text-muted-foreground">
              Testing {ENDPOINTS_TO_TEST.length} possible endpoints to find application data
            </p>
          </div>
          <Button
            onClick={testEndpoints}
            disabled={testing}
            size="sm"
          >
            {testing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Test All Endpoints
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {successfulEndpoints.length > 0 && (
          <div className="mb-4 p-4 bg-green-500/10 border border-green-500 rounded-lg">
            <h3 className="font-semibold text-green-700 dark:text-green-400 mb-2">
              ✓ Found {successfulEndpoints.length} working endpoint(s)!
            </h3>
            {successfulEndpoints.map((result) => (
              <div key={result.endpoint} className="mb-2">
                <code className="text-sm bg-muted px-2 py-1 rounded">{result.endpoint}</code>
                <span className="ml-2 text-xs text-muted-foreground">
                  Status: {result.statusCode}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {results.map((result) => (
            <div
              key={result.endpoint}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border"
            >
              <div className="flex items-center gap-3 flex-1">
                {getStatusIcon(result.status)}
                <code className="text-sm">{result.endpoint}</code>
              </div>
              <div className="flex items-center gap-2">
                {result.statusCode && (
                  <Badge variant={result.status === 'success' ? 'default' : 'destructive'}>
                    {result.statusCode}
                  </Badge>
                )}
                {result.status === 'success' && result.data && (
                  <Badge variant="outline" className="text-xs">
                    {Array.isArray(result.data)
                      ? `${result.data.length} items`
                      : typeof result.data === 'object'
                        ? `${Object.keys(result.data).length} keys`
                        : 'Data available'}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>

        {results.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Click "Test All Endpoints" to start testing
          </div>
        )}

        {!testing && results.length > 0 && successfulEndpoints.length === 0 && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-400">
              No working endpoints found. The Campus Controller may not have an application analytics API available.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
