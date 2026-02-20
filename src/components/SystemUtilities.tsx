import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';
import { formatCompactNumber } from '../lib/units';
import {
  Database,
  Download,
  Upload,
  RefreshCw,
  Power,
  Settings,
  Trash2,
  HardDrive,
  AlertCircle,
  CheckCircle,
  FileJson,
  Save,
  Play,
  Shield
} from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '../services/api';

export function SystemUtilities() {
  const [activeTab, setActiveTab] = useState('backup');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Backup/Restore state
  const [backupFile, setBackupFile] = useState<File | null>(null);

  // Database state
  const [dbStats, setDbStats] = useState({
    size: '245 MB',
    tables: 48,
    records: 156432,
    lastOptimized: '2025-11-20 14:32:00'
  });

  // System state
  const [systemInfo, setSystemInfo] = useState({
    uptime: '14 days, 6 hours',
    cpuUsage: '24%',
    memoryUsage: '58%',
    diskUsage: '42%',
    version: '1.0.0'
  });

  const handleBackupDatabase = async () => {
    setProcessing(true);
    setProgress(0);

    try {
      toast.info('Creating database backup...');

      const response = await apiService.makeAuthenticatedRequest('/v1/system/backup', {
        method: 'POST'
      });

      if (response.ok) {
        // Get backup file as blob
        const blob = await response.blob();

        // Download the backup file
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `database-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success('Database backup created and downloaded');
      } else {
        throw new Error('Backup failed');
      }
    } catch (error) {
      console.error('Backup failed:', error);
      toast.error('Backup failed');
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  };

  const handleRestoreDatabase = async () => {
    if (!backupFile) {
      toast.error('Please select a backup file');
      return;
    }

    setProcessing(true);
    setProgress(0);

    try {
      toast.info('Restoring database from backup...');

      const formData = new FormData();
      formData.append('backup', backupFile);

      const response = await apiService.makeAuthenticatedRequest('/v1/system/restore', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        toast.success('Database restored successfully');
        setBackupFile(null);
      } else {
        throw new Error('Restore failed');
      }
    } catch (error) {
      console.error('Restore failed:', error);
      toast.error('Restore failed');
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  };

  const handleExportConfiguration = async () => {
    setProcessing(true);

    try {
      toast.info('Exporting system configuration...');

      const response = await apiService.makeAuthenticatedRequest('/v1/system/config/export', {
        method: 'GET'
      });

      if (response.ok) {
        const blob = await response.blob();

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `system-config-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success('Configuration exported successfully');
      } else {
        throw new Error('Export failed');
      }
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Export failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleImportConfiguration = async (file: File) => {
    setProcessing(true);
    setProgress(0);

    try {
      toast.info('Importing system configuration...');

      const formData = new FormData();
      formData.append('config', file);

      const response = await apiService.makeAuthenticatedRequest('/v1/system/config/import', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        toast.success('Configuration imported successfully');
      } else {
        throw new Error('Import failed');
      }
    } catch (error) {
      console.error('Import failed:', error);
      toast.error('Import failed');
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  };

  const handleOptimizeDatabase = async () => {
    setProcessing(true);
    setProgress(0);

    try {
      toast.info('Optimizing database...');

      const response = await apiService.makeAuthenticatedRequest('/v1/database/optimize', {
        method: 'POST'
      });

      if (response.ok) {
        // Update last optimized time
        setDbStats({
          ...dbStats,
          lastOptimized: new Date().toLocaleString()
        });

        toast.success('Database optimized successfully');
      } else {
        throw new Error('Optimization failed');
      }
    } catch (error) {
      console.error('Optimization failed:', error);
      toast.error('Optimization failed');
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  };

  const handleCleanupLogs = async () => {
    setProcessing(true);

    try {
      toast.info('Cleaning up old logs...');

      const response = await apiService.makeAuthenticatedRequest('/v1/database/cleanup-logs', {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(`Log cleanup completed${data.spaceFreed ? ' - ' + data.spaceFreed + ' freed' : ''}`);
      } else {
        throw new Error('Cleanup failed');
      }
    } catch (error) {
      console.error('Cleanup failed:', error);
      toast.error('Cleanup failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleRestartService = async (service: string) => {
    setProcessing(true);

    try {
      toast.info(`Restarting ${service} service...`);

      const response = await apiService.makeAuthenticatedRequest(`/v1/services/${service.toLowerCase().replace(/\s+/g, '-')}/restart`, {
        method: 'POST'
      });

      if (response.ok) {
        toast.success(`${service} service restarted successfully`);
      } else {
        throw new Error('Restart failed');
      }
    } catch (error) {
      console.error(`Failed to restart ${service}:`, error);
      toast.error(`Failed to restart ${service}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleRebootSystem = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to reboot the system? This will temporarily interrupt all network services.'
    );

    if (!confirmed) return;

    setProcessing(true);

    try {
      toast.info('System reboot initiated...');

      const response = await apiService.makeAuthenticatedRequest('/v1/system/reboot', {
        method: 'POST'
      });

      if (response.ok) {
        toast.success('System is rebooting. Please wait 2-3 minutes before reconnecting.');
      } else {
        throw new Error('Reboot failed');
      }
    } catch (error) {
      console.error('Reboot failed:', error);
      toast.error('Reboot failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          System Utilities
        </h2>
        <p className="text-muted-foreground">
          Maintenance and diagnostic tools for system administration
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="backup">Backup & Restore</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="database">Database</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        {/* Backup & Restore */}
        <TabsContent value="backup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Database Backup
              </CardTitle>
              <CardDescription>
                Create a full backup of the system database
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Database backups include all configuration, devices, clients, and logs.
                  Store backups securely and test restoration periodically.
                </AlertDescription>
              </Alert>

              <Button
                onClick={handleBackupDatabase}
                disabled={processing}
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                Create Backup
              </Button>

              {processing && progress > 0 && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-sm text-muted-foreground text-center">
                    Creating backup... {progress}%
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Database Restore
              </CardTitle>
              <CardDescription>
                Restore database from a backup file
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Restoring will replace all current data. Ensure you have a recent backup
                  before proceeding. This operation cannot be undone.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label>Backup File</Label>
                <Input
                  type="file"
                  accept=".json,.sql,.db"
                  onChange={(e) => setBackupFile(e.target.files?.[0] || null)}
                />
              </div>

              <Button
                onClick={handleRestoreDatabase}
                disabled={processing || !backupFile}
                variant="destructive"
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                Restore Database
              </Button>

              {processing && progress > 0 && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-sm text-muted-foreground text-center">
                    Restoring database... {progress}%
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configuration */}
        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileJson className="h-5 w-5" />
                Export Configuration
              </CardTitle>
              <CardDescription>
                Export system configuration to JSON file
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Export includes networks, policies, device settings, and system preferences.
                Use this for backup or migration to another controller.
              </p>

              <Button
                onClick={handleExportConfiguration}
                disabled={processing}
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                Export Configuration
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Import Configuration
              </CardTitle>
              <CardDescription>
                Import configuration from JSON file
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Importing will merge or replace existing configuration based on
                  settings. Review the import file carefully before proceeding.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label>Configuration File</Label>
                <Input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImportConfiguration(file);
                  }}
                  disabled={processing}
                />
              </div>

              {processing && progress > 0 && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-sm text-muted-foreground text-center">
                    Importing configuration... {progress}%
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Database */}
        <TabsContent value="database" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5" />
                Database Statistics
              </CardTitle>
              <CardDescription>Current database information</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Size</p>
                  <p className="text-lg font-semibold">{dbStats.size}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tables</p>
                  <p className="text-lg font-semibold">{dbStats.tables}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Records</p>
                  <p className="text-lg font-semibold">{formatCompactNumber(dbStats.records)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last Optimized</p>
                  <p className="text-lg font-semibold">{dbStats.lastOptimized}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Database Maintenance</CardTitle>
              <CardDescription>Optimize and clean up database</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Button
                  onClick={handleOptimizeDatabase}
                  disabled={processing}
                  className="w-full"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Optimize Database
                </Button>
                <p className="text-xs text-muted-foreground">
                  Optimize tables and rebuild indexes for better performance
                </p>
              </div>

              {processing && progress > 0 && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-sm text-muted-foreground text-center">
                    Optimizing... {progress}%
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Button
                  onClick={handleCleanupLogs}
                  disabled={processing}
                  variant="outline"
                  className="w-full"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Cleanup Old Logs
                </Button>
                <p className="text-xs text-muted-foreground">
                  Remove logs older than 90 days to free up space
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System */}
        <TabsContent value="system" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Information</CardTitle>
              <CardDescription>Current system status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Uptime</p>
                  <p className="text-lg font-semibold">{systemInfo.uptime}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Version</p>
                  <p className="text-lg font-semibold">{systemInfo.version}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">CPU Usage</p>
                  <p className="text-lg font-semibold">{systemInfo.cpuUsage}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Memory Usage</p>
                  <p className="text-lg font-semibold">{systemInfo.memoryUsage}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">Disk Usage</p>
                  <p className="text-lg font-semibold">{systemInfo.diskUsage}</p>
                  <Progress value={42} className="mt-2" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Service Management</CardTitle>
              <CardDescription>Restart system services</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {['Authentication', 'DHCP Server', 'Captive Portal', 'RADIUS Proxy'].map(service => (
                <Button
                  key={service}
                  onClick={() => handleRestartService(service)}
                  disabled={processing}
                  variant="outline"
                  className="w-full justify-start"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Restart {service}
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <Power className="h-5 w-5" />
                System Reboot
              </CardTitle>
              <CardDescription>Restart the entire system</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Rebooting will interrupt all network services for 2-3 minutes.
                  Ensure all critical operations are completed before proceeding.
                </AlertDescription>
              </Alert>

              <Button
                onClick={handleRebootSystem}
                disabled={processing}
                variant="destructive"
                className="w-full"
              >
                <Power className="h-4 w-4 mr-2" />
                Reboot System
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
