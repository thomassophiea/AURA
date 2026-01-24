import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import {
  Database,
  Download,
  Upload,
  RefreshCw,
  Trash2,
  Clock,
  CheckCircle,
  AlertTriangle,
  HardDrive
} from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '../services/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface BackupFile {
  filename: string;
  size: number;
  created: string;
  type: string;
}

interface FlashFile {
  filename: string;
  size: number;
  type: string;
}

export function SystemBackupManager() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [flashFiles, setFlashFiles] = useState<FlashFile[]>([]);
  const [flashUsage, setFlashUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newBackupName, setNewBackupName] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);

  useEffect(() => {
    loadBackups();
    loadFlashInfo();
  }, []);

  const loadBackups = async () => {
    setLoading(true);
    try {
      const data = await apiService.getConfigurationBackups();
      setBackups(data);
    } catch (error) {
      console.error('Failed to load backups:', error);
      toast.error('Failed to load configuration backups');
    } finally {
      setLoading(false);
    }
  };

  const loadFlashInfo = async () => {
    try {
      const [files, usage] = await Promise.all([
        apiService.getFlashFiles(),
        apiService.getFlashUsage()
      ]);
      setFlashFiles(files);
      setFlashUsage(usage);
    } catch (error) {
      console.error('Failed to load flash info:', error);
    }
  };

  const handleCreateBackup = async () => {
    if (!newBackupName.trim()) {
      toast.error('Please enter a backup filename');
      return;
    }

    setCreating(true);
    try {
      await apiService.createConfigurationBackup(newBackupName);
      toast.success('Configuration backup created successfully');
      setShowCreateDialog(false);
      setNewBackupName('');
      await loadBackups();
    } catch (error) {
      console.error('Failed to create backup:', error);
      toast.error('Failed to create configuration backup');
    } finally {
      setCreating(false);
    }
  };

  const handleDownloadBackup = async (filename: string) => {
    try {
      const blob = await apiService.downloadConfigurationBackup(filename);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Backup downloaded successfully');
    } catch (error) {
      console.error('Failed to download backup:', error);
      toast.error('Failed to download backup file');
    }
  };

  const handleRestoreBackup = async () => {
    if (!selectedBackup) return;

    try {
      await apiService.restoreConfiguration(selectedBackup);
      toast.success('Configuration restored successfully');
      setShowRestoreDialog(false);
      setSelectedBackup(null);
    } catch (error) {
      console.error('Failed to restore backup:', error);
      toast.error('Failed to restore configuration');
    }
  };

  const handleDeleteFlashFile = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete ${filename}?`)) return;

    try {
      await apiService.deleteFlashFile(filename);
      toast.success('File deleted successfully');
      await loadFlashInfo();
    } catch (error) {
      console.error('Failed to delete file:', error);
      toast.error('Failed to delete file');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  const getUsagePercentage = (): number => {
    if (!flashUsage?.total || !flashUsage?.used) return 0;
    return (flashUsage.used / flashUsage.total) * 100;
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
          <Database className="h-6 w-6" />
          System Backup & Storage Manager
        </h2>
        <p className="text-muted-foreground">
          Manage configuration backups and flash memory storage
        </p>
      </div>

      {/* Flash Storage Overview */}
      {flashUsage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Flash Memory Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Storage</span>
                  <span className="text-sm text-muted-foreground">
                    {formatFileSize(flashUsage.used)} / {formatFileSize(flashUsage.total)}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-4">
                  <div
                    className={`h-4 rounded-full transition-all ${
                      getUsagePercentage() > 90
                        ? 'bg-red-500'
                        : getUsagePercentage() > 70
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                    }`}
                    style={{ width: `${getUsagePercentage()}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {getUsagePercentage().toFixed(1)}% used
                </p>
              </div>

              {getUsagePercentage() > 80 && (
                <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    Storage is running low. Consider deleting old backup files.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration Backups */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Configuration Backups</CardTitle>
              <CardDescription>
                Backup and restore controller configuration
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadBackups}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => setShowCreateDialog(true)}
              >
                <Upload className="h-4 w-4 mr-2" />
                Create Backup
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No configuration backups found</p>
              <p className="text-sm mt-2">Create your first backup to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map((backup) => (
                <div
                  key={backup.filename}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Database className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">{backup.filename}</p>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(backup.created)}
                        </span>
                        <Badge variant="outline">{formatFileSize(backup.size)}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadBackup(backup.filename)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedBackup(backup.filename);
                        setShowRestoreDialog(true);
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Restore
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Flash Files */}
      <Card>
        <CardHeader>
          <CardTitle>Flash Memory Files</CardTitle>
          <CardDescription>
            Manage files stored in flash memory
          </CardDescription>
        </CardHeader>
        <CardContent>
          {flashFiles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No files found in flash memory</p>
            </div>
          ) : (
            <div className="space-y-2">
              {flashFiles.map((file) => (
                <div
                  key={file.filename}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{file.filename}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {formatFileSize(file.size)}
                        </Badge>
                        {file.type && (
                          <Badge variant="secondary" className="text-xs">
                            {file.type}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteFlashFile(file.filename)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Backup Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Configuration Backup</DialogTitle>
            <DialogDescription>
              Enter a name for the backup file. A timestamp will be added automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Backup Filename</Label>
              <Input
                value={newBackupName}
                onChange={(e) => setNewBackupName(e.target.value)}
                placeholder="config-backup"
                onKeyPress={(e) => e.key === 'Enter' && handleCreateBackup()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateBackup} disabled={creating}>
              {creating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Create Backup
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Configuration</DialogTitle>
            <DialogDescription>
              Are you sure you want to restore from this backup? The controller will be restarted
              and current configuration will be replaced.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>Warning:</strong> This action will restart the controller and may cause
                temporary service disruption.
              </p>
            </div>
            {selectedBackup && (
              <p className="mt-4 text-sm">
                <strong>Selected backup:</strong> {selectedBackup}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRestoreDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRestoreBackup}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Restore Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
