import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Separator } from './ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import {
  Search,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Server,
  Wifi,
  Users,
  Building2,
  Shield,
  Network,
  HardDrive,
  Activity,
  Settings,
  Key,
  MapPin,
  Radio,
  Globe,
  Cpu,
  Database,
  Lock,
  UserPlus,
  Gauge,
  Package,
  ArrowLeft,
  Download,
  FileJson,
  Eye,
  Bell,
  FileText,
  Layers,
  Router,
  Zap,
  Target,
  Workflow,
  Signal,
  BookOpen
} from 'lucide-react';

interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description: string;
  parameters?: string[];
}

interface ApiCategory {
  name: string;
  icon: any;
  description: string;
  endpoints: ApiEndpoint[];
}

// Complete API categories based on actual Extreme Campus Controller swagger.json
const apiCategories: ApiCategory[] = [
  {
    name: 'Authentication (OAuth2)',
    icon: Key,
    description: 'User authentication and session management using OAuth 2.0 bearer tokens',
    endpoints: [
      { method: 'POST', path: '/v1/oauth2/token', description: 'Login and obtain access token with grantType, userId, and password' },
      { method: 'DELETE', path: '/v1/oauth2/token/{token}', description: 'Revoke/logout an access token', parameters: ['token'] },
      { method: 'POST', path: '/v1/oauth2/refreshToken', description: 'Refresh an expired access token using refresh_token' },
      { method: 'POST', path: '/v1/oauth2/introspecttoken', description: 'Validate and get info about an access token' },
    ]
  },
  {
    name: 'Access Points',
    icon: Wifi,
    description: 'Create and manage access points',
    endpoints: [
      { method: 'GET', path: '/v1/aps', description: 'Get list of all access points with optional brief/inventory parameters' },
      { method: 'GET', path: '/v1/aps/{apSerialNumber}', description: 'Get access point by serial number', parameters: ['apSerialNumber'] },
      { method: 'PUT', path: '/v1/aps/{apSerialNumber}', description: 'Update access point configuration', parameters: ['apSerialNumber'] },
      { method: 'DELETE', path: '/v1/aps/{apSerialNumber}', description: 'Delete an access point', parameters: ['apSerialNumber'] },
      { method: 'GET', path: '/v1/aps/query', description: 'Get filtered list of access points based on query' },
      { method: 'GET', path: '/v1/aps/query/columns', description: 'Get available query columns for AP filtering' },
      { method: 'GET', path: '/v1/aps/query/visualize', description: 'Get filtered AP list with visualization columns' },
      { method: 'GET', path: '/v1/aps/{apserialnum}/stations', description: 'Get stations connected to specific AP', parameters: ['apserialnum'] },
      { method: 'GET', path: '/v1/aps/{apserialnum}/lldp', description: 'Get LLDP neighbor information', parameters: ['apserialnum'] },
      { method: 'GET', path: '/v1/aps/{apSerialNumber}/bssid0', description: 'Get BSSID information for AP', parameters: ['apSerialNumber'] },
      { method: 'GET', path: '/v1/aps/{apSerialNumber}/location', description: 'Get AP location info', parameters: ['apSerialNumber'] },
      { method: 'PUT', path: '/v1/aps/{apSerialNumber}/location', description: 'Update AP location', parameters: ['apSerialNumber'] },
      { method: 'GET', path: '/v1/aps/{apSerialNumber}/logs', description: 'Get AP diagnostic logs', parameters: ['apSerialNumber'] },
      { method: 'GET', path: '/v1/aps/{apSerialNumber}/traceurls', description: 'Get trace URLs for AP', parameters: ['apSerialNumber'] },
      { method: 'POST', path: '/v1/aps/{apSerialNumber}/reboot', description: 'Reboot an access point', parameters: ['apSerialNumber'] },
      { method: 'POST', path: '/v1/aps/{apSerialNumber}/reset', description: 'Factory reset an access point', parameters: ['apSerialNumber'] },
      { method: 'POST', path: '/v1/aps/{apSerialNumber}/upgrade', description: 'Upgrade AP firmware', parameters: ['apSerialNumber'] },
      { method: 'POST', path: '/v1/aps/{apSerialNumber}/locate', description: 'Trigger AP LED locator', parameters: ['apSerialNumber'] },
      { method: 'POST', path: '/v1/aps/{apSerialNumber}/realcapture', description: 'Start real-time packet capture', parameters: ['apSerialNumber'] },
      { method: 'POST', path: '/v1/aps/{apSerialNumber}/copytodefault', description: 'Copy AP config to default profile', parameters: ['apSerialNumber'] },
      { method: 'POST', path: '/v1/aps/{apSerialNumber}/setRuState', description: 'Set regulatory unit state', parameters: ['apSerialNumber'] },
      { method: 'GET', path: '/v1/aps/{apSerialNumber}/cert', description: 'Get AP certificate info', parameters: ['apSerialNumber'] },
      { method: 'GET', path: '/v1/aps/{apSerialNumber}/report', description: 'Get AP performance report', parameters: ['apSerialNumber'] },
      { method: 'GET', path: '/v1/aps/list', description: 'Get lightweight list of all APs' },
      { method: 'GET', path: '/v1/aps/default', description: 'Get default AP configuration template' },
      { method: 'PUT', path: '/v1/aps/default', description: 'Update default AP configuration template' },
      { method: 'POST', path: '/v1/aps/create', description: 'Create a new access point entry' },
      { method: 'POST', path: '/v1/aps/clone', description: 'Clone AP configuration' },
      { method: 'POST', path: '/v1/aps/assign', description: 'Assign APs to site/profile' },
      { method: 'POST', path: '/v1/aps/multiconfig', description: 'Apply configuration to multiple APs' },
      { method: 'POST', path: '/v1/aps/reboot', description: 'Bulk reboot multiple APs' },
      { method: 'POST', path: '/v1/aps/upgrade', description: 'Bulk upgrade multiple APs' },
      { method: 'POST', path: '/v1/aps/swupgrade', description: 'Software upgrade for APs' },
      { method: 'POST', path: '/v1/aps/setRuState', description: 'Bulk set regulatory unit state' },
      { method: 'POST', path: '/v1/aps/releasetocloud', description: 'Release APs to cloud management' },
      { method: 'GET', path: '/v1/aps/displaynames', description: 'Get display names for all APs' },
      { method: 'GET', path: '/v1/aps/hardwaretypes', description: 'Get supported AP hardware types' },
      { method: 'GET', path: '/v1/aps/platforms', description: 'Get supported AP platforms' },
      { method: 'GET', path: '/v1/aps/swversion', description: 'Get current software versions' },
      { method: 'GET', path: '/v1/aps/ifstats', description: 'Get interface statistics for all APs' },
      { method: 'GET', path: '/v1/aps/ifstats/{apSerialNumber}', description: 'Get interface statistics for specific AP', parameters: ['apSerialNumber'] },
      { method: 'GET', path: '/v1/aps/adoptionrules', description: 'Get AP adoption rules' },
      { method: 'PUT', path: '/v1/aps/adoptionrules', description: 'Update AP adoption rules' },
      { method: 'GET', path: '/v1/aps/apbalance', description: 'Get AP load balancing status' },
      { method: 'GET', path: '/v1/aps/registration', description: 'Get AP registration info' },
      { method: 'GET', path: '/v1/aps/upgradeimagelist', description: 'Get available firmware images' },
      { method: 'GET', path: '/v1/aps/upgradeschedule', description: 'Get upgrade schedule' },
      { method: 'PUT', path: '/v1/aps/upgradeschedule', description: 'Set upgrade schedule' },
      { method: 'GET', path: '/v1/aps/downloadtrace/{filename}', description: 'Download trace file', parameters: ['filename'] },
      { method: 'GET', path: '/v1/aps/antenna/{apSerialNumber}', description: 'Get antenna configuration', parameters: ['apSerialNumber'] },
      { method: 'PUT', path: '/v1/aps/antenna/{apSerialNumber}', description: 'Update antenna configuration', parameters: ['apSerialNumber'] },
      { method: 'POST', path: '/v1/aps/cert/apply', description: 'Apply certificate to APs' },
      { method: 'POST', path: '/v1/aps/cert/reset', description: 'Reset AP certificates' },
      { method: 'POST', path: '/v1/aps/cert/signrequest', description: 'Create certificate signing request' },
      { method: 'GET', path: '/v1/ap/environment/{apSerialNumber}', description: 'Get AP environment info', parameters: ['apSerialNumber'] },
    ]
  },
  {
    name: 'Stations (Clients)',
    icon: Users,
    description: 'Retrieve station/client information',
    endpoints: [
      { method: 'GET', path: '/v1/stations', description: 'Get list of all connected stations/clients' },
      { method: 'GET', path: '/v1/stations/{macaddress}', description: 'Get station details by MAC address', parameters: ['macaddress'] },
      { method: 'DELETE', path: '/v1/stations/{macaddress}', description: 'Delete station record', parameters: ['macaddress'] },
      { method: 'GET', path: '/v1/stations/query', description: 'Query stations with filters' },
      { method: 'GET', path: '/v1/stations/query/columns', description: 'Get available query columns for stations' },
      { method: 'GET', path: '/v1/stations/query/visualize', description: 'Get stations with visualization data' },
      { method: 'GET', path: '/v1/stations/{stationId}/location', description: 'Get station location', parameters: ['stationId'] },
      { method: 'GET', path: '/v1/stations/{stationId}/report', description: 'Get station performance report', parameters: ['stationId'] },
      { method: 'GET', path: '/v1/stations/events/{macaddress}', description: 'Get station events history', parameters: ['macaddress'] },
      { method: 'POST', path: '/v1/stations/disassociate', description: 'Disassociate/disconnect a station' },
    ]
  },
  {
    name: 'Sites',
    icon: Building2,
    description: 'Create and manage site configuration',
    endpoints: [
      { method: 'GET', path: '/v3/sites', description: 'Get list of all sites' },
      { method: 'POST', path: '/v3/sites', description: 'Create a new site' },
      { method: 'GET', path: '/v3/sites/{siteId}', description: 'Get site by ID', parameters: ['siteId'] },
      { method: 'PUT', path: '/v3/sites/{siteId}', description: 'Update site configuration', parameters: ['siteId'] },
      { method: 'DELETE', path: '/v3/sites/{siteId}', description: 'Delete a site', parameters: ['siteId'] },
      { method: 'GET', path: '/v3/sites/default', description: 'Get default site configuration' },
      { method: 'PUT', path: '/v3/sites/default', description: 'Update default site configuration' },
      { method: 'GET', path: '/v3/sites/nametoidmap', description: 'Get site name to ID mapping' },
      { method: 'POST', path: '/v3/sites/clone/{siteId}', description: 'Clone site configuration', parameters: ['siteId'] },
      { method: 'GET', path: '/v3/sites/countrylist', description: 'Get supported country codes' },
      { method: 'GET', path: '/v3/sites/{siteid}/stations', description: 'Get stations at site', parameters: ['siteid'] },
      { method: 'GET', path: '/v3/sites/{siteId}/report/venue', description: 'Get venue statistics report', parameters: ['siteId'] },
      { method: 'GET', path: '/v3/sites/{siteId}/report/impact', description: 'Get site impact report', parameters: ['siteId'] },
      { method: 'GET', path: '/v3/sites/report', description: 'Get report across all sites' },
      { method: 'GET', path: '/v3/sites/report/flex', description: 'Get flexible time range report' },
      { method: 'GET', path: '/v3/sites/report/venue', description: 'Get venue report for all sites' },
      { method: 'GET', path: '/v3/sites/report/impact', description: 'Get impact report for all sites' },
      { method: 'GET', path: '/v3/sites/report/location/floor/{floorId}', description: 'Get floor location report', parameters: ['floorId'] },
      { method: 'GET', path: '/v1/sites/{siteId}/report', description: 'Get site report (v1 API)', parameters: ['siteId'] },
      { method: 'GET', path: '/v1/msp/briefsites/{tenantId}', description: 'Get brief sites for MSP tenant', parameters: ['tenantId'] },
    ]
  },
  {
    name: 'Services (WLANs)',
    icon: Network,
    description: 'Create and manage wireless services/SSIDs',
    endpoints: [
      { method: 'GET', path: '/v1/services', description: 'Get list of all services/WLANs' },
      { method: 'POST', path: '/v1/services', description: 'Create a new service/WLAN' },
      { method: 'GET', path: '/v1/services/{serviceId}', description: 'Get service by ID', parameters: ['serviceId'] },
      { method: 'PUT', path: '/v1/services/{serviceId}', description: 'Update service configuration', parameters: ['serviceId'] },
      { method: 'DELETE', path: '/v1/services/{serviceId}', description: 'Delete a service', parameters: ['serviceId'] },
      { method: 'GET', path: '/v1/services/default', description: 'Get default service configuration' },
      { method: 'PUT', path: '/v1/services/default', description: 'Update default service configuration' },
      { method: 'GET', path: '/v1/services/nametoidmap', description: 'Get service name to ID mapping' },
      { method: 'GET', path: '/v1/services/{serviceId}/stations', description: 'Get stations connected to service', parameters: ['serviceId'] },
      { method: 'GET', path: '/v1/services/{serviceId}/report', description: 'Get service performance report', parameters: ['serviceId'] },
      { method: 'GET', path: '/v1/services/{serviceid}/bssid0', description: 'Get BSSIDs for service', parameters: ['serviceid'] },
      { method: 'GET', path: '/v1/services/{serviceId}/deviceids', description: 'Get device IDs using service', parameters: ['serviceId'] },
      { method: 'GET', path: '/v1/services/{serviceId}/siteids', description: 'Get site IDs using service', parameters: ['serviceId'] },
    ]
  },
  {
    name: 'Profiles',
    icon: Settings,
    description: 'Create and manage customer profiles',
    endpoints: [
      { method: 'GET', path: '/v3/profiles', description: 'Get list of all profiles' },
      { method: 'POST', path: '/v3/profiles', description: 'Create a new profile' },
      { method: 'GET', path: '/v3/profiles/{profileId}', description: 'Get profile by ID', parameters: ['profileId'] },
      { method: 'PUT', path: '/v3/profiles/{profileId}', description: 'Update profile', parameters: ['profileId'] },
      { method: 'DELETE', path: '/v3/profiles/{profileId}', description: 'Delete profile', parameters: ['profileId'] },
      { method: 'GET', path: '/v3/profiles/nametoidmap', description: 'Get profile name to ID mapping' },
      { method: 'GET', path: '/v3/profiles/{profileId}/bssid0', description: 'Get BSSIDs for profile', parameters: ['profileId'] },
      { method: 'GET', path: '/v3/profiles/{profileId}/channels', description: 'Get profile channel config', parameters: ['profileId'] },
    ]
  },
  {
    name: 'Roles',
    icon: Shield,
    description: 'Create and manage customer roles and policies',
    endpoints: [
      { method: 'GET', path: '/v3/roles', description: 'Get list of all roles' },
      { method: 'POST', path: '/v3/roles', description: 'Create a new role' },
      { method: 'GET', path: '/v3/roles/{roleId}', description: 'Get role by ID', parameters: ['roleId'] },
      { method: 'PUT', path: '/v3/roles/{roleId}', description: 'Update role', parameters: ['roleId'] },
      { method: 'DELETE', path: '/v3/roles/{roleId}', description: 'Delete role', parameters: ['roleId'] },
      { method: 'GET', path: '/v3/roles/default', description: 'Get default role configuration' },
      { method: 'PUT', path: '/v3/roles/default', description: 'Update default role configuration' },
      { method: 'GET', path: '/v3/roles/nametoidmap', description: 'Get role name to ID mapping' },
      { method: 'GET', path: '/v3/roles/{roleId}/rulestats', description: 'Get role rule statistics', parameters: ['roleId'] },
      { method: 'GET', path: '/v1/roles/{roleId}/report', description: 'Get role report', parameters: ['roleId'] },
      { method: 'GET', path: '/v1/roles/{roleid}/stations', description: 'Get stations with role', parameters: ['roleid'] },
    ]
  },
  {
    name: 'Switches',
    icon: Router,
    description: 'Manage switch controllers',
    endpoints: [
      { method: 'GET', path: '/v1/switches', description: 'Get list of all switches' },
      { method: 'POST', path: '/v1/switches', description: 'Create/register a switch' },
      { method: 'GET', path: '/v1/switches/{serialNumber}', description: 'Get switch by serial number', parameters: ['serialNumber'] },
      { method: 'PUT', path: '/v1/switches/{serialNumber}', description: 'Update switch configuration', parameters: ['serialNumber'] },
      { method: 'DELETE', path: '/v1/switches/{serialNumber}', description: 'Delete a switch', parameters: ['serialNumber'] },
      { method: 'GET', path: '/v1/switches/list', description: 'Get lightweight switch list' },
      { method: 'GET', path: '/v1/switches/displaynames', description: 'Get switch display names' },
      { method: 'POST', path: '/v1/switches/assign', description: 'Assign switches to site' },
      { method: 'POST', path: '/v1/switches/clone', description: 'Clone switch configuration' },
      { method: 'POST', path: '/v1/switches/reboot', description: 'Bulk reboot switches' },
      { method: 'POST', path: '/v1/switches/{serialNumber}/reboot', description: 'Reboot specific switch', parameters: ['serialNumber'] },
      { method: 'POST', path: '/v1/switches/{serialNumber}/reset', description: 'Factory reset switch', parameters: ['serialNumber'] },
      { method: 'POST', path: '/v1/switches/{serialNumber}/upgrade', description: 'Upgrade switch firmware', parameters: ['serialNumber'] },
      { method: 'GET', path: '/v1/switches/{serialNumber}/logs', description: 'Get switch logs', parameters: ['serialNumber'] },
      { method: 'GET', path: '/v1/switches/{serialNumber}/traceurls', description: 'Get switch trace URLs', parameters: ['serialNumber'] },
      { method: 'GET', path: '/v1/switches/{serialNumber}/report', description: 'Get switch report', parameters: ['serialNumber'] },
      { method: 'GET', path: '/v1/switches/{serialNumber}/clibackups', description: 'Get CLI config backups', parameters: ['serialNumber'] },
      { method: 'POST', path: '/v1/switches/{serialNumber}/cliconfigs/backup', description: 'Create CLI config backup', parameters: ['serialNumber'] },
      { method: 'POST', path: '/v1/switches/{serialNumber}/cliconfigs/restore/{name}', description: 'Restore CLI config', parameters: ['serialNumber', 'name'] },
      { method: 'PUT', path: '/v1/switches/{serialNumber}/configurationmode/{configurationMode}', description: 'Set config mode', parameters: ['serialNumber', 'configurationMode'] },
      { method: 'POST', path: '/v1/switches/{serialNumber}/console/{consoleAction}', description: 'Execute console action', parameters: ['serialNumber', 'consoleAction'] },
      { method: 'POST', path: '/v1/switches/{serialNumber}/login', description: 'Login to switch console', parameters: ['serialNumber'] },
      { method: 'GET', path: '/v1/switches/{serialNumber}/ports/{portNumber}', description: 'Get port configuration', parameters: ['serialNumber', 'portNumber'] },
      { method: 'PUT', path: '/v1/switches/{serialNumber}/ports/{portNumber}', description: 'Update port configuration', parameters: ['serialNumber', 'portNumber'] },
      { method: 'GET', path: '/v1/switches/{serialNumber}/ports/{portId}/report', description: 'Get port report', parameters: ['serialNumber', 'portId'] },
      { method: 'GET', path: '/v1/switches/{serialNumber}/slots/{slotNumber}/ports/{portNumber}', description: 'Get slot port config', parameters: ['serialNumber', 'slotNumber', 'portNumber'] },
      { method: 'PUT', path: '/v1/switches/{serialNumber}/slots/{slotNumber}/ports/{portNumber}', description: 'Update slot port config', parameters: ['serialNumber', 'slotNumber', 'portNumber'] },
    ]
  },
  {
    name: 'Switch Port Profiles',
    icon: HardDrive,
    description: 'Create and manage port profiles',
    endpoints: [
      { method: 'GET', path: '/v3/switchportprofile', description: 'Get list of all port profiles' },
      { method: 'POST', path: '/v3/switchportprofile', description: 'Create a new port profile' },
      { method: 'GET', path: '/v3/switchportprofile/{profileId}', description: 'Get port profile by ID', parameters: ['profileId'] },
      { method: 'PUT', path: '/v3/switchportprofile/{profileId}', description: 'Update port profile', parameters: ['profileId'] },
      { method: 'DELETE', path: '/v3/switchportprofile/{profileId}', description: 'Delete port profile', parameters: ['profileId'] },
      { method: 'GET', path: '/v3/switchportprofile/default', description: 'Get default port profile' },
      { method: 'GET', path: '/v3/switchportprofile/nametoidmap', description: 'Get port profile name to ID map' },
    ]
  },
  {
    name: 'Entity State',
    icon: Activity,
    description: 'Retrieve the state of access points, switches, and sites',
    endpoints: [
      { method: 'GET', path: '/v1/state/aps', description: 'Get operational state of all APs' },
      { method: 'GET', path: '/v1/state/aps/{apSerialNumber}', description: 'Get state of specific AP', parameters: ['apSerialNumber'] },
      { method: 'GET', path: '/v1/state/sites', description: 'Get state of all sites' },
      { method: 'GET', path: '/v1/state/sites/{siteId}', description: 'Get state of specific site', parameters: ['siteId'] },
      { method: 'GET', path: '/v1/state/sites/{siteId}/aps', description: 'Get APs state at site', parameters: ['siteId'] },
      { method: 'GET', path: '/v1/state/switches', description: 'Get state of all switches' },
      { method: 'GET', path: '/v1/state/switches/{switchSerialNumber}', description: 'Get state of specific switch', parameters: ['switchSerialNumber'] },
      { method: 'GET', path: '/v1/state/entityDistribution', description: 'Get entity distribution stats' },
    ]
  },
  {
    name: 'Reports',
    icon: FileText,
    description: 'Retrieve and generate reports',
    endpoints: [
      { method: 'GET', path: '/v1/report/sites', description: 'Get sites report' },
      { method: 'GET', path: '/v1/report/sites/{siteId}', description: 'Get specific site report', parameters: ['siteId'] },
      { method: 'GET', path: '/v1/report/sites/{siteId}/smartrf', description: 'Get SmartRF report', parameters: ['siteId'] },
      { method: 'GET', path: '/v1/report/aps/{apSerialNumber}', description: 'Get AP report', parameters: ['apSerialNumber'] },
      { method: 'GET', path: '/v1/report/aps/{apSerialNumber}/smartrf', description: 'Get AP SmartRF report', parameters: ['apSerialNumber'] },
      { method: 'GET', path: '/v1/report/stations/{stationId}', description: 'Get station report', parameters: ['stationId'] },
      { method: 'GET', path: '/v1/report/services/{serviceId}', description: 'Get service report', parameters: ['serviceId'] },
      { method: 'GET', path: '/v1/report/roles/{roleId}', description: 'Get role report', parameters: ['roleId'] },
      { method: 'GET', path: '/v1/report/switches/{switchSerialNumber}', description: 'Get switch report', parameters: ['switchSerialNumber'] },
      { method: 'GET', path: '/v1/report/ports/{portId}', description: 'Get port report', parameters: ['portId'] },
      { method: 'GET', path: '/v1/report/flex/{duration}', description: 'Get flexible duration report', parameters: ['duration'] },
      { method: 'GET', path: '/v1/report/location/aps/{apSerialNumber}', description: 'Get AP location report', parameters: ['apSerialNumber'] },
      { method: 'GET', path: '/v1/report/location/floor/{floorId}', description: 'Get floor location report', parameters: ['floorId'] },
      { method: 'GET', path: '/v1/report/location/stations/{stationId}', description: 'Get station location report', parameters: ['stationId'] },
      { method: 'GET', path: '/v1/reports/widgets', description: 'Get available report widgets' },
      { method: 'GET', path: '/v2/report/upgrade/devices', description: 'Get device upgrade report' },
    ]
  },
  {
    name: 'Report Templates',
    icon: BookOpen,
    description: 'Create and manage PDF/CSV report templates',
    endpoints: [
      { method: 'GET', path: '/v1/reports/templates', description: 'Get list of report templates' },
      { method: 'POST', path: '/v1/reports/templates', description: 'Create a new report template' },
      { method: 'GET', path: '/v1/reports/templates/{templateId}', description: 'Get template by ID', parameters: ['templateId'] },
      { method: 'PUT', path: '/v1/reports/templates/{templateId}', description: 'Update template', parameters: ['templateId'] },
      { method: 'DELETE', path: '/v1/reports/templates/{templateId}', description: 'Delete template', parameters: ['templateId'] },
      { method: 'GET', path: '/v1/reports/templates/default', description: 'Get default template' },
      { method: 'GET', path: '/v1/reports/templates/nametoidmap', description: 'Get template name to ID map' },
    ]
  },
  {
    name: 'Scheduled Reports',
    icon: Gauge,
    description: 'Manage scheduled report generation',
    endpoints: [
      { method: 'GET', path: '/v1/reports/scheduled', description: 'Get list of scheduled reports' },
      { method: 'POST', path: '/v1/reports/scheduled', description: 'Create a scheduled report' },
      { method: 'GET', path: '/v1/reports/scheduled/{reportId}', description: 'Get scheduled report by ID', parameters: ['reportId'] },
      { method: 'PUT', path: '/v1/reports/scheduled/{reportId}', description: 'Update scheduled report', parameters: ['reportId'] },
      { method: 'DELETE', path: '/v1/reports/scheduled/{reportId}', description: 'Delete scheduled report', parameters: ['reportId'] },
      { method: 'GET', path: '/v1/reports/scheduled/default', description: 'Get default scheduled report config' },
      { method: 'GET', path: '/v1/reports/scheduled/nametoidmap', description: 'Get scheduled report name to ID map' },
      { method: 'GET', path: '/v1/reports/generated', description: 'Get list of generated reports' },
      { method: 'GET', path: '/v1/reports/generated/filelist', description: 'Get generated report file list' },
      { method: 'GET', path: '/v1/reports/generated/{filename}', description: 'Download generated report', parameters: ['filename'] },
    ]
  },
  {
    name: 'Administrators',
    icon: UserPlus,
    description: 'Retrieve and manage administrator information',
    endpoints: [
      { method: 'GET', path: '/v1/administrators', description: 'Get list of all administrators' },
      { method: 'POST', path: '/v1/administrators', description: 'Create a new administrator' },
      { method: 'GET', path: '/v1/administrators/{userId}', description: 'Get administrator by user ID', parameters: ['userId'] },
      { method: 'PUT', path: '/v1/administrators/{userId}', description: 'Update administrator', parameters: ['userId'] },
      { method: 'DELETE', path: '/v1/administrators/{userId}', description: 'Delete administrator', parameters: ['userId'] },
      { method: 'PUT', path: '/v1/administrators/adminpassword', description: 'Change admin password' },
      { method: 'GET', path: '/v1/administratorsTimeout/{userId}', description: 'Get admin session timeout', parameters: ['userId'] },
      { method: 'PUT', path: '/v1/administratorsTimeout/{userId}', description: 'Set admin session timeout', parameters: ['userId'] },
    ]
  },
  {
    name: 'Application Keys',
    icon: Key,
    description: 'Manage API application keys',
    endpoints: [
      { method: 'GET', path: '/v1/appkeys', description: 'Get list of all application keys' },
      { method: 'POST', path: '/v1/appkeys', description: 'Create a new application key' },
      { method: 'GET', path: '/v1/appkeys/{appKey}', description: 'Get application key details', parameters: ['appKey'] },
      { method: 'DELETE', path: '/v1/appkeys/{appKey}', description: 'Delete an application key', parameters: ['appKey'] },
    ]
  },
  {
    name: 'Audit Logs',
    icon: Database,
    description: 'Retrieve audit logs for a customer',
    endpoints: [
      { method: 'GET', path: '/v1/auditlogs', description: 'Get audit logs with optional filtering' },
    ]
  },
  {
    name: 'Access Control',
    icon: Lock,
    description: 'Create and manage access control list information',
    endpoints: [
      { method: 'GET', path: '/v1/accesscontrol', description: 'Get access control MAC list' },
      { method: 'POST', path: '/v1/accesscontrol', description: 'Create access control list' },
      { method: 'PUT', path: '/v1/accesscontrol', description: 'Update access control list' },
      { method: 'DELETE', path: '/v1/accesscontrol', description: 'Remove access control list' },
    ]
  },
  {
    name: 'AAA Policy',
    icon: Shield,
    description: 'Manage AAA (Authentication, Authorization, Accounting) policies',
    endpoints: [
      { method: 'GET', path: '/v1/aaapolicy', description: 'Get list of AAA policies' },
      { method: 'POST', path: '/v1/aaapolicy', description: 'Create a new AAA policy' },
      { method: 'GET', path: '/v1/aaapolicy/{id}', description: 'Get AAA policy by ID', parameters: ['id'] },
      { method: 'PUT', path: '/v1/aaapolicy/{id}', description: 'Update AAA policy', parameters: ['id'] },
      { method: 'DELETE', path: '/v1/aaapolicy/{id}', description: 'Delete AAA policy', parameters: ['id'] },
      { method: 'GET', path: '/v1/aaapolicy/default', description: 'Get default AAA policy' },
      { method: 'GET', path: '/v1/aaapolicy/nametoidmap', description: 'Get AAA policy name to ID map' },
    ]
  },
  {
    name: 'Class of Service (CoS)',
    icon: Layers,
    description: 'Create and manage policy Class of Service',
    endpoints: [
      { method: 'GET', path: '/v1/cos', description: 'Get list of all CoS profiles' },
      { method: 'POST', path: '/v1/cos', description: 'Create a new CoS profile' },
      { method: 'GET', path: '/v1/cos/{cosId}', description: 'Get CoS profile by ID', parameters: ['cosId'] },
      { method: 'PUT', path: '/v1/cos/{cosId}', description: 'Update CoS profile', parameters: ['cosId'] },
      { method: 'DELETE', path: '/v1/cos/{cosId}', description: 'Delete CoS profile', parameters: ['cosId'] },
      { method: 'GET', path: '/v1/cos/default', description: 'Get default CoS configuration' },
      { method: 'GET', path: '/v1/cos/nametoidmap', description: 'Get CoS name to ID mapping' },
    ]
  },
  {
    name: 'Rate Limiters',
    icon: Gauge,
    description: 'Create and manage rate limiter configuration',
    endpoints: [
      { method: 'GET', path: '/v1/ratelimiters', description: 'Get list of rate limiters' },
      { method: 'POST', path: '/v1/ratelimiters', description: 'Create a new rate limiter' },
      { method: 'GET', path: '/v1/ratelimiters/{rateLimiterId}', description: 'Get rate limiter by ID', parameters: ['rateLimiterId'] },
      { method: 'PUT', path: '/v1/ratelimiters/{rateLimiterId}', description: 'Update rate limiter', parameters: ['rateLimiterId'] },
      { method: 'DELETE', path: '/v1/ratelimiters/{rateLimiterId}', description: 'Delete rate limiter', parameters: ['rateLimiterId'] },
      { method: 'GET', path: '/v1/ratelimiters/default', description: 'Get default rate limiter config' },
      { method: 'GET', path: '/v1/ratelimiters/nametoidmap', description: 'Get rate limiter name to ID map' },
    ]
  },
  {
    name: 'Topologies',
    icon: Globe,
    description: 'Create and manage network topologies',
    endpoints: [
      { method: 'GET', path: '/v1/topologies', description: 'Get list of topologies (v1)' },
      { method: 'POST', path: '/v1/topologies', description: 'Create a new topology (v1)' },
      { method: 'GET', path: '/v1/topologies/{topologyId}', description: 'Get topology by ID (v1)', parameters: ['topologyId'] },
      { method: 'PUT', path: '/v1/topologies/{topologyId}', description: 'Update topology (v1)', parameters: ['topologyId'] },
      { method: 'DELETE', path: '/v1/topologies/{topologyId}', description: 'Delete topology (v1)', parameters: ['topologyId'] },
      { method: 'GET', path: '/v1/topologies/default', description: 'Get default topology config' },
      { method: 'GET', path: '/v1/topologies/nametoidmap', description: 'Get topology name to ID map' },
      { method: 'GET', path: '/v3/topologies', description: 'Get list of topologies (v3)' },
    ]
  },
  {
    name: 'RF Management',
    icon: Radio,
    description: 'Create and manage RF management policy',
    endpoints: [
      { method: 'GET', path: '/v3/rfmgmt', description: 'Get list of RF management policies' },
      { method: 'POST', path: '/v3/rfmgmt', description: 'Create a new RF policy' },
      { method: 'GET', path: '/v3/rfmgmt/{rfmgmtId}', description: 'Get RF policy by ID', parameters: ['rfmgmtId'] },
      { method: 'PUT', path: '/v3/rfmgmt/{rfmgmtId}', description: 'Update RF policy', parameters: ['rfmgmtId'] },
      { method: 'DELETE', path: '/v3/rfmgmt/{rfmgmtId}', description: 'Delete RF policy', parameters: ['rfmgmtId'] },
      { method: 'GET', path: '/v3/rfmgmt/default', description: 'Get default RF policy' },
      { method: 'GET', path: '/v3/rfmgmt/nametoidmap', description: 'Get RF policy name to ID map' },
    ]
  },
  {
    name: 'Radio Configuration',
    icon: Signal,
    description: 'Retrieve radio mode and channel information',
    endpoints: [
      { method: 'GET', path: '/v1/radios/channels', description: 'Get available radio channels' },
      { method: 'GET', path: '/v1/radios/modes', description: 'Get available radio modes' },
      { method: 'GET', path: '/v3/radios/smartrfchannels', description: 'Get SmartRF channel recommendations' },
    ]
  },
  {
    name: 'Analytics Profiles',
    icon: Activity,
    description: 'Create and manage Analytics profiles',
    endpoints: [
      { method: 'GET', path: '/v3/analytics', description: 'Get list of analytics profiles' },
      { method: 'POST', path: '/v3/analytics', description: 'Create an analytics profile' },
      { method: 'GET', path: '/v3/analytics/{analyticsProfileId}', description: 'Get analytics profile by ID', parameters: ['analyticsProfileId'] },
      { method: 'PUT', path: '/v3/analytics/{analyticsProfileId}', description: 'Update analytics profile', parameters: ['analyticsProfileId'] },
      { method: 'DELETE', path: '/v3/analytics/{analyticsProfileId}', description: 'Delete analytics profile', parameters: ['analyticsProfileId'] },
      { method: 'GET', path: '/v3/analytics/default', description: 'Get default analytics profile' },
      { method: 'GET', path: '/v3/analytics/nametoidmap', description: 'Get analytics profile name to ID map' },
    ]
  },
  {
    name: 'IoT Profiles',
    icon: Cpu,
    description: 'Create and manage IoT profiles',
    endpoints: [
      { method: 'GET', path: '/v3/iotprofile', description: 'Get list of IoT profiles' },
      { method: 'POST', path: '/v3/iotprofile', description: 'Create an IoT profile' },
      { method: 'GET', path: '/v3/iotprofile/{iotprofileId}', description: 'Get IoT profile by ID', parameters: ['iotprofileId'] },
      { method: 'PUT', path: '/v3/iotprofile/{iotprofileId}', description: 'Update IoT profile', parameters: ['iotprofileId'] },
      { method: 'DELETE', path: '/v3/iotprofile/{iotprofileId}', description: 'Delete IoT profile', parameters: ['iotprofileId'] },
      { method: 'GET', path: '/v3/iotprofile/default', description: 'Get default IoT profile' },
      { method: 'GET', path: '/v3/iotprofile/nametoidmap', description: 'Get IoT profile name to ID map' },
    ]
  },
  {
    name: 'RTLS Profiles',
    icon: MapPin,
    description: 'Create and manage RTLS (Real-Time Location Services) profiles',
    endpoints: [
      { method: 'GET', path: '/v1/rtlsprofile', description: 'Get list of RTLS profiles' },
      { method: 'POST', path: '/v1/rtlsprofile', description: 'Create an RTLS profile' },
      { method: 'GET', path: '/v1/rtlsprofile/{rtlsprofileId}', description: 'Get RTLS profile by ID', parameters: ['rtlsprofileId'] },
      { method: 'PUT', path: '/v1/rtlsprofile/{rtlsprofileId}', description: 'Update RTLS profile', parameters: ['rtlsprofileId'] },
      { method: 'DELETE', path: '/v1/rtlsprofile/{rtlsprofileId}', description: 'Delete RTLS profile', parameters: ['rtlsprofileId'] },
      { method: 'GET', path: '/v1/rtlsprofile/default', description: 'Get default RTLS profile' },
      { method: 'GET', path: '/v1/rtlsprofile/nametoidmap', description: 'Get RTLS profile name to ID map' },
    ]
  },
  {
    name: 'Positioning Profiles',
    icon: Target,
    description: 'Create and manage positioning profiles',
    endpoints: [
      { method: 'GET', path: '/v3/positioning', description: 'Get list of positioning profiles' },
      { method: 'POST', path: '/v3/positioning', description: 'Create a positioning profile' },
      { method: 'GET', path: '/v3/positioning/{positioningProfileId}', description: 'Get positioning profile by ID', parameters: ['positioningProfileId'] },
      { method: 'PUT', path: '/v3/positioning/{positioningProfileId}', description: 'Update positioning profile', parameters: ['positioningProfileId'] },
      { method: 'DELETE', path: '/v3/positioning/{positioningProfileId}', description: 'Delete positioning profile', parameters: ['positioningProfileId'] },
      { method: 'GET', path: '/v3/positioning/default', description: 'Get default positioning profile' },
      { method: 'GET', path: '/v3/positioning/nametoidmap', description: 'Get positioning profile name to ID map' },
    ]
  },
  {
    name: 'ExtremeLocation',
    icon: MapPin,
    description: 'Manage ExtremeLocation profile configuration',
    endpoints: [
      { method: 'GET', path: '/v3/xlocation', description: 'Get list of ExtremeLocation profiles' },
      { method: 'POST', path: '/v3/xlocation', description: 'Create an ExtremeLocation profile' },
      { method: 'GET', path: '/v3/xlocation/{xlocationId}', description: 'Get ExtremeLocation profile by ID', parameters: ['xlocationId'] },
      { method: 'PUT', path: '/v3/xlocation/{xlocationId}', description: 'Update ExtremeLocation profile', parameters: ['xlocationId'] },
      { method: 'DELETE', path: '/v3/xlocation/{xlocationId}', description: 'Delete ExtremeLocation profile', parameters: ['xlocationId'] },
      { method: 'GET', path: '/v3/xlocation/default', description: 'Get default ExtremeLocation profile' },
      { method: 'GET', path: '/v3/xlocation/nametoidmap', description: 'Get ExtremeLocation profile name to ID map' },
    ]
  },
  {
    name: 'Air Defense (ADSP)',
    icon: Shield,
    description: 'Create and manage Air Defense profiles',
    endpoints: [
      { method: 'GET', path: '/v3/adsp', description: 'Get list of ADSP profiles (v3)' },
      { method: 'POST', path: '/v3/adsp', description: 'Create an ADSP profile (v3)' },
      { method: 'GET', path: '/v3/adsp/{adspId}', description: 'Get ADSP profile by ID (v3)', parameters: ['adspId'] },
      { method: 'PUT', path: '/v3/adsp/{adspId}', description: 'Update ADSP profile (v3)', parameters: ['adspId'] },
      { method: 'DELETE', path: '/v3/adsp/{adspId}', description: 'Delete ADSP profile (v3)', parameters: ['adspId'] },
      { method: 'GET', path: '/v3/adsp/default', description: 'Get default ADSP profile (v3)' },
      { method: 'GET', path: '/v3/adsp/nametoidmap', description: 'Get ADSP profile name to ID map (v3)' },
      { method: 'GET', path: '/v4/adsp', description: 'Get list of ADSP profiles (v4)' },
      { method: 'POST', path: '/v4/adsp', description: 'Create an ADSP profile (v4)' },
      { method: 'GET', path: '/v4/adsp/{adspId}', description: 'Get ADSP profile by ID (v4)', parameters: ['adspId'] },
      { method: 'PUT', path: '/v4/adsp/{adspId}', description: 'Update ADSP profile (v4)', parameters: ['adspId'] },
      { method: 'DELETE', path: '/v4/adsp/{adspId}', description: 'Delete ADSP profile (v4)', parameters: ['adspId'] },
      { method: 'GET', path: '/v4/adsp/default', description: 'Get default ADSP profile (v4)' },
      { method: 'GET', path: '/v4/adsp/nametoidmap', description: 'Get ADSP profile name to ID map (v4)' },
    ]
  },
  {
    name: 'Mesh Points',
    icon: Network,
    description: 'Manage mesh network points',
    endpoints: [
      { method: 'GET', path: '/v3/meshpoints', description: 'Get list of mesh points' },
      { method: 'POST', path: '/v3/meshpoints', description: 'Create a mesh point' },
      { method: 'GET', path: '/v3/meshpoints/{meshpointId}', description: 'Get mesh point by ID', parameters: ['meshpointId'] },
      { method: 'PUT', path: '/v3/meshpoints/{meshpointId}', description: 'Update mesh point', parameters: ['meshpointId'] },
      { method: 'DELETE', path: '/v3/meshpoints/{meshpointId}', description: 'Delete mesh point', parameters: ['meshpointId'] },
      { method: 'GET', path: '/v3/meshpoints/{meshpointId}/bssid', description: 'Get mesh point BSSIDs', parameters: ['meshpointId'] },
      { method: 'GET', path: '/v3/meshpoints/default', description: 'Get default mesh point config' },
      { method: 'GET', path: '/v3/meshpoints/profile/default', description: 'Get default mesh profile' },
      { method: 'GET', path: '/v3/meshpoints/nametoidmap', description: 'Get mesh point name to ID map' },
      { method: 'GET', path: '/v3/meshpoints/tree/{meshpointId}', description: 'Get mesh topology tree', parameters: ['meshpointId'] },
    ]
  },
  {
    name: 'EGuest',
    icon: Users,
    description: 'Create and manage EGuest configuration',
    endpoints: [
      { method: 'GET', path: '/v1/eguest', description: 'Get list of EGuest configurations' },
      { method: 'POST', path: '/v1/eguest', description: 'Create an EGuest configuration' },
      { method: 'GET', path: '/v1/eguest/{eguestId}', description: 'Get EGuest config by ID', parameters: ['eguestId'] },
      { method: 'PUT', path: '/v1/eguest/{eguestId}', description: 'Update EGuest config', parameters: ['eguestId'] },
      { method: 'DELETE', path: '/v1/eguest/{eguestId}', description: 'Delete EGuest config', parameters: ['eguestId'] },
      { method: 'GET', path: '/v1/eguest/default', description: 'Get default EGuest config' },
      { method: 'GET', path: '/v1/eguest/nametoidmap', description: 'Get EGuest name to ID map' },
    ]
  },
  {
    name: 'DPI Signatures',
    icon: Eye,
    description: 'Manage Deep Packet Inspection signature applications',
    endpoints: [
      { method: 'GET', path: '/v1/dpisignatures', description: 'Get list of DPI signatures' },
      { method: 'GET', path: '/v1/dpisignatures/custom', description: 'Get custom DPI signatures' },
      { method: 'POST', path: '/v1/dpisignatures/custom', description: 'Create custom DPI signature' },
      { method: 'PUT', path: '/v1/dpisignatures/custom', description: 'Update custom DPI signature' },
      { method: 'DELETE', path: '/v1/dpisignatures/custom', description: 'Delete custom DPI signature' },
    ]
  },
  {
    name: 'Device Images',
    icon: Package,
    description: 'Retrieve list of device images/firmware',
    endpoints: [
      { method: 'GET', path: '/v1/deviceimages/{hwType}', description: 'Get firmware images for hardware type', parameters: ['hwType'] },
    ]
  },
  {
    name: 'Notifications',
    icon: Bell,
    description: 'Manage system notifications',
    endpoints: [
      { method: 'GET', path: '/v1/notifications', description: 'Get list of notifications' },
      { method: 'PUT', path: '/v1/notifications', description: 'Update notification settings' },
      { method: 'GET', path: '/v1/notifications/regional', description: 'Get regional notifications' },
    ]
  },
  {
    name: 'NSight',
    icon: Eye,
    description: 'Retrieve and manage NSight server configuration',
    endpoints: [
      { method: 'GET', path: '/v1/nsightconfig', description: 'Get NSight server configuration' },
      { method: 'PUT', path: '/v1/nsightconfig', description: 'Update NSight server configuration' },
    ]
  },
  {
    name: 'Workflow',
    icon: Workflow,
    description: 'Retrieve device or profile workflow status',
    endpoints: [
      { method: 'GET', path: '/v1/workflow', description: 'Get workflow status' },
    ]
  },
  {
    name: 'Best Practices',
    icon: Zap,
    description: 'See and accept Best Practice recommendations',
    endpoints: [
      { method: 'GET', path: '/v1/bestpractices/evaluate', description: 'Evaluate best practices for the deployment' },
      { method: 'POST', path: '/v1/bestpractices/{id}/accept', description: 'Accept a best practice recommendation', parameters: ['id'] },
    ]
  },
  {
    name: 'Global Settings',
    icon: Settings,
    description: 'Manage global system settings',
    endpoints: [
      { method: 'GET', path: '/v1/globalsettings', description: 'Get global settings' },
      { method: 'PUT', path: '/v1/globalsettings', description: 'Update global settings' },
    ]
  },
  {
    name: 'SNMP',
    icon: Server,
    description: 'Manage SNMP configuration',
    endpoints: [
      { method: 'GET', path: '/v1/snmp', description: 'Get SNMP configuration' },
      { method: 'PUT', path: '/v1/snmp', description: 'Update SNMP configuration' },
      { method: 'GET', path: '/v1/snmp/default', description: 'Get default SNMP configuration' },
    ]
  },
  {
    name: 'Device Adoption Rules',
    icon: Settings,
    description: 'Manage device adoption rules',
    endpoints: [
      { method: 'GET', path: '/v1/devices/adoptionrules', description: 'Get device adoption rules' },
      { method: 'PUT', path: '/v1/devices/adoptionrules', description: 'Update device adoption rules' },
    ]
  },
];

interface ApiDocumentationProps {
  onBack?: () => void;
}

export function ApiDocumentation({ onBack }: ApiDocumentationProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => {
    // Start with all categories collapsed
    return new Set();
  });
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const filteredCategories = useMemo(() => {
    if (!searchTerm.trim()) return apiCategories;

    const term = searchTerm.toLowerCase();
    return apiCategories
      .map(category => ({
        ...category,
        endpoints: category.endpoints.filter(
          endpoint =>
            endpoint.path.toLowerCase().includes(term) ||
            endpoint.description.toLowerCase().includes(term) ||
            endpoint.method.toLowerCase().includes(term) ||
            category.name.toLowerCase().includes(term)
        )
      }))
      .filter(category => category.endpoints.length > 0);
  }, [searchTerm]);

  const toggleCategory = (categoryName: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryName)) {
        next.delete(categoryName);
      } else {
        next.add(categoryName);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedCategories(new Set(apiCategories.map(cat => cat.name)));
  };

  const collapseAll = () => {
    setExpandedCategories(new Set());
  };

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownloadSwagger = () => {
    const link = document.createElement('a');
    link.href = '/swagger.json';
    link.download = 'extreme-campus-controller-api-swagger.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'bg-blue-500';
      case 'POST': return 'bg-green-500';
      case 'PUT': return 'bg-yellow-500';
      case 'DELETE': return 'bg-red-500';
      case 'PATCH': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const totalEndpoints = apiCategories.reduce((sum, cat) => sum + cat.endpoints.length, 0);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold">EDGE Platform REST API</h1>
            <p className="text-muted-foreground">
              Complete API documentation for Extreme Platform ONE • {apiCategories.length} categories • {totalEndpoints} endpoints
            </p>
          </div>
        </div>
        <Button onClick={handleDownloadSwagger} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Download OpenAPI Spec
        </Button>
      </div>

      {/* API Introduction */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            API Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The Extreme Campus Controller REST API Gateway provides a single entry point for managing wireless networks,
            access points, clients, and network services. The API uses OAuth 2.0 bearer token authentication.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-semibold mb-2">Base URL</h4>
              <code className="text-sm bg-background px-2 py-1 rounded">https://&#123;IP_Address&#125;:5825/management</code>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-semibold mb-2">Authentication</h4>
              <code className="text-sm bg-background px-2 py-1 rounded">Bearer Token (OAuth 2.0)</code>
            </div>
            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-semibold mb-2">Content Type</h4>
              <code className="text-sm bg-background px-2 py-1 rounded">application/json</code>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search and Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search endpoints, methods, or descriptions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 focus-visible:ring-1 focus-visible:ring-offset-0"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>
            Expand All
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            Collapse All
          </Button>
        </div>
      </div>

      {/* API Categories */}
      <div className="space-y-4">
        {filteredCategories.map((category) => {
          const IconComponent = category.icon;
          const isExpanded = expandedCategories.has(category.name);

          return (
            <Collapsible key={category.name} open={isExpanded} onOpenChange={() => toggleCategory(category.name)}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <IconComponent className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{category.name}</CardTitle>
                          <CardDescription>{category.description}</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{category.endpoints.length} endpoints</Badge>
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <Separator className="mb-4" />
                    <div className="space-y-2">
                      {category.endpoints.map((endpoint, idx) => (
                        <div
                          key={`${endpoint.method}-${endpoint.path}-${idx}`}
                          className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group"
                        >
                          <Badge className={`${getMethodColor(endpoint.method)} text-white font-mono text-xs min-w-[60px] justify-center`}>
                            {endpoint.method}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <code className="text-sm font-mono break-all">{endpoint.path}</code>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => copyPath(endpoint.path)}
                              >
                                {copiedPath === endpoint.path ? (
                                  <Check className="h-3 w-3 text-green-500" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{endpoint.description}</p>
                            {endpoint.parameters && endpoint.parameters.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {endpoint.parameters.map(param => (
                                  <Badge key={param} variant="outline" className="text-xs">
                                    {param}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>

      {filteredCategories.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium">No endpoints found</p>
            <p className="text-muted-foreground">Try adjusting your search terms</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
