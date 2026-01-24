import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Input } from './ui/input';
import {
  Wifi,
  Download,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Calendar,
  Clock,
  XCircle,
  TrendingUp
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
import { DesktopOnly } from './MobileOptimized';

interface AccessPoint {
  serialNumber: string;
  displayName?: string;
  model?: string;
  currentFirmware?: string;
  status?: string;
  siteId?: string;
}

interface FirmwareVersion {
  version: string;
  releaseDate: string;
  isRecommended: boolean;
  features?: string[];
}

interface UpgradeSchedule {
  id: string;
  name: string;
  targetVersion: string;
  scheduledTime: string;
  deviceCount: number;
  status: string;
}

export function APFirmwareManager() {
  const [accessPoints, setAccessPoints] = useState<AccessPoint[]>([]);
  const [firmwareVersions, setFirmwareVersions] = useState<FirmwareVersion[]>([]);
  const [schedules, setSchedules] = useState<UpgradeSchedule[]>([]);
  const [selectedAPs, setSelectedAPs] = useState<Set<string>>(new Set());
  const [selectedVersion, setSelectedVersion] = useState('');
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduleName, setScheduleName] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [aps, versions, scheduleList] = await Promise.all([
        apiService.getAccessPoints(),
        apiService.getAPSoftwareVersions(),
        apiService.getAPUpgradeSchedules()
      ]);
      setAccessPoints(aps);
      setFirmwareVersions(versions);
      setSchedules(scheduleList);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load firmware data');
    } finally {
      setLoading(false);
    }
  };

  const toggleAPSelection = (serialNumber: string) => {
    const newSelection = new Set(selectedAPs);
    if (newSelection.has(serialNumber)) {
      newSelection.delete(serialNumber);
    } else {
      newSelection.add(serialNumber);
    }
    setSelectedAPs(newSelection);
  };

  const selectAll = () => {
    setSelectedAPs(new Set(accessPoints.map(ap => ap.serialNumber)));
  };

  const deselectAll = () => {
    setSelectedAPs(new Set());
  };

  const handleUpgradeNow = async () => {
    if (selectedAPs.size === 0) {
      toast.error('Please select at least one access point');
      return;
    }
    if (!selectedVersion) {
      toast.error('Please select a firmware version');
      return;
    }

    setUpgrading(true);
    try {
      await apiService.upgradeAPSoftware(Array.from(selectedAPs), selectedVersion);
      toast.success(`Firmware upgrade initiated for ${selectedAPs.size} access point(s)`);
      setShowUpgradeDialog(false);
      setSelectedAPs(new Set());
      await loadData();
    } catch (error) {
      console.error('Failed to upgrade firmware:', error);
      toast.error('Failed to initiate firmware upgrade');
    } finally {
      setUpgrading(false);
    }
  };

  const handleScheduleUpgrade = async () => {
    if (selectedAPs.size === 0) {
      toast.error('Please select at least one access point');
      return;
    }
    if (!selectedVersion || !scheduleName || !scheduleTime) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      await apiService.createAPUpgradeSchedule({
        name: scheduleName,
        targetVersion: selectedVersion,
        scheduledTime: new Date(scheduleTime).toISOString(),
        deviceSerialNumbers: Array.from(selectedAPs)
      });
      toast.success('Upgrade scheduled successfully');
      setShowScheduleDialog(false);
      setScheduleName('');
      setScheduleTime('');
      setSelectedAPs(new Set());
      await loadData();
    } catch (error) {
      console.error('Failed to schedule upgrade:', error);
      toast.error('Failed to schedule firmware upgrade');
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;

    try {
      await apiService.deleteAPUpgradeSchedule(scheduleId);
      toast.success('Schedule deleted successfully');
      await loadData();
    } catch (error) {
      console.error('Failed to delete schedule:', error);
      toast.error('Failed to delete schedule');
    }
  };

  const getUpgradeStatus = (ap: AccessPoint) => {
    const recommended = firmwareVersions.find(v => v.isRecommended);
    if (!recommended) return { status: 'unknown', color: 'gray' };

    if (ap.currentFirmware === recommended.version) {
      return { status: 'up-to-date', color: 'green' };
    }
    return { status: 'update-available', color: 'yellow' };
  };

  const stats = {
    total: accessPoints.length,
    upToDate: accessPoints.filter(ap => getUpgradeStatus(ap).status === 'up-to-date').length,
    updateAvailable: accessPoints.filter(ap => getUpgradeStatus(ap).status === 'update-available').length,
    selected: selectedAPs.size
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
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Download className="h-6 w-6 md:h-8 md:w-8" />
            AP Firmware Management
          </h2>
          <DesktopOnly>
            <p className="text-muted-foreground">
              Manage access point firmware upgrades and schedules
            </p>
          </DesktopOnly>
        </div>
        <TouchButton variant="outline" size="sm" onClick={loadData} aria-label="Refresh AP firmware data">
          <RefreshCw className="h-4 w-4 md:mr-2" />
          <span className="hidden md:inline">Refresh</span>
        </TouchButton>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total APs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{stats.total}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Up to Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">{stats.upToDate}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Updates Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              <span className="text-2xl font-bold">{stats.updateAvailable}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Selected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{stats.selected}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upgrade Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Firmware Selection & Actions</CardTitle>
          <CardDescription>
            Select firmware version and access points to upgrade
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Target Firmware Version</Label>
            <Select value={selectedVersion} onValueChange={setSelectedVersion}>
              <SelectTrigger>
                <SelectValue placeholder="Select firmware version" />
              </SelectTrigger>
              <SelectContent>
                {firmwareVersions.map((version) => (
                  <SelectItem key={version.version} value={version.version}>
                    <div className="flex items-center gap-2">
                      <span>{version.version}</span>
                      {version.isRecommended && (
                        <Badge className="bg-green-500">Recommended</Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => setShowUpgradeDialog(true)}
              disabled={selectedAPs.size === 0 || !selectedVersion}
            >
              <Download className="h-4 w-4 mr-2" />
              Upgrade Now ({selectedAPs.size} APs)
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowScheduleDialog(true)}
              disabled={selectedAPs.size === 0 || !selectedVersion}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Schedule Upgrade
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Access Point List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Access Points</CardTitle>
              <CardDescription>
                Select access points to upgrade
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAll} aria-label="Select all access points">
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={deselectAll} aria-label="Deselect all access points">
                Deselect All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {accessPoints.map((ap) => {
              const status = getUpgradeStatus(ap);
              return (
                <div
                  key={ap.serialNumber}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedAPs.has(ap.serialNumber)}
                      onCheckedChange={() => toggleAPSelection(ap.serialNumber)}
                    />
                    <Wifi className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{ap.displayName || ap.serialNumber}</p>
                      <p className="text-sm text-muted-foreground">{ap.model}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-medium">v{ap.currentFirmware || 'Unknown'}</p>
                      <Badge
                        variant={status.status === 'up-to-date' ? 'default' : 'outline'}
                        className={
                          status.color === 'green'
                            ? 'bg-green-500'
                            : status.color === 'yellow'
                            ? 'bg-yellow-500'
                            : ''
                        }
                      >
                        {status.status === 'up-to-date' ? 'Up to Date' : 'Update Available'}
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Scheduled Upgrades */}
      {schedules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Scheduled Upgrades</CardTitle>
            <CardDescription>
              Upcoming firmware upgrade schedules
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{schedule.name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{new Date(schedule.scheduledTime).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-medium">v{schedule.targetVersion}</p>
                      <p className="text-sm text-muted-foreground">
                        {schedule.deviceCount} device(s)
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteSchedule(schedule.id)}
                    >
                      <XCircle className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upgrade Now Dialog */}
      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Firmware Upgrade</DialogTitle>
            <DialogDescription>
              This will immediately upgrade {selectedAPs.size} access point(s) to version{' '}
              {selectedVersion}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                Access points will reboot during the upgrade process
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpgradeDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpgradeNow} disabled={upgrading}>
              {upgrading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Upgrading...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Start Upgrade
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Firmware Upgrade</DialogTitle>
            <DialogDescription>
              Schedule an upgrade for {selectedAPs.size} access point(s)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Schedule Name</Label>
              <Input
                value={scheduleName}
                onChange={(e) => setScheduleName(e.target.value)}
                placeholder="e.g., Weekly Maintenance Upgrade"
              />
            </div>
            <div className="space-y-2">
              <Label>Scheduled Time</Label>
              <Input
                type="datetime-local"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleScheduleUpgrade}>
              <Calendar className="h-4 w-4 mr-2" />
              Create Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
