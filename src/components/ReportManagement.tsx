import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Skeleton } from './ui/skeleton';
import {
  FileText,
  Download,
  Play,
  Trash2,
  Calendar,
  Clock,
  BarChart3,
  Users,
  Wifi,
  Activity,
  Settings,
  Mail
} from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '../services/api';

interface Report {
  id: string;
  name: string;
  type: 'network_health' | 'client_stats' | 'ap_performance' | 'security_events' | 'bandwidth_usage';
  schedule: 'manual' | 'daily' | 'weekly' | 'monthly';
  format: 'pdf' | 'csv' | 'json';
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  recipients: string[];
  filters: {
    siteId?: string;
    dateRange?: string;
  };
}

export function ReportManagement() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('reports');
  const [generating, setGenerating] = useState(false);

  // New report state
  const [newReport, setNewReport] = useState<Partial<Report>>({
    name: '',
    type: 'network_health',
    schedule: 'manual',
    format: 'pdf',
    enabled: false,
    recipients: [],
    filters: {}
  });
  const [emailInput, setEmailInput] = useState('');

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/reports', {
        method: 'GET'
      });

      if (response.ok) {
        const data = await response.json();
        setReports(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to load reports:', error);
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReport = async () => {
    if (!newReport.name?.trim()) {
      toast.error('Please enter a report name');
      return;
    }

    try {
      const reportData = {
        name: newReport.name,
        type: newReport.type || 'network_health',
        schedule: newReport.schedule || 'manual',
        format: newReport.format || 'pdf',
        enabled: newReport.enabled || false,
        recipients: newReport.recipients || [],
        filters: newReport.filters || {}
      };

      const response = await apiService.makeAuthenticatedRequest('/v1/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportData)
      });

      if (response.ok) {
        toast.success('Report created successfully');
        setNewReport({
          name: '',
          type: 'network_health',
          schedule: 'manual',
          format: 'pdf',
          enabled: false,
          recipients: [],
          filters: {}
        });
        setEmailInput('');
        setActiveTab('reports');
        await loadReports();
      } else {
        throw new Error('Failed to create report');
      }
    } catch (error) {
      console.error('Failed to create report:', error);
      toast.error('Failed to create report');
    }
  };

  const handleGenerateReport = async (report: Report) => {
    setGenerating(true);
    toast.info(`Generating ${report.name}...`);

    try {
      const response = await apiService.makeAuthenticatedRequest(`/v1/reports/${report.id}/generate`, {
        method: 'POST'
      });

      if (response.ok) {
        // Get the report file as blob
        const blob = await response.blob();

        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${report.name.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.${report.format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success('Report generated and downloaded');

        // Reload reports to get updated lastRun timestamp
        await loadReports();
      } else {
        throw new Error('Report generation failed');
      }
    } catch (error) {
      console.error('Failed to generate report:', error);
      toast.error('Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleReport = async (reportId: string, enabled: boolean) => {
    try {
      const response = await apiService.makeAuthenticatedRequest(`/v1/reports/${reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });

      if (response.ok) {
        const updatedReports = reports.map(r =>
          r.id === reportId ? { ...r, enabled } : r
        );
        setReports(updatedReports);
        toast.success(enabled ? 'Report enabled' : 'Report disabled');
      } else {
        throw new Error('Failed to update report');
      }
    } catch (error) {
      console.error('Failed to toggle report:', error);
      toast.error('Failed to update report');
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this report?');
    if (!confirmed) return;

    try {
      const response = await apiService.makeAuthenticatedRequest(`/v1/reports/${reportId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setReports(reports.filter(r => r.id !== reportId));
        toast.success('Report deleted');
      } else {
        throw new Error('Failed to delete report');
      }
    } catch (error) {
      console.error('Failed to delete report:', error);
      toast.error('Failed to delete report');
    }
  };

  const handleAddEmail = () => {
    if (!emailInput.trim()) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailInput)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setNewReport({
      ...newReport,
      recipients: [...(newReport.recipients || []), emailInput]
    });
    setEmailInput('');
  };

  const handleRemoveEmail = (email: string) => {
    setNewReport({
      ...newReport,
      recipients: (newReport.recipients || []).filter(e => e !== email)
    });
  };

  const getReportTypeIcon = (type: Report['type']) => {
    switch (type) {
      case 'network_health':
        return <Activity className="h-4 w-4" />;
      case 'client_stats':
        return <Users className="h-4 w-4" />;
      case 'ap_performance':
        return <Wifi className="h-4 w-4" />;
      case 'security_events':
        return <Settings className="h-4 w-4" />;
      case 'bandwidth_usage':
        return <BarChart3 className="h-4 w-4" />;
    }
  };

  const getReportTypeName = (type: Report['type']) => {
    switch (type) {
      case 'network_health':
        return 'Network Health';
      case 'client_stats':
        return 'Client Statistics';
      case 'ap_performance':
        return 'AP Performance';
      case 'security_events':
        return 'Security Events';
      case 'bandwidth_usage':
        return 'Bandwidth Usage';
    }
  };

  const getScheduleBadge = (schedule: Report['schedule']) => {
    const colors: Record<Report['schedule'], string> = {
      manual: 'bg-gray-500',
      daily: 'bg-blue-500',
      weekly: 'bg-green-500',
      monthly: 'bg-purple-500'
    };

    return (
      <Badge className={colors[schedule]}>
        {schedule.charAt(0).toUpperCase() + schedule.slice(1)}
      </Badge>
    );
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
          <FileText className="h-6 w-6" />
          Report Management
        </h2>
        <p className="text-muted-foreground">
          Create and schedule automated reports
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="create">Create Report</TabsTrigger>
        </TabsList>

        {/* Reports List */}
        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Scheduled Reports</CardTitle>
              <CardDescription>Manage and execute reports</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Last Run</TableHead>
                    <TableHead>Next Run</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No reports configured. Create your first report to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    reports.map(report => (
                      <TableRow key={report.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {getReportTypeIcon(report.type)}
                            {report.name}
                          </div>
                        </TableCell>
                        <TableCell>{getReportTypeName(report.type)}</TableCell>
                        <TableCell>{getScheduleBadge(report.schedule)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{report.format.toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {report.lastRun ? new Date(report.lastRun).toLocaleString() : 'Never'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {report.nextRun ? new Date(report.nextRun).toLocaleString() : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={report.enabled}
                            onCheckedChange={(checked) => handleToggleReport(report.id, checked)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleGenerateReport(report)}
                              disabled={generating}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              Generate
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteReport(report.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Create Report */}
        <TabsContent value="create" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create New Report</CardTitle>
              <CardDescription>Configure a new report</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Report Name</Label>
                <Input
                  value={newReport.name}
                  onChange={(e) => setNewReport({ ...newReport, name: e.target.value })}
                  placeholder="e.g., Weekly Network Performance"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Report Type</Label>
                  <Select
                    value={newReport.type}
                    onValueChange={(value: Report['type']) => setNewReport({ ...newReport, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="network_health">Network Health</SelectItem>
                      <SelectItem value="client_stats">Client Statistics</SelectItem>
                      <SelectItem value="ap_performance">AP Performance</SelectItem>
                      <SelectItem value="security_events">Security Events</SelectItem>
                      <SelectItem value="bandwidth_usage">Bandwidth Usage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Schedule</Label>
                  <Select
                    value={newReport.schedule}
                    onValueChange={(value: Report['schedule']) => setNewReport({ ...newReport, schedule: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Format</Label>
                  <Select
                    value={newReport.format}
                    onValueChange={(value: Report['format']) => setNewReport({ ...newReport, format: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="csv">CSV</SelectItem>
                      <SelectItem value="json">JSON</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Auto-enable</Label>
                  <div className="flex items-center h-10">
                    <Switch
                      checked={newReport.enabled}
                      onCheckedChange={(checked) => setNewReport({ ...newReport, enabled: checked })}
                    />
                    <span className="ml-2 text-sm text-muted-foreground">
                      {newReport.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Email Recipients (Optional)</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddEmail()}
                      placeholder="email@example.com"
                      className="pl-8"
                    />
                  </div>
                  <Button onClick={handleAddEmail} variant="outline">
                    Add
                  </Button>
                </div>
                {newReport.recipients && newReport.recipients.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {newReport.recipients.map(email => (
                      <Badge key={email} variant="secondary" className="gap-1">
                        {email}
                        <button
                          onClick={() => handleRemoveEmail(email)}
                          className="ml-1 hover:text-destructive"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <Button onClick={handleCreateReport} className="w-full">
                <FileText className="h-4 w-4 mr-2" />
                Create Report
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
