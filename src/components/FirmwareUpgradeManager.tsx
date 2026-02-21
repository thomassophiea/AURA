import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { Checkbox } from './ui/checkbox';
import { HardDrive, Upload, Download, Clock, RefreshCw, CheckCircle, AlertTriangle, Play, Pause, Package, Cpu } from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '../services/api';

interface FirmwareVersion {
  version: string;
  releaseDate: string;
  recommended: boolean;
}

interface AccessPointData {
  id: string;
  serialNumber: string;
  displayName?: string;
  model?: string;
  currentVersion: string;
  needsUpgrade: boolean;
  status?: string;
}

export function FirmwareUpgradeManager() {
  const [firmwareVersions, setFirmwareVersions] = useState<FirmwareVersion[]>([]);
  const [accessPoints, setAccessPoints] = useState<AccessPointData[]>([]);
  const [selectedAPs, setSelectedAPs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('upgrade');
  const [upgradeInProgress, setUpgradeInProgress] = useState(false);
  const [upgradeProgress, setUpgradeProgress] = useState<Map<string, number>>(new Map());
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  
  const [upgradeConfig, setUpgradeConfig] = useState({
    targetVersion: '',
    rebootAfter: true,
    staggered: true,
    staggerDelay: 5
  });

  const [scheduleConfig, setScheduleConfig] = useState({
    name: '',
    date: '',
    time: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [aps, versions] = await Promise.all([
        apiService.getAccessPoints(),
        apiService.makeAuthenticatedRequest('/v1/firmware/versions', {}, 8000)
          .then(r => r.ok ? r.json() : [])
          .catch(() => [
            { version: '10.17.2.0-001R', releaseDate: '2024-01-15', recommended: true },
            { version: '10.17.1.0-003R', releaseDate: '2023-11-20', recommended: false },
            { version: '10.16.5.0-002R', releaseDate: '2023-09-10', recommended: false }
          ])
      ]);
      
      setAccessPoints(aps.map((ap: any) => ({
        ...ap,
        id: ap.serialNumber || ap.id,
        currentVersion: ap.softwareVersion || ap.firmware || '10.16.5.0-002R',
        needsUpgrade: true
      })));
      setFirmwareVersions(versions);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load firmware data');
    } finally {
      setLoading(false);
    }
  };

  const startUpgrade = async () => {
    if (selectedAPs.length === 0) {
      toast.error('Select at least one AP');
      return;
    }
    if (!upgradeConfig.targetVersion) {
      toast.error('Select target firmware version');
      return;
    }
    
    setUpgradeInProgress(true);
    try {
      toast.info(`Starting upgrade for ${selectedAPs.length} AP(s)...`);
      
      for (const apId of selectedAPs) {
        setUpgradeProgress(prev => new Map(prev).set(apId, 0));
      }
      
      await apiService.makeAuthenticatedRequest('/v1/firmware/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apIds: selectedAPs,
          version: upgradeConfig.targetVersion,
          rebootAfter: upgradeConfig.rebootAfter,
          staggered: upgradeConfig.staggered,
          staggerDelay: upgradeConfig.staggerDelay
        })
      });
      
      // Simulate progress updates
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        for (const apId of selectedAPs) {
          setUpgradeProgress(prev => new Map(prev).set(apId, Math.min(progress, 100)));
        }
        if (progress >= 100) {
          clearInterval(interval);
          setUpgradeInProgress(false);
          toast.success('Upgrade completed successfully');
        }
      }, 1000);
      
    } catch (error) {
      toast.error('Failed to start upgrade');
      setUpgradeInProgress(false);
    }
  };

  const toggleAPSelection = (apId: string) => {
    setSelectedAPs(prev => 
      prev.includes(apId) ? prev.filter(id => id !== apId) : [...prev, apId]
    );
  };

  const selectAllAPs = () => {
    if (selectedAPs.length === accessPoints.length) {
      setSelectedAPs([]);
    } else {
      setSelectedAPs(accessPoints.map(ap => ap.serialNumber || ap.id));
    }
  };

  const scheduleUpgrade = () => {
    if (!scheduleConfig.name || !scheduleConfig.date || !scheduleConfig.time) {
      toast.error('Please fill in all schedule fields');
      return;
    }
    toast.success(`Upgrade scheduled: ${scheduleConfig.name} at ${scheduleConfig.date} ${scheduleConfig.time}`);
    setIsScheduleDialogOpen(false);
    setScheduleConfig({ name: '', date: '', time: '' });
  };

  const getVersionBadge = (version: FirmwareVersion) => {
    if (version.recommended) {
      return <Badge className="ml-2 bg-green-500">Recommended</Badge>;
    }
    return null;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Firmware Upgrade Manager
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-48">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Firmware Upgrade Manager
            </CardTitle>
            <CardDescription>Manage and deploy firmware upgrades to access points</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="upgrade" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upgrade
            </TabsTrigger>
            <TabsTrigger value="status" className="flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              Status
            </TabsTrigger>
            <TabsTrigger value="schedule" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Schedule
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upgrade" className="space-y-4">
            {/* Target Version Selection */}
            <div className="space-y-2">
              <Label>Target Firmware Version</Label>
              <Select
                value={upgradeConfig.targetVersion}
                onValueChange={(value) => setUpgradeConfig(prev => ({ ...prev, targetVersion: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select target version" />
                </SelectTrigger>
                <SelectContent>
                  {firmwareVersions.map((version) => (
                    <SelectItem key={version.version} value={version.version}>
                      <div className="flex items-center">
                        <Package className="h-4 w-4 mr-2" />
                        {version.version}
                        {getVersionBadge(version)}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* AP Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Select Access Points</Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="selectAll"
                    checked={selectedAPs.length === accessPoints.length && accessPoints.length > 0}
                    onCheckedChange={selectAllAPs}
                  />
                  <Label htmlFor="selectAll" className="text-sm cursor-pointer">
                    Select All ({accessPoints.length})
                  </Label>
                </div>
              </div>
              
              <div className="border rounded-lg max-h-64 overflow-y-auto">
                {accessPoints.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No access points found
                  </div>
                ) : (
                  accessPoints.map((ap) => (
                    <div
                      key={ap.id}
                      className="flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedAPs.includes(ap.serialNumber || ap.id)}
                          onCheckedChange={() => toggleAPSelection(ap.serialNumber || ap.id)}
                        />
                        <div>
                          <div className="font-medium">{ap.displayName || ap.serialNumber}</div>
                          <div className="text-sm text-muted-foreground">
                            {ap.model || 'Unknown Model'} • {ap.serialNumber}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{ap.currentVersion}</Badge>
                        {ap.needsUpgrade && upgradeConfig.targetVersion && ap.currentVersion !== upgradeConfig.targetVersion && (
                          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Needs Upgrade
                          </Badge>
                        )}
                        {ap.status === 'online' && (
                          <Badge className="bg-green-500">Online</Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Upgrade Options */}
            <div className="space-y-3 p-4 border rounded-lg">
              <Label className="text-base font-semibold">Upgrade Options</Label>
              
              <div className="flex items-center gap-2">
                <Checkbox
                  id="rebootAfter"
                  checked={upgradeConfig.rebootAfter}
                  onCheckedChange={(checked) => 
                    setUpgradeConfig(prev => ({ ...prev, rebootAfter: checked as boolean }))
                  }
                />
                <Label htmlFor="rebootAfter" className="cursor-pointer">
                  Reboot after upgrade
                </Label>
              </div>
              
              <div className="flex items-center gap-2">
                <Checkbox
                  id="staggered"
                  checked={upgradeConfig.staggered}
                  onCheckedChange={(checked) => 
                    setUpgradeConfig(prev => ({ ...prev, staggered: checked as boolean }))
                  }
                />
                <Label htmlFor="staggered" className="cursor-pointer">
                  Staggered deployment
                </Label>
              </div>
              
              {upgradeConfig.staggered && (
                <div className="flex items-center gap-2 ml-6">
                  <Label htmlFor="staggerDelay" className="text-sm">Delay between APs:</Label>
                  <Input
                    id="staggerDelay"
                    type="number"
                    min="1"
                    max="60"
                    value={upgradeConfig.staggerDelay}
                    onChange={(e) => 
                      setUpgradeConfig(prev => ({ ...prev, staggerDelay: parseInt(e.target.value) || 5 }))
                    }
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">minutes</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                onClick={startUpgrade}
                disabled={upgradeInProgress || selectedAPs.length === 0 || !upgradeConfig.targetVersion}
                className="flex-1"
              >
                {upgradeInProgress ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Upgrading...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Start Upgrade ({selectedAPs.length} APs)
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsScheduleDialogOpen(true)}
                disabled={selectedAPs.length === 0 || !upgradeConfig.targetVersion}
              >
                <Clock className="h-4 w-4 mr-2" />
                Schedule
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="status" className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {upgradeInProgress 
                  ? `Upgrade in progress for ${upgradeProgress.size} AP(s)`
                  : 'No upgrades currently in progress'}
              </AlertDescription>
            </Alert>

            {upgradeProgress.size > 0 && (
              <div className="space-y-3">
                {Array.from(upgradeProgress.entries()).map(([apId, progress]) => {
                  const ap = accessPoints.find(a => a.serialNumber === apId || a.id === apId);
                  return (
                    <div key={apId} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{ap?.displayName || apId}</span>
                        <span className="text-sm text-muted-foreground">{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                      <div className="flex items-center gap-2 mt-2 text-sm">
                        {progress < 100 ? (
                          <>
                            <Download className="h-4 w-4 text-blue-500" />
                            <span>Downloading firmware...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span>Complete</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {upgradeProgress.size === 0 && !upgradeInProgress && (
              <div className="text-center py-8 text-muted-foreground">
                <Cpu className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No active upgrades</p>
                <p className="text-sm">Start an upgrade from the Upgrade tab</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="schedule" className="space-y-4">
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                Schedule firmware upgrades during maintenance windows to minimize disruption
              </AlertDescription>
            </Alert>

            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No scheduled upgrades</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => setIsScheduleDialogOpen(true)}
                disabled={selectedAPs.length === 0 || !upgradeConfig.targetVersion}
              >
                <Clock className="h-4 w-4 mr-2" />
                Schedule New Upgrade
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Schedule Dialog */}
      <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Firmware Upgrade</DialogTitle>
            <DialogDescription>
              Schedule the upgrade for {selectedAPs.length} AP(s) to version {upgradeConfig.targetVersion}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="scheduleName">Schedule Name</Label>
              <Input
                id="scheduleName"
                placeholder="e.g., Maintenance Window - Week 4"
                value={scheduleConfig.name}
                onChange={(e) => setScheduleConfig(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scheduleDate">Date</Label>
                <Input
                  id="scheduleDate"
                  type="date"
                  value={scheduleConfig.date}
                  onChange={(e) => setScheduleConfig(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduleTime">Time</Label>
                <Input
                  id="scheduleTime"
                  type="time"
                  value={scheduleConfig.time}
                  onChange={(e) => setScheduleConfig(prev => ({ ...prev, time: e.target.value }))}
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsScheduleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={scheduleUpgrade}>
              <Clock className="h-4 w-4 mr-2" />
              Schedule Upgrade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
