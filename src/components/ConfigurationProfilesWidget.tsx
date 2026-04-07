import { useState, useEffect ,  memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Settings, Shield, Wifi, Target, TrendingUp, Network, Layers } from 'lucide-react';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { apiService } from '../services/api';

/**
 * Configuration Profiles Widget
 *
 * Displays comprehensive configuration profiles across all categories:
 * - RF Management Profiles
 * - IoT Profiles
 * - ADSP (AirDefense Services Platform) Profiles
 * - Analytics Profiles
 * - Positioning Profiles
 * - Roles/Policies
 * - CoS (Class of Service) Profiles
 * - Rate Limiters
 *
 * Uses multiple Extreme Platform ONE APIs to provide complete configuration visibility
 */

// Standard 802.1p CoS priority mappings
const COS_NAME_MAP: Record<string, string> = {
  '1eea4d66-2607-11e7-93ae-92361f002671': 'Background (Priority 1)',
  '1eea4d66-2607-11e7-93ae-92361f002672': 'Best Effort (Priority 0)',
  '1eea4d66-2607-11e7-93ae-92361f002673': 'Excellent Effort (Priority 2)',
  '1eea4d66-2607-11e7-93ae-92361f002674': 'Critical Applications (Priority 3)',
  '1eea4d66-2607-11e7-93ae-92361f002675': 'Video (Priority 4)',
  '1eea4d66-2607-11e7-93ae-92361f002676': 'Voice (Priority 5)',
  '1eea4d66-2607-11e7-93ae-92361f002677': 'Internetwork Control (Priority 6)',
  '1eea4d66-2607-11e7-93ae-92361f002678': 'Network Control (Priority 7)',
  '1eea4d66-2607-11e7-93ae-92361f002679': 'CoS Profile 8',
  'b3021be1-a663-4f20-82e4-40bbd1a4e9a6': 'Custom CoS Profile 1',
  '83080873-a72c-4aa0-af3c-41907a51c030': 'Custom CoS Profile 2'
};

function getCoSProfileName(profile: any): string {
  // Try to get name from profile fields
  if (profile.name) return profile.name;
  if (profile.displayName) return profile.displayName;
  if (profile.cosName) return profile.cosName;

  // Check if this is a known standard CoS profile
  if (profile.id && COS_NAME_MAP[profile.id]) {
    return COS_NAME_MAP[profile.id];
  }

  // Fallback to ID
  return profile.id || 'Unknown CoS Profile';
}

export function ConfigurationProfilesWidget() {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<{
    rfMgmt: any[];
    iot: any[];
    adsp: any[];
    analytics: any[];
    positioning: any[];
    roles: any[];
    cos: any[];
    rateLimiters: any[];
  }>({
    rfMgmt: [],
    iot: [],
    adsp: [],
    analytics: [],
    positioning: [],
    roles: [],
    cos: [],
    rateLimiters: []
  });

  useEffect(() => {
    loadAllProfiles();
  }, []);

  const loadAllProfiles = async () => {
    setLoading(true);

    try {
      console.log('[ConfigurationProfiles] Loading all configuration profiles...');

      // Load all profile types in parallel
      const [rfMgmt, iot, adsp, analytics, positioning, roles, cos, rateLimiters] = await Promise.all([
        apiService.getRFManagementProfiles(),
        apiService.getIoTProfiles(),
        apiService.getADSPProfiles(),
        apiService.getAnalyticsProfiles(),
        apiService.getPositioningProfiles(),
        apiService.getRoles(),
        apiService.getCoSProfiles(),
        apiService.getRateLimiters()
      ]);

      setProfiles({
        rfMgmt,
        iot,
        adsp,
        analytics,
        positioning,
        roles,
        cos,
        rateLimiters
      });

      console.log('[ConfigurationProfiles] Loaded all profiles:', {
        rfMgmt: rfMgmt.length,
        iot: iot.length,
        adsp: adsp.length,
        analytics: analytics.length,
        positioning: positioning.length,
        roles: roles.length,
        cos: cos.length,
        rateLimiters: rateLimiters.length
      });
    } catch (error) {
      console.error('[ConfigurationProfiles] Error loading profiles:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTotalCount = () => {
    return Object.values(profiles).reduce((sum, arr) => sum + arr.length, 0);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Configuration Profiles
          </CardTitle>
          <CardDescription>System-wide configuration and policy profiles</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <div className="text-muted-foreground">Loading configuration profiles...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          Configuration Profiles
        </CardTitle>
        <CardDescription>
          {getTotalCount()} total profiles across 8 categories
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="rf">RF & Radio</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="qos">QoS & Performance</TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              {/* RF Management */}
              <div className="p-3 rounded-lg border bg-card hover:bg-accent transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <Wifi className="h-4 w-4 text-blue-500" />
                  <div className="text-sm font-medium">RF Management</div>
                </div>
                <div className="text-2xl font-bold">{profiles.rfMgmt.length}</div>
                <div className="text-xs text-muted-foreground">Radio resource policies</div>
              </div>

              {/* IoT Profiles */}
              <div className="p-3 rounded-lg border bg-card hover:bg-accent transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <Network className="h-4 w-4 text-green-500" />
                  <div className="text-sm font-medium">IoT Profiles</div>
                </div>
                <div className="text-2xl font-bold">{profiles.iot.length}</div>
                <div className="text-xs text-muted-foreground">IoT device policies</div>
              </div>

              {/* ADSP */}
              <div className="p-3 rounded-lg border bg-card hover:bg-accent transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-purple-500" />
                  <div className="text-sm font-medium">ADSP</div>
                </div>
                <div className="text-2xl font-bold">{profiles.adsp.length}</div>
                <div className="text-xs text-muted-foreground">AirDefense Services Platform</div>
              </div>

              {/* Analytics */}
              <div className="p-3 rounded-lg border bg-card hover:bg-accent transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-orange-500" />
                  <div className="text-sm font-medium">Analytics</div>
                </div>
                <div className="text-2xl font-bold">{profiles.analytics.length}</div>
                <div className="text-xs text-muted-foreground">Analytics profiles</div>
              </div>

              {/* Positioning */}
              <div className="p-3 rounded-lg border bg-card hover:bg-accent transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-cyan-500" />
                  <div className="text-sm font-medium">Positioning</div>
                </div>
                <div className="text-2xl font-bold">{profiles.positioning.length}</div>
                <div className="text-xs text-muted-foreground">Location services</div>
              </div>

              {/* Roles */}
              <div className="p-3 rounded-lg border bg-card hover:bg-accent transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-red-500" />
                  <div className="text-sm font-medium">Roles</div>
                </div>
                <div className="text-2xl font-bold">{profiles.roles.length}</div>
                <div className="text-xs text-muted-foreground">Access control roles</div>
              </div>

              {/* CoS */}
              <div className="p-3 rounded-lg border bg-card hover:bg-accent transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="h-4 w-4 text-amber-500" />
                  <div className="text-sm font-medium">CoS</div>
                </div>
                <div className="text-2xl font-bold">{profiles.cos.length}</div>
                <div className="text-xs text-muted-foreground">Class of Service</div>
              </div>

              {/* Rate Limiters */}
              <div className="p-3 rounded-lg border bg-card hover:bg-accent transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-pink-500" />
                  <div className="text-sm font-medium">Rate Limiters</div>
                </div>
                <div className="text-2xl font-bold">{profiles.rateLimiters.length}</div>
                <div className="text-xs text-muted-foreground">Bandwidth limits</div>
              </div>
            </div>
          </TabsContent>

          {/* RF & Radio Tab */}
          <TabsContent value="rf" className="space-y-3 mt-4">
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Wifi className="h-4 w-4" />
                RF Management Profiles ({profiles.rfMgmt.length})
              </h4>
              {profiles.rfMgmt.length > 0 ? (
                <div className="space-y-2">
                  {profiles.rfMgmt.map((profile: any, idx: number) => (
                    <div key={idx} className="p-2 rounded border bg-card text-sm">
                      <div className="font-medium">{profile.name || profile.id || `Profile ${idx + 1}`}</div>
                      {profile.description && (
                        <div className="text-xs text-muted-foreground mt-1">{profile.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No RF management profiles found</div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Network className="h-4 w-4" />
                IoT Profiles ({profiles.iot.length})
              </h4>
              {profiles.iot.length > 0 ? (
                <div className="space-y-2">
                  {profiles.iot.map((profile: any, idx: number) => (
                    <div key={idx} className="p-2 rounded border bg-card text-sm">
                      <div className="font-medium">{profile.name || profile.id || `Profile ${idx + 1}`}</div>
                      {profile.enabled !== undefined && (
                        <Badge variant={profile.enabled ? "default" : "secondary"} className="text-xs mt-1">
                          {profile.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No IoT profiles found</div>
              )}
            </div>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-3 mt-4">
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Roles & Policies ({profiles.roles.length})
              </h4>
              {profiles.roles.length > 0 ? (
                <div className="space-y-2">
                  {profiles.roles.map((role: any, idx: number) => (
                    <div key={idx} className="p-2 rounded border bg-card text-sm">
                      <div className="font-medium">{role.name || role.id || `Role ${idx + 1}`}</div>
                      {role.description && (
                        <div className="text-xs text-muted-foreground mt-1">{role.description}</div>
                      )}
                      {role.rules && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {role.rules.length} rule{role.rules.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No roles found</div>
              )}
            </div>
          </TabsContent>

          {/* QoS & Performance Tab */}
          <TabsContent value="qos" className="space-y-3 mt-4">
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Layers className="h-4 w-4" />
                CoS Profiles ({profiles.cos.length})
              </h4>
              {profiles.cos.length > 0 ? (
                <div className="space-y-2">
                  {profiles.cos.map((profile: any, idx: number) => (
                    <div key={idx} className="p-2 rounded border bg-card text-sm">
                      <div className="font-medium">{getCoSProfileName(profile)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No CoS profiles found</div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Rate Limiters ({profiles.rateLimiters.length})
              </h4>
              {profiles.rateLimiters.length > 0 ? (
                <div className="space-y-2">
                  {profiles.rateLimiters.map((limiter: any, idx: number) => (
                    <div key={idx} className="p-2 rounded border bg-card text-sm">
                      <div className="font-medium">{limiter.name || limiter.id || `Limiter ${idx + 1}`}</div>
                      {limiter.uplink && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Uplink: {limiter.uplink} Mbps
                        </div>
                      )}
                      {limiter.downlink && (
                        <div className="text-xs text-muted-foreground">
                          Downlink: {limiter.downlink} Mbps
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No rate limiters found</div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Target className="h-4 w-4" />
                ADSP Profiles ({profiles.adsp.length})
              </h4>
              {profiles.adsp.length > 0 ? (
                <div className="space-y-2">
                  {profiles.adsp.map((profile: any, idx: number) => (
                    <div key={idx} className="p-2 rounded border bg-card text-sm">
                      <div className="font-medium">{profile.name || profile.id || `ADSP ${idx + 1}`}</div>
                      {profile.description && (
                        <div className="text-xs text-muted-foreground mt-1">{profile.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No ADSP profiles found</div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
