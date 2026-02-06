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
import { TouchButton } from './TouchButton';
import { ResponsiveDialog } from './ResponsiveDialog';
import { DesktopOnly } from './MobileOptimized';

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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

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

  const validateFilename = (filename: string): boolean => {
    const filenameRegex = /^[a-zA-Z0-9\-_.]+$/;
    return filenameRegex.test(filename);
  };

  const handleCreateBackup = async () => {
    if (!newBackupName.trim()) {
      toast.error('Please enter a backup filename');
      return;
    }

    if (!validateFilename(newBackupName)) {
      toast.error('Filename can only contain letters, numbers, hyphens, underscores, and dots');
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

  const handleDeleteFlashFile = async () => {
    if (!fileToDelete) return;

    try {
      await apiService.deleteFlashFile(fileToDelete);
      toast.success('File deleted successfully');
      setShowDeleteDialog(false);
      setFileToDelete(null);
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
    <div className="space-y-6 p-4 md:p-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-3 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            <Database className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            System Backup & Storage Manager
          </h2>
          <DesktopOnly>
            <p className="text-muted-foreground mt-2 text-base">
              Manage configuration backups and flash memory storage
            </p>
          </DesktopOnly>
        </div>
      </div>

      {/* Flash Storage Overview */}
      {flashUsage && (
        <Card className="border-2 shadow-lg hover:shadow-xl transition-shadow duration-300">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <div className="p-2 bg-primary/10 rounded-lg">
                <HardDrive className="h-5 w-5 text-primary" />
              </div>
              Flash Memory Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-muted/30 to-muted/10 p-4 rounded-xl">
                <div className="flex justify-between mb-3">
                  <span className="text-sm font-semibold">Storage Capacity</span>
                  <span className="text-sm font-mono font-medium">
                    {formatFileSize(flashUsage.used)} / {formatFileSize(flashUsage.total)}
                  </span>
                </div>
                <div className="w-full bg-muted/50 rounded-full h-3 overflow-hidden shadow-inner" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={getUsagePercentage()} aria-label="Flash memory usage">
                  <div
                    className={`h-3 rounded-full transition-all duration-700 ease-out shadow-sm ${
                      getUsagePercentage() > 90
                        ? 'bg-gradient-to-r from-red-500 to-red-600'
                        : getUsagePercentage() > 70
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                        : 'bg-gradient-to-r from-green-500 to-emerald-500'
                    }`}
                    style={{ width: `${getUsagePercentage()}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {getUsagePercentage().toFixed(1)}% utilized
                  </p>
                  <p className="text-xs font-medium text-muted-foreground">
                    {formatFileSize(flashUsage.total - flashUsage.used)} available
                  </p>
                </div>
              </div>

              {getUsagePercentage() > 80 && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Storage is running low. Consider deleting old backup files.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration Backups */}
      <Card className="border-2 shadow-lg hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Database className="h-5 w-5 text-blue-600" />
                </div>
                Configuration Backups
              </CardTitle>
              <CardDescription className="mt-1">
                Backup and restore Extreme Platform ONE configuration
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <TouchButton
                variant="outline"
                size="sm"
                onClick={loadBackups}
                aria-label="Refresh backup list"
                className="hover:bg-muted/80 transition-colors shadow-sm"
              >
                <RefreshCw className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Refresh</span>
              </TouchButton>
              <TouchButton
                size="sm"
                onClick={() => setShowCreateDialog(true)}
                aria-label="Create new configuration backup"
                className="shadow-md hover:shadow-lg transition-all bg-gradient-to-r from-primary to-primary/90"
              >
                <Upload className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Create Backup</span>
              </TouchButton>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="inline-block p-6 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-2xl mb-4">
                <Database className="h-16 w-16 mx-auto text-blue-500/60" />
              </div>
              <p className="text-lg font-semibold mb-2">No configuration backups found</p>
              <p className="text-sm max-w-md mx-auto">Create your first backup to safeguard your Extreme Platform ONE configuration and enable quick restore capabilities</p>
            </div>
          ) : (
            <div className="space-y-3">
              {backups.map((backup, index) => (
                <div
                  key={backup.filename}
                  className="group flex items-center justify-between p-4 border-2 rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-all duration-300 hover:shadow-md"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                      <Database className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-base group-hover:text-primary transition-colors">{backup.filename}</p>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDate(backup.created)}
                        </span>
                        <Badge variant="outline" className="font-mono text-xs">{formatFileSize(backup.size)}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-100 group-hover:opacity-100 transition-opacity">
                    <TouchButton
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadBackup(backup.filename)}
                      aria-label={`Download backup ${backup.filename}`}
                      className="hover:bg-green-50 hover:text-green-700 hover:border-green-300 transition-colors"
                    >
                      <Download className="h-4 w-4 md:mr-2" />
                      <span className="hidden md:inline">Download</span>
                    </TouchButton>
                    <TouchButton
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedBackup(backup.filename);
                        setShowRestoreDialog(true);
                      }}
                      aria-label={`Restore configuration from ${backup.filename}`}
                      className="hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 transition-colors"
                    >
                      <RefreshCw className="h-4 w-4 md:mr-2" />
                      <span className="hidden md:inline">Restore</span>
                    </TouchButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Flash Files */}
      <Card className="border-2 shadow-lg hover:shadow-xl transition-shadow duration-300">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl flex items-center gap-2">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <HardDrive className="h-5 w-5 text-purple-600" />
            </div>
            Flash Memory Files
          </CardTitle>
          <CardDescription className="mt-1">
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
              {flashFiles.map((file, index) => (
                <div
                  key={file.filename}
                  className="group flex items-center justify-between p-4 border-2 rounded-xl hover:border-purple-300 hover:bg-purple-50/50 transition-all duration-300"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
                      <HardDrive className="h-4 w-4 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{file.filename}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs font-mono">
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
                    onClick={() => {
                      setFileToDelete(file.filename);
                      setShowDeleteDialog(true);
                    }}
                    aria-label={`Delete file ${file.filename}`}
                    className="hover:bg-red-50 hover:text-red-700 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
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
              <Label htmlFor="backup-filename">Backup Filename</Label>
              <Input
                id="backup-filename"
                value={newBackupName}
                onChange={(e) => setNewBackupName(e.target.value)}
                placeholder="config-backup"
                onKeyPress={(e) => e.key === 'Enter' && handleCreateBackup()}
                aria-describedby="backup-filename-hint"
                aria-label="Enter backup filename"
              />
              <p id="backup-filename-hint" className="text-xs text-muted-foreground">
                Only letters, numbers, hyphens, underscores, and dots are allowed
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={creating}
              aria-label="Cancel backup creation"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateBackup}
              disabled={creating}
              aria-label="Create configuration backup"
            >
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
              Are you sure you want to restore from this backup? Extreme Platform ONE will be restarted
              and current configuration will be replaced.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Warning:</strong> This action will restart Extreme Platform ONE and may cause
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
              aria-label="Cancel restore operation"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRestoreBackup}
              aria-label="Confirm restore configuration"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Restore Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete File Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Flash File</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this file? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {fileToDelete && (
              <p className="text-sm">
                <strong>File to delete:</strong> {fileToDelete}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setFileToDelete(null);
              }}
              aria-label="Cancel delete operation"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteFlashFile}
              aria-label="Confirm delete file"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
