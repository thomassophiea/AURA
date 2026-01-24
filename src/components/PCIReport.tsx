import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { Separator } from './ui/separator';
import {
  Shield,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Printer,
  Download,
  MapPin,
  Wifi,
  Activity
} from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '../services/api';

interface Site {
  id: string;
  name?: string;
  siteName?: string;
  displayName?: string;
}

interface WLAN {
  id: string;
  ssid: string;
  vlan?: number;
  enabled: boolean;
}

interface AccessPoint {
  id: string;
  name: string;
  mac: string;
  status: 'connected' | 'disconnected' | 'unknown';
  siteId: string;
}

interface PCIReportConfig {
  siteId: string;
  wlanId: string;
  vlanIds: number[];
  includeDisconnectedAPs: boolean;
}

interface PCIReportResult {
  siteId: string;
  siteName: string;
  wlanId: string;
  wlanSsid: string;
  vlanIds: number[];
  generatedAt: string;
  connectedAPs: AccessPoint[];
  disconnectedAPs: AccessPoint[];
  totalAPs: number;
  complianceStatus: 'pass' | 'fail' | 'warning';
}

export function PCIReport() {
  const [sites, setSites] = useState<Site[]>([]);
  const [wlans, setWlans] = useState<WLAN[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingWlans, setLoadingWlans] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Configuration state
  const [config, setConfig] = useState<PCIReportConfig>({
    siteId: '',
    wlanId: '',
    vlanIds: [],
    includeDisconnectedAPs: true
  });
  const [vlanInput, setVlanInput] = useState('');

  // Report result state
  const [reportResult, setReportResult] = useState<PCIReportResult | null>(null);

  // Print reference
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSites();
  }, []);

  useEffect(() => {
    if (config.siteId) {
      loadWlans(config.siteId);
    } else {
      setWlans([]);
      setConfig(prev => ({ ...prev, wlanId: '' }));
    }
  }, [config.siteId]);

  const loadSites = async () => {
    setLoading(true);
    try {
      const data = await apiService.getSites();
      setSites(data);
    } catch (error) {
      console.error('Failed to load sites:', error);
      toast.error('Failed to load sites');
    } finally {
      setLoading(false);
    }
  };

  const loadWlans = async (siteId: string) => {
    setLoadingWlans(true);
    try {
      const response = await apiService.makeAuthenticatedRequest(`/v1/sites/${siteId}/wlans`, {
        method: 'GET'
      });

      if (response.ok) {
        const data = await response.json();
        setWlans(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to load WLANs:', error);
      toast.error('Failed to load WLANs');
    } finally {
      setLoadingWlans(false);
    }
  };

  const handleAddVlan = () => {
    const vlanId = parseInt(vlanInput);
    if (isNaN(vlanId) || vlanId < 1 || vlanId > 4094) {
      toast.error('Please enter a valid VLAN ID (1-4094)');
      return;
    }

    if (config.vlanIds.includes(vlanId)) {
      toast.error('VLAN ID already added');
      return;
    }

    setConfig(prev => ({
      ...prev,
      vlanIds: [...prev.vlanIds, vlanId]
    }));
    setVlanInput('');
  };

  const handleRemoveVlan = (vlanId: number) => {
    setConfig(prev => ({
      ...prev,
      vlanIds: prev.vlanIds.filter(id => id !== vlanId)
    }));
  };

  const handleGenerateReport = async () => {
    if (!config.siteId || !config.wlanId) {
      toast.error('Please select a site and WLAN');
      return;
    }

    if (config.vlanIds.length === 0) {
      toast.error('Please add at least one VLAN ID');
      return;
    }

    setGenerating(true);
    try {
      // Get site info
      const site = sites.find(s => s.id === config.siteId);
      const wlan = wlans.find(w => w.id === config.wlanId);

      if (!site || !wlan) {
        throw new Error('Site or WLAN not found');
      }

      // Fetch APs for the site
      const response = await apiService.makeAuthenticatedRequest(`/v1/sites/${config.siteId}/devices`, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch access points');
      }

      const devices = await response.json();
      const aps: AccessPoint[] = Array.isArray(devices) ? devices.map((device: any) => ({
        id: device.id,
        name: device.name || device.mac || 'Unknown AP',
        mac: device.mac || 'Unknown',
        status: device.status === 'connected' ? 'connected' : 'disconnected',
        siteId: config.siteId
      })) : [];

      const connectedAPs = aps.filter(ap => ap.status === 'connected');
      const disconnectedAPs = aps.filter(ap => ap.status !== 'connected');

      // Determine compliance status
      let complianceStatus: 'pass' | 'fail' | 'warning' = 'pass';
      if (disconnectedAPs.length > 0) {
        complianceStatus = disconnectedAPs.length > connectedAPs.length ? 'fail' : 'warning';
      }

      const result: PCIReportResult = {
        siteId: config.siteId,
        siteName: site.displayName || site.name || site.siteName || 'Unknown Site',
        wlanId: config.wlanId,
        wlanSsid: wlan.ssid,
        vlanIds: config.vlanIds,
        generatedAt: new Date().toISOString(),
        connectedAPs,
        disconnectedAPs,
        totalAPs: aps.length,
        complianceStatus
      };

      setReportResult(result);
      toast.success('PCI report generated successfully');
    } catch (error) {
      console.error('Failed to generate report:', error);
      toast.error('Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Failed to open print window. Please allow popups.');
      return;
    }

    const styles = `
      <style>
        @media print {
          body { margin: 0; padding: 20px; font-family: system-ui, -apple-system, sans-serif; }
          .no-print { display: none; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f3f4f6; font-weight: 600; }
          .header { margin-bottom: 20px; }
          .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
          .badge-success { background-color: #dcfce7; color: #166534; }
          .badge-warning { background-color: #fef3c7; color: #92400e; }
          .badge-error { background-color: #fee2e2; color: #991b1b; }
          .status-connected { color: #16a34a; }
          .status-disconnected { color: #dc2626; }
        }
      </style>
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>PCI DSS Compliance Report - ${reportResult?.siteName}</title>
        ${styles}
      </head>
      <body>
        ${printRef.current.innerHTML}
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const handleExportPDF = () => {
    // For now, use browser's print to PDF functionality
    handlePrint();
    toast.info('Use your browser\'s "Save as PDF" option in the print dialog');
  };

  const getSiteDisplayName = (site: Site): string => {
    return site.displayName || site.name || site.siteName || site.id;
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6" />
          PCI DSS Compliance Report
        </h2>
        <p className="text-muted-foreground">
          Generate compliance documentation for Payment Card Industry Data Security Standard
        </p>
      </div>

      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle>Report Configuration</CardTitle>
          <CardDescription>Select site, WLAN, and VLANs transmitting cardholder data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Site Selection */}
          <div className="space-y-2">
            <Label>Site</Label>
            <Select
              value={config.siteId}
              onValueChange={(value) => setConfig(prev => ({ ...prev, siteId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a site..." />
              </SelectTrigger>
              <SelectContent>
                {sites.map(site => (
                  <SelectItem key={site.id} value={site.id}>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {getSiteDisplayName(site)}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* WLAN Selection */}
          <div className="space-y-2">
            <Label>WLAN (Transmitting Cardholder Data)</Label>
            <Select
              value={config.wlanId}
              onValueChange={(value) => setConfig(prev => ({ ...prev, wlanId: value }))}
              disabled={!config.siteId || loadingWlans}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingWlans ? "Loading WLANs..." : "Select a WLAN..."} />
              </SelectTrigger>
              <SelectContent>
                {wlans.map(wlan => (
                  <SelectItem key={wlan.id} value={wlan.id}>
                    <div className="flex items-center gap-2">
                      <Wifi className="h-4 w-4" />
                      {wlan.ssid}
                      {wlan.vlan && <Badge variant="outline">VLAN {wlan.vlan}</Badge>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* VLAN IDs */}
          <div className="space-y-2">
            <Label>VLAN IDs (Cardholder Data)</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={vlanInput}
                onChange={(e) => setVlanInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddVlan()}
                placeholder="Enter VLAN ID (1-4094)"
                min="1"
                max="4094"
              />
              <Button onClick={handleAddVlan} variant="outline">
                Add
              </Button>
            </div>
            {config.vlanIds.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {config.vlanIds.map(vlanId => (
                  <Badge key={vlanId} variant="secondary" className="gap-1">
                    VLAN {vlanId}
                    <button
                      onClick={() => handleRemoveVlan(vlanId)}
                      className="ml-1 hover:text-destructive"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerateReport}
            disabled={!config.siteId || !config.wlanId || config.vlanIds.length === 0 || generating}
            className="w-full"
          >
            {generating ? (
              <>
                <Activity className="h-4 w-4 mr-2 animate-spin" />
                Generating Report...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                Generate Report
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Report Results */}
      {reportResult && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>PCI DSS Compliance Report</CardTitle>
                <CardDescription>
                  Generated on {new Date(reportResult.generatedAt).toLocaleString()}
                </CardDescription>
              </div>
              <div className="flex gap-2 no-print">
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportPDF}>
                  <Download className="h-4 w-4 mr-2" />
                  Export PDF
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div ref={printRef} className="space-y-6">
              {/* Report Header */}
              <div className="header">
                <h3 className="text-lg font-semibold mb-2">PCI DSS Compliance Report</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Site:</span>
                    <span className="ml-2 font-medium">{reportResult.siteName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">WLAN:</span>
                    <span className="ml-2 font-medium">{reportResult.wlanSsid}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">VLAN IDs:</span>
                    <span className="ml-2 font-medium">{reportResult.vlanIds.join(', ')}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Generated:</span>
                    <span className="ml-2 font-medium">
                      {new Date(reportResult.generatedAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Compliance Status */}
              <div>
                <h4 className="font-semibold mb-3">Compliance Status</h4>
                <div className="flex items-center gap-2">
                  {reportResult.complianceStatus === 'pass' && (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <Badge className="bg-green-500 badge badge-success">PASS</Badge>
                      <span className="text-sm">All access points are connected</span>
                    </>
                  )}
                  {reportResult.complianceStatus === 'warning' && (
                    <>
                      <AlertCircle className="h-5 w-5 text-yellow-600" />
                      <Badge className="bg-yellow-500 badge badge-warning">WARNING</Badge>
                      <span className="text-sm">Some access points are disconnected</span>
                    </>
                  )}
                  {reportResult.complianceStatus === 'fail' && (
                    <>
                      <XCircle className="h-5 w-5 text-red-600" />
                      <Badge className="bg-red-500 badge badge-error">FAIL</Badge>
                      <span className="text-sm">Majority of access points are disconnected</span>
                    </>
                  )}
                </div>
              </div>

              <Separator />

              {/* Summary Statistics */}
              <div>
                <h4 className="font-semibold mb-3">Summary</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-muted/30 rounded-lg">
                    <div className="text-2xl font-bold">{reportResult.totalAPs}</div>
                    <div className="text-sm text-muted-foreground">Total APs</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{reportResult.connectedAPs.length}</div>
                    <div className="text-sm text-muted-foreground">Connected</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">{reportResult.disconnectedAPs.length}</div>
                    <div className="text-sm text-muted-foreground">Disconnected</div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Connected Access Points */}
              <div>
                <h4 className="font-semibold mb-3">Connected Access Points</h4>
                {reportResult.connectedAPs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No connected access points found</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2 font-medium">Name</th>
                          <th className="text-left p-2 font-medium">MAC Address</th>
                          <th className="text-left p-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportResult.connectedAPs.map(ap => (
                          <tr key={ap.id} className="border-b">
                            <td className="p-2">{ap.name}</td>
                            <td className="p-2 font-mono text-sm">{ap.mac}</td>
                            <td className="p-2">
                              <Badge className="bg-green-500 status-connected">Connected</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Disconnected Access Points - Appendix */}
              {reportResult.disconnectedAPs.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-semibold mb-3 text-red-600">Appendix: Disconnected Access Points</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      The following access points are not in a connected state and require attention:
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2 font-medium">Name</th>
                            <th className="text-left p-2 font-medium">MAC Address</th>
                            <th className="text-left p-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportResult.disconnectedAPs.map(ap => (
                            <tr key={ap.id} className="border-b">
                              <td className="p-2">{ap.name}</td>
                              <td className="p-2 font-mono text-sm">{ap.mac}</td>
                              <td className="p-2">
                                <Badge className="bg-red-500 status-disconnected">Disconnected</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* Footer */}
              <Separator />
              <div className="text-xs text-muted-foreground">
                <p>
                  This report was automatically generated by the Network Management System.
                  For PCI DSS compliance requirements, ensure all access points are in a connected state
                  and transmitting on the designated VLANs for cardholder data.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
