import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Play, Copy, Trash2, Filter, Info, BarChart3 } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { apiService } from '../services/api';
import { TopApplicationsDebug } from './TopApplicationsDebug';

interface ApiRequest {
  id: string;
  method: string;
  endpoint: string;
  body?: string;
  timestamp: Date;
}

interface ApiResponse {
  status: number;
  statusText: string;
  body: string;
  headers: Record<string, string>;
  duration: number;
}

const endpointCategories = {
  'Authentication & Authorization': [
    { method: 'POST', endpoint: '/v1/oauth2/token', description: 'Get OAuth2 access token' },
    { method: 'POST', endpoint: '/v1/oauth2/refreshToken', description: 'Refresh OAuth2 token' },
    { method: 'DELETE', endpoint: '/v1/oauth2/token/{token}', description: 'Revoke OAuth2 token' },
    { method: 'POST', endpoint: '/v1/oauth2/introspecttoken', description: 'Introspect OAuth2 token' },
    { method: 'GET', endpoint: '/v1/administrators', description: 'Get administrators' },
    { method: 'POST', endpoint: '/v1/administrators', description: 'Create administrator' },
    { method: 'PUT', endpoint: '/v1/administrators/adminpassword', description: 'Update admin password' },
    { method: 'GET', endpoint: '/v1/administrators/{userId}', description: 'Get administrator by ID' },
    { method: 'PUT', endpoint: '/v1/administrators/{userId}', description: 'Update administrator' },
    { method: 'DELETE', endpoint: '/v1/administrators/{userId}', description: 'Delete administrator' },
    { method: 'PUT', endpoint: '/v1/administratorsTimeout/{userId}', description: 'Set administrator timeout' },
    { method: 'GET', endpoint: '/v1/appkeys', description: 'Get application keys' },
    { method: 'POST', endpoint: '/v1/appkeys', description: 'Create application key' },
    { method: 'GET', endpoint: '/v1/appkeys/{appKey}', description: 'Get application key' },
    { method: 'DELETE', endpoint: '/v1/appkeys/{appKey}', description: 'Delete application key' },
  ],
  
  'Access Control': [
    { method: 'GET', endpoint: '/v1/accesscontrol', description: 'Get access control lists' },
    { method: 'PUT', endpoint: '/v1/accesscontrol', description: 'Update access control list' },
    { method: 'POST', endpoint: '/v1/accesscontrol', description: 'Create access control list' },
    { method: 'DELETE', endpoint: '/v1/accesscontrol', description: 'Delete access control list' },
  ],

  'Access Points': [
    { method: 'GET', endpoint: '/v1/aps', description: 'Get access points' },
    { method: 'GET', endpoint: '/v1/aps/query', description: 'Query access points' },
    { method: 'GET', endpoint: '/v1/aps/query/visualize', description: 'Visualize AP query results' },
    { method: 'GET', endpoint: '/v1/aps/query/columns', description: 'Get AP query columns' },
    { method: 'GET', endpoint: '/v1/aps/{apSerialNumber}/bssid0', description: 'Get AP BSSID0' },
    { method: 'GET', endpoint: '/v1/aps/adoptionrules', description: 'Get AP adoption rules' },
    { method: 'PUT', endpoint: '/v1/aps/adoptionrules', description: 'Update AP adoption rules' },
    { method: 'GET', endpoint: '/v1/aps/apbalance', description: 'Get AP balance settings' },
    { method: 'PUT', endpoint: '/v1/aps/apbalance', description: 'Update AP balance settings' },
    { method: 'POST', endpoint: '/v1/aps/create', description: 'Create access point' },
    { method: 'GET', endpoint: '/v1/aps/default', description: 'Get default AP configuration' },
    { method: 'GET', endpoint: '/v1/aps/displaynames', description: 'Get AP display names' },
    { method: 'GET', endpoint: '/v1/aps/hardwaretypes', description: 'Get AP hardware types' },
    { method: 'GET', endpoint: '/v1/aps/platforms', description: 'Get AP platforms' },
    { method: 'DELETE', endpoint: '/v1/aps/list', description: 'Delete AP list' },
    { method: 'PUT', endpoint: '/v1/aps/multiconfig', description: 'Multi-configure APs' },
    { method: 'PUT', endpoint: '/v1/aps/reboot', description: 'Reboot APs' },
    { method: 'PUT', endpoint: '/v1/aps/releasetocloud', description: 'Release APs to cloud' },
    { method: 'PUT', endpoint: '/v1/aps/assign', description: 'Assign APs' },
    { method: 'PUT', endpoint: '/v1/aps/affinity', description: 'Set AP affinity' },
    { method: 'POST', endpoint: '/v1/aps/clone', description: 'Clone AP configuration' },
    { method: 'GET', endpoint: '/v1/aps/registration', description: 'Get AP registration' },
    { method: 'PUT', endpoint: '/v1/aps/registration', description: 'Update AP registration' },
    { method: 'PUT', endpoint: '/v1/aps/setRuState', description: 'Set RU state for APs' },
    { method: 'PUT', endpoint: '/v1/aps/swupgrade', description: 'Software upgrade APs' },
    { method: 'PUT', endpoint: '/v1/aps/swversion', description: 'Set AP software version' },
    { method: 'PUT', endpoint: '/v1/aps/upgrade', description: 'Upgrade APs' },
    { method: 'GET', endpoint: '/v1/aps/upgradeimagelist', description: 'Get upgrade image list' },
    { method: 'PUT', endpoint: '/v1/aps/upgradeschedule', description: 'Schedule AP upgrade' },
    { method: 'GET', endpoint: '/v1/aps/{apSerialNumber}', description: 'Get specific AP' },
    { method: 'PUT', endpoint: '/v1/aps/{apSerialNumber}', description: 'Update specific AP' },
    { method: 'DELETE', endpoint: '/v1/aps/{apSerialNumber}', description: 'Delete specific AP' },
    { method: 'GET', endpoint: '/v1/aps/antenna/{apSerialNumber}', description: 'Get AP antenna info' },
    { method: 'PUT', endpoint: '/v1/aps/{apSerialNumber}/copytodefault', description: 'Copy AP to default' },
    { method: 'PUT', endpoint: '/v1/aps/{apSerialNumber}/logs', description: 'Get AP logs' },
    { method: 'PUT', endpoint: '/v1/aps/{apSerialNumber}/realcapture', description: 'Real capture on AP' },
    { method: 'PUT', endpoint: '/v1/aps/{apSerialNumber}/reboot', description: 'Reboot specific AP' },
    { method: 'PUT', endpoint: '/v1/aps/{apSerialNumber}/locate', description: 'Locate AP' },
    { method: 'PUT', endpoint: '/v1/aps/{apSerialNumber}/reset', description: 'Reset AP' },
    { method: 'PUT', endpoint: '/v1/aps/{apSerialNumber}/setRuState', description: 'Set AP RU state' },
    { method: 'GET', endpoint: '/v1/aps/{apSerialNumber}/traceurls', description: 'Get AP trace URLs' },
    { method: 'PUT', endpoint: '/v1/aps/{apSerialNumber}/upgrade', description: 'Upgrade specific AP' },
    { method: 'GET', endpoint: '/v1/aps/{apSerialNumber}/stations', description: 'Get AP stations' },
    { method: 'GET', endpoint: '/v1/ap/environment/{apSerialNumber}', description: 'Get AP environment' },
    { method: 'GET', endpoint: '/v1/aps/{apSerialNumber}/location', description: 'Get AP location' },
    { method: 'GET', endpoint: '/v1/aps/{apSerialNumber}/lldp', description: 'Get AP LLDP info' },
    { method: 'GET', endpoint: '/v1/aps/{apSerialNumber}/alarms', description: 'Get AP alarms' },
    { method: 'GET', endpoint: '/v1/aps/{apSerialNumber}/smartrf', description: 'Get AP Smart RF info' },
    { method: 'PUT', endpoint: '/v1/aps/aploglevel', description: 'Set AP log level' },
    { method: 'GET', endpoint: '/v1/aps/ifstats/{apSerialNumber}', description: 'Get AP interface stats' },
    { method: 'GET', endpoint: '/v1/aps/ifstats', description: 'Get all AP interface stats' },
  ],

  'Certificate Management': [
    { method: 'POST', endpoint: '/v1/aps/cert/signrequest', description: 'Sign AP certificate request' },
    { method: 'POST', endpoint: '/v1/aps/cert/apply', description: 'Apply AP certificate' },
    { method: 'PUT', endpoint: '/v1/aps/cert/reset', description: 'Reset AP certificate' },
    { method: 'GET', endpoint: '/v1/aps/{apSerialNumber}/cert', description: 'Get AP certificate' },
  ],

  'Sites & Site Management': [
    { method: 'GET', endpoint: '/v3/sites', description: 'Get sites' },
    { method: 'POST', endpoint: '/v3/sites', description: 'Create site' },
    { method: 'GET', endpoint: '/v3/sites/countrylist', description: 'Get country list' },
    { method: 'GET', endpoint: '/v3/sites/default', description: 'Get default site' },
    { method: 'GET', endpoint: '/v3/sites/nametoidmap', description: 'Get site name to ID map' },
    { method: 'GET', endpoint: '/v3/sites/{siteId}', description: 'Get specific site' },
    { method: 'PUT', endpoint: '/v3/sites/{siteId}', description: 'Update site' },
    { method: 'DELETE', endpoint: '/v3/sites/{siteId}', description: 'Delete site' },
    { method: 'POST', endpoint: '/v3/sites/clone/{siteId}', description: 'Clone site' },
    { method: 'GET', endpoint: '/v3/sites/{siteid}/stations', description: 'Get site stations' },
    { method: 'GET', endpoint: '/v3/sites/{siteId}/smartrf', description: 'Get site Smart RF' },
    { method: 'GET', endpoint: '/v1/sites/{siteId}/aps/report', description: 'Get site APs report' },
  ],

  'Stations & Clients': [
    { method: 'GET', endpoint: '/v1/stations', description: 'Get stations' },
    { method: 'POST', endpoint: '/v1/stations/disassociate', description: 'Disassociate stations' },
    { method: 'GET', endpoint: '/v1/stations/{macaddress}', description: 'Get specific station' },
    { method: 'GET', endpoint: '/v1/stations/query', description: 'Query stations (v1)' },
    { method: 'GET', endpoint: '/v2/stations/query', description: 'Query stations (v2)' },
    { method: 'GET', endpoint: '/v1/stations/query/visualize', description: 'Visualize station query (v1)' },
    { method: 'GET', endpoint: '/v2/stations/query/visualize', description: 'Visualize station query (v2)' },
    { method: 'GET', endpoint: '/v1/stations/query/columns', description: 'Get station query columns (v1)' },
    { method: 'GET', endpoint: '/v2/stations/query/columns', description: 'Get station query columns (v2)' },
    { method: 'GET', endpoint: '/v1/stations/{stationId}/location', description: 'Get station location' },
    { method: 'GET', endpoint: '/v1/stations/events/{macaddress}', description: 'Get station events' },
  ],

  'Network Profiles & Policies': [
    { method: 'GET', endpoint: '/v3/profiles', description: 'Get network profiles' },
    { method: 'POST', endpoint: '/v3/profiles', description: 'Create network profile' },
    { method: 'POST', endpoint: '/v4/profiles/', description: 'Create network profile (v4)' },
    { method: 'POST', endpoint: '/v3/profiles/{profileId}/clone', description: 'Clone profile' },
    { method: 'GET', endpoint: '/v3/profiles/nametoidmap', description: 'Get profile name to ID map' },
    { method: 'GET', endpoint: '/v3/profiles/{profileId}', description: 'Get specific profile' },
    { method: 'PUT', endpoint: '/v3/profiles/{profileId}', description: 'Update profile' },
    { method: 'DELETE', endpoint: '/v3/profiles/{profileId}', description: 'Delete profile' },
    { method: 'GET', endpoint: '/v3/profiles/{profileId}/channels', description: 'Get profile channels' },
    { method: 'GET', endpoint: '/v3/profiles/{profileId}/bssid0', description: 'Get profile BSSID0' },
    { method: 'GET', endpoint: '/v3/switchportprofile', description: 'Get switch port profiles' },
    { method: 'POST', endpoint: '/v3/switchportprofile', description: 'Create switch port profile' },
    { method: 'GET', endpoint: '/v3/switchportprofile/default', description: 'Get default switch port profile' },
    { method: 'GET', endpoint: '/v3/switchportprofile/nametoidmap', description: 'Get switch port profile name map' },
    { method: 'GET', endpoint: '/v3/switchportprofile/{profileId}', description: 'Get switch port profile' },
    { method: 'PUT', endpoint: '/v3/switchportprofile/{profileId}', description: 'Update switch port profile' },
    { method: 'DELETE', endpoint: '/v3/switchportprofile/{profileId}', description: 'Delete switch port profile' },
  ],

  'RF Management & Radio': [
    { method: 'GET', endpoint: '/v1/radios/channels', description: 'Get radio channels' },
    { method: 'GET', endpoint: '/v1/radios/modes', description: 'Get radio modes' },
    { method: 'GET', endpoint: '/v3/radios/smartrfchannels', description: 'Get Smart RF channels' },
    { method: 'GET', endpoint: '/v3/rfmgmt', description: 'Get RF management profiles' },
    { method: 'POST', endpoint: '/v3/rfmgmt', description: 'Create RF management profile' },
    { method: 'GET', endpoint: '/v3/rfmgmt/default', description: 'Get default RF management' },
    { method: 'GET', endpoint: '/v3/rfmgmt/nametoidmap', description: 'Get RF management name map' },
    { method: 'GET', endpoint: '/v3/rfmgmt/{rfmgmtId}', description: 'Get RF management profile' },
    { method: 'PUT', endpoint: '/v3/rfmgmt/{rfmgmtId}', description: 'Update RF management profile' },
    { method: 'DELETE', endpoint: '/v3/rfmgmt/{rfmgmtId}', description: 'Delete RF management profile' },
  ],

  'Services & Roles': [
    { method: 'GET', endpoint: '/v1/services', description: 'Get services' },
    { method: 'POST', endpoint: '/v1/services', description: 'Create service' },
    { method: 'GET', endpoint: '/v1/services/default', description: 'Get default service' },
    { method: 'GET', endpoint: '/v1/services/nametoidmap', description: 'Get service name map' },
    { method: 'GET', endpoint: '/v1/services/{serviceId}', description: 'Get specific service' },
    { method: 'PUT', endpoint: '/v1/services/{serviceId}', description: 'Update service' },
    { method: 'DELETE', endpoint: '/v1/services/{serviceId}', description: 'Delete service' },
    { method: 'GET', endpoint: '/v1/services/{serviceId}/deviceids', description: 'Get service device IDs' },
    { method: 'GET', endpoint: '/v1/services/{serviceId}/siteids', description: 'Get service site IDs' },
    { method: 'GET', endpoint: '/v1/services/{serviceId}/stations', description: 'Get service stations' },
    { method: 'GET', endpoint: '/v1/services/{serviceid}/bssid0', description: 'Get service BSSID0' },
    { method: 'GET', endpoint: '/v3/roles', description: 'Get roles' },
    { method: 'POST', endpoint: '/v3/roles', description: 'Create role' },
    { method: 'GET', endpoint: '/v3/roles/default', description: 'Get default role' },
    { method: 'GET', endpoint: '/v3/roles/nametoidmap', description: 'Get role name map' },
    { method: 'GET', endpoint: '/v3/roles/{roleId}', description: 'Get specific role' },
    { method: 'PUT', endpoint: '/v3/roles/{roleId}', description: 'Update role' },
    { method: 'POST', endpoint: '/v3/roles/{roleId}', description: 'Create role configuration' },
    { method: 'DELETE', endpoint: '/v3/roles/{roleId}', description: 'Delete role' },
    { method: 'GET', endpoint: '/v3/roles/{roleId}/rulestats', description: 'Get role rule stats' },
    { method: 'GET', endpoint: '/v1/roles/{roleid}/stations', description: 'Get role stations' },
  ],

  'Switching & Ports': [
    { method: 'GET', endpoint: '/v1/switches', description: 'Get switches' },
    { method: 'GET', endpoint: '/v1/switches/displaynames', description: 'Get switch display names' },
    { method: 'DELETE', endpoint: '/v1/switches/list', description: 'Delete switch list' },
    { method: 'PUT', endpoint: '/v1/switches/reboot', description: 'Reboot switches' },
    { method: 'PUT', endpoint: '/v1/switches/assign', description: 'Assign switches' },
    { method: 'GET', endpoint: '/v1/switches/{serialNumber}', description: 'Get specific switch' },
    { method: 'PUT', endpoint: '/v1/switches/{serialNumber}', description: 'Update switch' },
    { method: 'DELETE', endpoint: '/v1/switches/{serialNumber}', description: 'Delete switch' },
    { method: 'PUT', endpoint: '/v1/switches/{serialNumber}/logs', description: 'Get switch logs' },
    { method: 'PUT', endpoint: '/v1/switches/{serialNumber}/reboot', description: 'Reboot specific switch' },
    { method: 'POST', endpoint: '/v1/switches/clone', description: 'Clone switch configuration' },
    { method: 'PUT', endpoint: '/v1/switches/{serialNumber}/reset', description: 'Reset switch' },
    { method: 'PUT', endpoint: '/v1/switches/{serialNumber}/console/{consoleAction}', description: 'Switch console action' },
    { method: 'GET', endpoint: '/v1/switches/{serialNumber}/traceurls', description: 'Get switch trace URLs' },
    { method: 'PUT', endpoint: '/v1/switches/{serialNumber}/upgrade', description: 'Upgrade switch' },
    { method: 'PUT', endpoint: '/v1/switches/{serialNumber}/ports/{portNumber}', description: 'Update switch port' },
    { method: 'GET', endpoint: '/v1/switches/{serialNumber}/slots/{slotNumber}/ports/{portNumber}', description: 'Get switch port' },
    { method: 'PUT', endpoint: '/v1/switches/{serialNumber}/slots/{slotNumber}/ports/{portNumber}', description: 'Update switch slot port' },
    { method: 'GET', endpoint: '/v1/switches/{serialNumber}/clibackups', description: 'Get CLI backups' },
    { method: 'PUT', endpoint: '/v1/switches/{serialNumber}/configurationmode/{configurationMode}', description: 'Set configuration mode' },
    { method: 'PUT', endpoint: '/v1/switches/{serialNumber}/cliconfigs/backup', description: 'Backup CLI config' },
    { method: 'PUT', endpoint: '/v1/switches/{serialNumber}/cliconfigs/restore/{name}', description: 'Restore CLI config' },
    { method: 'PUT', endpoint: '/v1/switches/{serialNumber}/login', description: 'Switch login' },
  ],

  'Reports & Analytics': [
    { method: 'GET', endpoint: '/v1/reports/templates', description: 'Get report templates' },
    { method: 'POST', endpoint: '/v1/reports/templates', description: 'Create report template' },
    { method: 'GET', endpoint: '/v1/reports/templates/{templateId}', description: 'Get report template' },
    { method: 'PUT', endpoint: '/v1/reports/templates/{templateId}', description: 'Update report template' },
    { method: 'DELETE', endpoint: '/v1/reports/templates/{templateId}', description: 'Delete report template' },
    { method: 'GET', endpoint: '/v1/reports/templates/default', description: 'Get default report template' },
    { method: 'GET', endpoint: '/v1/reports/templates/nametoidmap', description: 'Get report template name map' },
    { method: 'GET', endpoint: '/v1/reports/scheduled', description: 'Get scheduled reports' },
    { method: 'POST', endpoint: '/v1/reports/scheduled', description: 'Create scheduled report' },
    { method: 'GET', endpoint: '/v1/reports/scheduled/{reportId}', description: 'Get scheduled report' },
    { method: 'PUT', endpoint: '/v1/reports/scheduled/{reportId}', description: 'Update scheduled report' },
    { method: 'DELETE', endpoint: '/v1/reports/scheduled/{reportId}', description: 'Delete scheduled report' },
    { method: 'GET', endpoint: '/v1/reports/scheduled/default', description: 'Get default scheduled report' },
    { method: 'GET', endpoint: '/v1/reports/scheduled/nametoidmap', description: 'Get scheduled report name map' },
    { method: 'GET', endpoint: '/v1/reports/generated', description: 'Get generated reports' },
    { method: 'GET', endpoint: '/v1/reports/generated/{filename}', description: 'Get generated report file' },
    { method: 'DELETE', endpoint: '/v1/reports/generated/{filename}', description: 'Delete generated report' },
    { method: 'PUT', endpoint: '/v1/reports/generated/filelist', description: 'Update report file list' },
    { method: 'GET', endpoint: '/v1/reports/widgets', description: 'Get report widgets' },
    { method: 'GET', endpoint: '/v1/aps/report', description: 'Get APs report' },
    { method: 'GET', endpoint: '/v1/aps/report/widgets', description: 'Get AP report widgets' },
    { method: 'PUT', endpoint: '/v1/aps/{apSerialNumber}/report', description: 'Update AP report' },
    { method: 'GET', endpoint: '/v1/aps/{apSerialNumber}/report', description: 'Get AP report' },
    { method: 'GET', endpoint: '/v1/report/sites', description: 'Get sites report' },
    { method: 'GET', endpoint: '/v1/report/aps/{apSerialNumber}', description: 'Get AP report' },
    { method: 'GET', endpoint: '/v1/report/aps/{apSerialNumber}/smartrf', description: 'Get AP SmartRF report' },
    { method: 'GET', endpoint: '/v1/report/flex/{duration}', description: 'Get flex report' },
    { method: 'GET', endpoint: '/v1/report/ports/{portId}', description: 'Get port report' },
    { method: 'GET', endpoint: '/v1/report/roles/{roleId}', description: 'Get role report' },
    { method: 'GET', endpoint: '/v1/report/services/{serviceId}', description: 'Get service report' },
    { method: 'GET', endpoint: '/v1/report/sites/{siteId}', description: 'Get site report' },
    { method: 'GET', endpoint: '/v1/report/stations/{stationId}', description: 'Get station report' },
    { method: 'GET', endpoint: '/v1/report/switches/{switchSerialNumber}', description: 'Get switch report' },
    { method: 'GET', endpoint: '/v1/report/location/aps/{apSerialNumber}', description: 'Get AP location report' },
    { method: 'GET', endpoint: '/v1/report/location/floor/{floorId}', description: 'Get floor location report' },
    { method: 'GET', endpoint: '/v1/report/location/stations/{stationId}', description: 'Get station location report' },
    { method: 'GET', endpoint: '/v2/report/upgrade/devices', description: 'Get device upgrade report' },
    { method: 'GET', endpoint: '/v3/sites/report/widgets', description: 'Get site report widgets' },
    { method: 'PUT', endpoint: '/v3/sites/report', description: 'Update sites report' },
    { method: 'GET', endpoint: '/v3/sites/report', description: 'Get sites report' },
    { method: 'GET', endpoint: '/v3/sites/report/venue', description: 'Get venue report' },
    { method: 'GET', endpoint: '/v1/sites/report/widgets', description: 'Get site report widgets (v1)' },
    { method: 'PUT', endpoint: '/v1/sites/{siteId}/report', description: 'Update site report' },
    { method: 'GET', endpoint: '/v1/sites/{siteId}/report', description: 'Get site report' },
    { method: 'GET', endpoint: '/v3/sites/{siteId}/report/venue', description: 'Get site venue report' },
    { method: 'GET', endpoint: '/v3/sites/report/impact', description: 'Get sites impact report' },
    { method: 'GET', endpoint: '/v3/sites/{siteId}/report/impact', description: 'Get site impact report' },
    { method: 'GET', endpoint: '/v3/sites/report/flex', description: 'Get sites flex report' },
    { method: 'GET', endpoint: '/v3/sites/report/location/floor/{floorId}', description: 'Get floor location report' },
    { method: 'GET', endpoint: '/v1/stations/report/widgets', description: 'Get station report widgets' },
    { method: 'PUT', endpoint: '/v1/stations/{stationId}/report', description: 'Update station report' },
    { method: 'GET', endpoint: '/v1/stations/{stationId}/report', description: 'Get station report' },
    { method: 'GET', endpoint: '/v1/roles/report/widgets', description: 'Get role report widgets' },
    { method: 'PUT', endpoint: '/v1/roles/{roleId}/report', description: 'Update role report' },
    { method: 'GET', endpoint: '/v1/roles/{roleId}/report', description: 'Get role report' },
    { method: 'GET', endpoint: '/v1/services/report/widgets', description: 'Get service report widgets' },
    { method: 'PUT', endpoint: '/v1/services/{serviceId}/report', description: 'Update service report' },
    { method: 'GET', endpoint: '/v1/services/{serviceId}/report', description: 'Get service report' },
    { method: 'GET', endpoint: '/v1/switches/ports/report/widgets', description: 'Get switch port report widgets' },
    { method: 'PUT', endpoint: '/v1/switches/{serialNumber}/ports/{portId}/report', description: 'Update switch port report' },
    { method: 'GET', endpoint: '/v1/switches/{serialNumber}/ports/{portId}/report', description: 'Get switch port report' },
    { method: 'GET', endpoint: '/v1/switches/report/widgets', description: 'Get switch report widgets' },
    { method: 'PUT', endpoint: '/v1/switches/{serialNumber}/report', description: 'Update switch report' },
    { method: 'GET', endpoint: '/v1/switches/{serialNumber}/report', description: 'Get switch report' },
  ],

  'System Configuration': [
    { method: 'GET', endpoint: '/v1/globalsettings', description: 'Get global settings' },
    { method: 'PUT', endpoint: '/v1/globalsettings', description: 'Update global settings' },
    { method: 'GET', endpoint: '/v1/nsightconfig', description: 'Get nSight configuration' },
    { method: 'PUT', endpoint: '/v1/nsightconfig', description: 'Update nSight configuration' },
    { method: 'GET', endpoint: '/v1/snmp', description: 'Get SNMP settings' },
    { method: 'GET', endpoint: '/v1/snmp/default', description: 'Get default SNMP settings' },
    { method: 'GET', endpoint: '/v1/auditlogs', description: 'Get audit logs' },
    { method: 'GET', endpoint: '/v1/notifications', description: 'Get notifications' },
    { method: 'GET', endpoint: '/v1/notifications/regional', description: 'Get regional notifications' },
    { method: 'GET', endpoint: '/v1/workflow', description: 'Get workflow' },
    { method: 'GET', endpoint: '/v1/devices/adoptionrules', description: 'Get device adoption rules' },
    { method: 'PUT', endpoint: '/v1/devices/adoptionrules', description: 'Update device adoption rules' },
    { method: 'GET', endpoint: '/v1/bestpractices/evaluate', description: 'Evaluate best practices' },
    { method: 'PUT', endpoint: '/v1/bestpractices/{id}/accept', description: 'Accept best practice' },
  ],

  'System State & Monitoring': [
    { method: 'GET', endpoint: '/v1/state/aps', description: 'Get APs state' },
    { method: 'GET', endpoint: '/v1/state/entityDistribution', description: 'Get entity distribution' },
    { method: 'GET', endpoint: '/v1/state/sites', description: 'Get sites state' },
    { method: 'GET', endpoint: '/v1/state/switches', description: 'Get switches state' },
    { method: 'GET', endpoint: '/v1/state/aps/{apSerialNumber}', description: 'Get AP state' },
    { method: 'GET', endpoint: '/v1/state/sites/{siteId}', description: 'Get site state' },
    { method: 'GET', endpoint: '/v1/state/switches/{switchSerialNumber}', description: 'Get switch state' },
    { method: 'GET', endpoint: '/v1/state/sites/{siteId}/aps', description: 'Get site APs state' },
  ],

  'Security & Analytics': [
    { method: 'GET', endpoint: '/v3/adsp', description: 'Get ADSP profiles' },
    { method: 'POST', endpoint: '/v3/adsp', description: 'Create ADSP profile' },
    { method: 'GET', endpoint: '/v3/adsp/default', description: 'Get default ADSP' },
    { method: 'GET', endpoint: '/v3/adsp/nametoidmap', description: 'Get ADSP name map' },
    { method: 'GET', endpoint: '/v3/adsp/{adspId}', description: 'Get ADSP profile' },
    { method: 'PUT', endpoint: '/v3/adsp/{adspId}', description: 'Update ADSP profile' },
    { method: 'DELETE', endpoint: '/v3/adsp/{adspId}', description: 'Delete ADSP profile' },
    { method: 'GET', endpoint: '/v4/adsp', description: 'Get ADSP profiles (v4)' },
    { method: 'POST', endpoint: '/v4/adsp', description: 'Create ADSP profile (v4)' },
    { method: 'GET', endpoint: '/v4/adsp/default', description: 'Get default ADSP (v4)' },
    { method: 'GET', endpoint: '/v4/adsp/nametoidmap', description: 'Get ADSP name map (v4)' },
    { method: 'GET', endpoint: '/v4/adsp/{adspId}', description: 'Get ADSP profile (v4)' },
    { method: 'PUT', endpoint: '/v4/adsp/{adspId}', description: 'Update ADSP profile (v4)' },
    { method: 'DELETE', endpoint: '/v4/adsp/{adspId}', description: 'Delete ADSP profile (v4)' },
    { method: 'GET', endpoint: '/v4/airdefense', description: 'Get air defense profiles' },
    { method: 'POST', endpoint: '/v4/airdefense', description: 'Create air defense profile' },
    { method: 'GET', endpoint: '/v4/airdefense/default', description: 'Get default air defense' },
    { method: 'GET', endpoint: '/v4/airdefense/nametoidmap', description: 'Get air defense name map' },
    { method: 'GET', endpoint: '/v4/airdefense/{adspId}', description: 'Get air defense profile' },
    { method: 'PUT', endpoint: '/v4/airdefense/{adspId}', description: 'Update air defense profile' },
    { method: 'DELETE', endpoint: '/v4/airdefense/{adspId}', description: 'Delete air defense profile' },
    { method: 'GET', endpoint: '/v3/analytics', description: 'Get analytics profiles' },
    { method: 'POST', endpoint: '/v3/analytics', description: 'Create analytics profile' },
    { method: 'GET', endpoint: '/v3/analytics/default', description: 'Get default analytics' },
    { method: 'GET', endpoint: '/v3/analytics/nametoidmap', description: 'Get analytics name map' },
    { method: 'GET', endpoint: '/v3/analytics/{analyticsProfileId}', description: 'Get analytics profile' },
    { method: 'PUT', endpoint: '/v3/analytics/{analyticsProfileId}', description: 'Update analytics profile' },
    { method: 'DELETE', endpoint: '/v3/analytics/{analyticsProfileId}', description: 'Delete analytics profile' },
  ],
};

export function ApiTestTool() {
  const [method, setMethod] = useState('GET');
  const [endpoint, setEndpoint] = useState('');
  const [requestBody, setRequestBody] = useState('');
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<ApiRequest[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const loadEndpoint = (endpointPath: string, endpointMethod: string) => {
    setEndpoint(endpointPath);
    setMethod(endpointMethod);
    if (endpointMethod === 'POST' || endpointMethod === 'PUT') {
      setRequestBody('{}');
    } else {
      setRequestBody('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const startTime = Date.now();
    
    try {
      let parsedBody = undefined;
      if ((method === 'POST' || method === 'PUT') && requestBody.trim()) {
        try {
          parsedBody = JSON.parse(requestBody);
        } catch {
          throw new Error('Invalid JSON in request body');
        }
      }

      const apiResponse = await apiService.makeAuthenticatedRequest(endpoint, {
        method,
        ...(parsedBody && { body: JSON.stringify(parsedBody) }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const duration = Date.now() - startTime;
      let responseBody: string;

      try {
        const responseText = await apiResponse.text();
        if (responseText) {
          // Try to parse as JSON for pretty printing
          try {
            const jsonData = JSON.parse(responseText);
            responseBody = JSON.stringify(jsonData, null, 2);
          } catch {
            // If not JSON, use as-is
            responseBody = responseText;
          }
        } else {
          responseBody = 'No response body';
        }
      } catch {
        responseBody = 'Error reading response';
      }

      const responseHeaders: Record<string, string> = {};
      apiResponse.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      setResponse({
        status: apiResponse.status,
        statusText: apiResponse.statusText,
        body: responseBody,
        headers: responseHeaders,
        duration,
      });

      // Add to history
      const newRequest: ApiRequest = {
        id: Date.now().toString(),
        method,
        endpoint,
        body: requestBody || undefined,
        timestamp: new Date(),
      };
      setHistory(prev => [newRequest, ...prev.slice(0, 49)]); // Keep last 50 requests

    } catch (error) {
      const duration = Date.now() - startTime;
      setResponse({
        status: 0,
        statusText: 'Network Error',
        body: error instanceof Error ? error.message : 'Unknown error occurred',
        headers: {},
        duration,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyResponse = () => {
    if (response) {
      navigator.clipboard.writeText(response.body);
    }
  };

  const clearHistory = () => {
    setHistory([]);
  };

  const loadFromHistory = (request: ApiRequest) => {
    setMethod(request.method);
    setEndpoint(request.endpoint);
    setRequestBody(request.body || '');
  };

  // Filter categories based on selected filter
  const filteredCategories = categoryFilter === 'all' 
    ? endpointCategories 
    : { [categoryFilter]: endpointCategories[categoryFilter as keyof typeof endpointCategories] };

  return (
    <div className="space-y-6">
      <div>

        <p className="text-muted-foreground">Test and explore Campus Controller API endpoints</p>
      </div>

      <Tabs defaultValue="test" className="space-y-4">
        <TabsList>
          <TabsTrigger value="test">API Test & Endpoints</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="applications-debug">
            <BarChart3 className="h-4 w-4 mr-2" />
            Applications Debug
          </TabsTrigger>
        </TabsList>

        <TabsContent value="test" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - API Endpoints */}
            <Card>
              <CardHeader>
                <CardTitle>API Endpoints by Category</CardTitle>
                <CardDescription>
                  Click any endpoint to automatically load it for testing
                </CardDescription>
                
                {/* Category Filter */}
                <div className="flex items-center space-x-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="Filter by category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {Object.keys(endpointCategories).map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[700px] w-full">
                  <div className="space-y-6">
                    {Object.entries(filteredCategories).map(([category, endpoints]) => (
                      <div key={category}>
                        <h3 className="font-semibold mb-3 text-primary">{category}</h3>
                        <div className="space-y-2 ml-2">
                          {endpoints.map((item, index) => (
                            <div
                              key={`${category}-${index}`}
                              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted cursor-pointer transition-colors"
                              onClick={() => loadEndpoint(item.endpoint, item.method)}
                            >
                              <div className="flex-1">
                                <div className="flex items-center space-x-2">
                                  <Badge 
                                    variant="outline" 
                                    className={
                                      item.method === 'GET' ? 'border-green-500 text-green-700' :
                                      item.method === 'POST' ? 'border-blue-500 text-blue-700' :
                                      item.method === 'PUT' ? 'border-orange-500 text-orange-700' :
                                      item.method === 'DELETE' ? 'border-red-500 text-red-700' :
                                      ''
                                    }
                                  >
                                    {item.method}
                                  </Badge>
                                  <code className="text-sm font-mono">{item.endpoint}</code>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Right Column - API Request Form and Response */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>API Request</CardTitle>
                  <CardDescription>
                    Make authenticated requests to the Campus Controller API
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex space-x-2">
                      <div className="w-32">
                        <Label htmlFor="method">Method</Label>
                        <Select value={method} onValueChange={setMethod}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="GET">GET</SelectItem>
                            <SelectItem value="POST">POST</SelectItem>
                            <SelectItem value="PUT">PUT</SelectItem>
                            <SelectItem value="DELETE">DELETE</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1">
                        <Label htmlFor="endpoint">Endpoint</Label>
                        <Input
                          id="endpoint"
                          value={endpoint}
                          onChange={(e) => setEndpoint(e.target.value)}
                          placeholder="/v1/accesscontrol"
                          required
                        />
                      </div>
                    </div>

                    {(method === 'POST' || method === 'PUT') && (
                      <div>
                        <Label htmlFor="body">Request Body (JSON)</Label>
                        <Textarea
                          id="body"
                          value={requestBody}
                          onChange={(e) => setRequestBody(e.target.value)}
                          placeholder='{"key": "value"}'
                          rows={6}
                        />
                      </div>
                    )}

                    <Button type="submit" disabled={isLoading} className="w-full">
                      <Play className="mr-2 h-4 w-4" />
                      {isLoading ? 'Sending...' : 'Send Request'}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {response && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center space-x-2">
                        <span>Response</span>
                        <Badge variant={response.status >= 200 && response.status < 300 ? "default" : "destructive"}>
                          {response.status} {response.statusText}
                        </Badge>
                        <Badge variant="outline">{response.duration}ms</Badge>
                      </CardTitle>
                      <Button variant="outline" size="sm" onClick={copyResponse}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64 w-full rounded border p-4">
                      <pre className="text-sm">{response.body}</pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Request History</CardTitle>
                  <CardDescription>
                    Your recent API requests (last 50)
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={clearHistory}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear History
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No requests made yet</p>
              ) : (
                <ScrollArea className="h-[600px] w-full">
                  <div className="space-y-2">
                    {history.map((request) => (
                      <div
                        key={request.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted cursor-pointer transition-colors"
                        onClick={() => loadFromHistory(request)}
                      >
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <Badge 
                              variant="outline"
                              className={
                                request.method === 'GET' ? 'border-green-500 text-green-700' :
                                request.method === 'POST' ? 'border-blue-500 text-blue-700' :
                                request.method === 'PUT' ? 'border-orange-500 text-orange-700' :
                                request.method === 'DELETE' ? 'border-red-500 text-red-700' :
                                ''
                              }
                            >
                              {request.method}
                            </Badge>
                            <code className="text-sm font-mono">{request.endpoint}</code>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {request.timestamp.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="applications-debug" className="space-y-4">
          <TopApplicationsDebug />
        </TabsContent>
      </Tabs>
    </div>
  );
}