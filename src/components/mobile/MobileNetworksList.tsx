/**
 * MobileNetworksList - Mobile-optimized WLANs view with QR codes
 * Quick access to network QR codes for easy sharing
 */

import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Loader2, Wifi, QrCode, Shield, Eye, EyeOff, Download, Share2, X, Check, Copy } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { apiService } from '@/services/api';
import { useHaptic } from '@/hooks/useHaptic';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';

interface Network {
  id: string;
  ssid: string;
  serviceName?: string;
  security: string;
  passphrase?: string;
  hidden?: boolean;
  enabled?: boolean;
  clientCount?: number;
}

interface MobileNetworksListProps {
  currentSite: string;
}

function NetworkCard({ 
  network, 
  onShowQR 
}: { 
  network: Network; 
  onShowQR: (network: Network) => void;
}) {
  const haptic = useHaptic();
  
  const getSecurityLabel = (security: string) => {
    const s = security?.toLowerCase() || '';
    if (s.includes('wpa3')) return 'WPA3';
    if (s.includes('wpa2-enterprise') || s.includes('enterprise')) return 'Enterprise';
    if (s.includes('wpa2')) return 'WPA2';
    if (s.includes('open')) return 'Open';
    return security || 'Unknown';
  };

  const getSecurityColor = (security: string) => {
    const s = security?.toLowerCase() || '';
    if (s.includes('wpa3')) return 'bg-green-500/10 text-green-600 border-green-500/20';
    if (s.includes('enterprise')) return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    if (s.includes('wpa2')) return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    if (s.includes('open')) return 'bg-red-500/10 text-red-600 border-red-500/20';
    return 'bg-muted text-muted-foreground';
  };

  const handleQRClick = () => {
    haptic.light();
    onShowQR(network);
  };

  return (
    <div className="rounded-xl px-3 py-2.5 border border-border/50 bg-card/50 backdrop-blur-sm shadow-sm active:bg-accent/80 active:scale-[0.99] transition-all duration-150">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Network Name + Security inline */}
          <div className="flex items-center gap-2">
            <Wifi className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            <span className="text-sm font-medium truncate">{network.ssid}</span>
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 flex-shrink-0 ${getSecurityColor(network.security)}`}>
              {getSecurityLabel(network.security)}
            </Badge>
            {network.enabled === false && (
              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">
                Off
              </Badge>
            )}
          </div>
          
          {/* Secondary info */}
          <div className="flex items-center gap-2 mt-0.5 ml-5">
            <span className="text-xs text-muted-foreground/80">
              {network.clientCount ?? 0} client{network.clientCount !== 1 ? 's' : ''}
            </span>
            {network.hidden && (
              <span className="text-xs text-muted-foreground/60 flex items-center gap-0.5">
                <EyeOff className="h-3 w-3" /> Hidden
              </span>
            )}
          </div>
        </div>

        {/* QR Button - smaller */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 flex-shrink-0 text-muted-foreground hover:text-primary"
          onClick={handleQRClick}
        >
          <QrCode className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

function QRCodeSheet({ 
  network, 
  isOpen, 
  onClose 
}: { 
  network: Network | null; 
  isOpen: boolean; 
  onClose: () => void;
}) {
  const haptic = useHaptic();
  const qrRef = useRef<HTMLDivElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  // Don't render if no network AND not open (allow render during close animation)
  if (!network && !isOpen) return null;
  
  // Use empty values if network is null (during close animation)
  const displayNetwork = network || { ssid: '', security: '', passphrase: '', hidden: false };

  // Generate WiFi QR string
  const generateWifiQRString = () => {
    const security = displayNetwork.security?.toLowerCase() || 'open';
    let authType = 'nopass';

    if (security.includes('wpa3') || security.includes('wpa2') || security.includes('wpa')) {
      authType = 'WPA';
    } else if (security.includes('wep')) {
      authType = 'WEP';
    }

    const ssid = displayNetwork.ssid;
    const password = displayNetwork.passphrase || '';
    const hidden = displayNetwork.hidden ? 'true' : 'false';

    const escapedSSID = ssid.replace(/([\\;,":])/g, '\\$1');
    const escapedPassword = password.replace(/([\\;,":])/g, '\\$1');

    if (authType === 'nopass') {
      return `WIFI:T:nopass;S:${escapedSSID};H:${hidden};;`;
    } else {
      return `WIFI:T:${authType};S:${escapedSSID};P:${escapedPassword};H:${hidden};;`;
    }
  };

  const handleDownload = () => {
    haptic.medium();
    try {
      const svg = qrRef.current?.querySelector('svg');
      if (!svg) throw new Error('QR code not found');

      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        const padding = 40;
        canvas.width = img.width + padding * 2;
        canvas.height = img.height + padding * 2;

        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, padding, padding);

          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `wifi-${displayNetwork.ssid.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              haptic.success();
              toast.success('QR Code saved to photos');
            }
          }, 'image/png');
        }
      };

      img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    } catch (error) {
      haptic.error();
      toast.error('Failed to download QR code');
    }
  };

  const handleShare = async () => {
    haptic.medium();
    if (navigator.share) {
      try {
        const svg = qrRef.current?.querySelector('svg');
        if (svg) {
          const svgData = new XMLSerializer().serializeToString(svg);
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const img = new Image();

          img.onload = async () => {
            canvas.width = img.width + 80;
            canvas.height = img.height + 80;
            if (ctx) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 40, 40);

              canvas.toBlob(async (blob) => {
                if (blob) {
                  const file = new File([blob], `wifi-${displayNetwork.ssid}.png`, { type: 'image/png' });
                  await navigator.share({
                    title: `WiFi: ${displayNetwork.ssid}`,
                    text: `Scan this QR code to connect to ${displayNetwork.ssid}`,
                    files: [file],
                  });
                  haptic.success();
                }
              }, 'image/png');
            }
          };
          img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          toast.error('Failed to share');
        }
      }
    } else {
      toast.info('Sharing not supported on this device');
    }
  };

  const handleCopyPassword = () => {
    haptic.light();
    if (displayNetwork.passphrase) {
      navigator.clipboard.writeText(displayNetwork.passphrase);
      setCopied(true);
      toast.success('Password copied');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/50 z-50 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      
      {/* Sheet */}
      <div 
        className={`fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-3xl transition-transform duration-300 ease-out ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '90vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Handle */}
        <div className="flex justify-center py-3">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>

        {/* Content */}
        <div className="px-6 pb-6 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 48px)' }}>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">{displayNetwork.ssid}</h2>
              <p className="text-sm text-muted-foreground">Scan to connect</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* QR Code */}
          <div ref={qrRef} className="flex justify-center p-6 bg-white rounded-2xl">
            <QRCodeSVG
              value={generateWifiQRString()}
              size={220}
              level="M"
              includeMargin={false}
            />
          </div>

          {/* Password (if PSK) */}
          {displayNetwork.passphrase && (
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Password</label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={displayNetwork.passphrase}
                    readOnly
                    className="pr-10 font-mono"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => {
                      haptic.light();
                      setShowPassword(!showPassword);
                    }}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyPassword}
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="outline" onClick={handleDownload} className="h-12 gap-2">
              <Download className="h-5 w-5" />
              Save
            </Button>
            <Button onClick={handleShare} className="h-12 gap-2">
              <Share2 className="h-5 w-5" />
              Share
            </Button>
          </div>

          {/* Instructions */}
          <div className="text-xs text-muted-foreground text-center pt-2">
            Point your camera at the QR code to connect automatically
          </div>
        </div>
      </div>
    </>
  );
}

export function MobileNetworksList({ currentSite }: MobileNetworksListProps) {
  const haptic = useHaptic();
  const [networks, setNetworks] = useState<Network[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<Network | null>(null);
  const [qrSheetOpen, setQrSheetOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const loadNetworks = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // Get services and clients to calculate client counts
      const [services, stations] = await Promise.all([
        apiService.getServices(),
        apiService.getStations().catch(() => [])
      ]);
      
      // Count clients per service/SSID
      const clientCountByService: Record<string, number> = {};
      const clientCountBySSID: Record<string, number> = {};
      
      stations.forEach((station: any) => {
        const serviceId = station.serviceId;
        const ssid = station.ssid || station.essid || station.networkName;
        if (serviceId) {
          clientCountByService[serviceId] = (clientCountByService[serviceId] || 0) + 1;
        }
        if (ssid) {
          clientCountBySSID[ssid] = (clientCountBySSID[ssid] || 0) + 1;
        }
      });
      
      // Transform to network format with security detection
      const networkList: Network[] = services.map((s: any) => {
        let security = 'Open';
        let passphrase = '';
        const ssidName = s.ssid || s.serviceName || s.name || '';

        // Priority 1: Check for WPA3-SAE (multiple possible locations)
        const saeElement = s.WpaSaeElement 
          || s.privacy?.WpaSaeElement 
          || s.privacy?.wpaSaeElement
          || s.privacy?.sae
          || s.privacy?.Wpa3SaeElement
          || s.Wpa3SaeElement;

        if (saeElement) {
          if (saeElement?.pmfMode === 'required' && saeElement?.saeMethod === 'SaeH2e') {
            security = 'WPA3-Personal';
          } else if (saeElement?.pmfMode === 'capable') {
            security = 'WPA2/WPA3-Personal';
          } else {
            security = 'WPA3-Personal';
          }
          passphrase = saeElement.presharedKey || '';
        }
        // Priority 2: Check for WPA Enterprise (802.1X) - check all possible field names
        else if (s.WpaEnterpriseElement || s.privacy?.WpaEnterpriseElement 
          || s.Wpa2EnterpriseElement || s.privacy?.Wpa2EnterpriseElement
          || s.Wpa3Enterprise192Element || s.privacy?.Wpa3Enterprise192Element
          || s.Wpa3EnterpriseTransitionElement || s.privacy?.Wpa3EnterpriseTransitionElement
          || s.radiusServerAddress || s.privacy?.radiusServerAddress
          || s.radiusSecret || s.privacy?.radiusSecret
          || s.authenticationServerIp || s.privacy?.authenticationServerIp) {
          const enterpriseElement = s.WpaEnterpriseElement || s.privacy?.WpaEnterpriseElement
            || s.Wpa2EnterpriseElement || s.privacy?.Wpa2EnterpriseElement;
          const mode = enterpriseElement?.mode?.toLowerCase();
          
          if (s.Wpa3Enterprise192Element || s.privacy?.Wpa3Enterprise192Element 
            || s.Wpa3EnterpriseTransitionElement || s.privacy?.Wpa3EnterpriseTransitionElement
            || enterpriseElement?.pmfMode === 'required') {
            security = 'WPA3-Enterprise';
          } else if (mode === 'wpa3mixed') {
            security = 'WPA2/WPA3-Enterprise';
          } else {
            security = 'WPA2-Enterprise';
          }
        }
        // Priority 3: Check for 802.1X / EAP specific fields
        else if (s.WpaEapElement || s.privacy?.WpaEapElement
          || s.eapElement || s.privacy?.eapElement
          || s.dot1xElement || s.privacy?.dot1xElement
          || s['802.1x'] || s.privacy?.['802.1x']
          || s.dot1x || s.privacy?.dot1x
          || s.eap || s.privacy?.eap) {
          security = 'WPA2-Enterprise';
        }
        // Priority 4: Check for WPA PSK
        else if (s.WpaPskElement || s.privacy?.WpaPskElement) {
          const pskElement = s.WpaPskElement || s.privacy?.WpaPskElement;
          const mode = pskElement?.mode?.toLowerCase();
          
          if (mode === 'wpa3only' || mode === 'wpa3mixed') {
            security = mode === 'wpa3only' ? 'WPA3-Personal' : 'WPA2/WPA3-Personal';
          } else {
            security = 'WPA2-Personal';
          }
          passphrase = pskElement?.presharedKey || '';
        }
        // Priority 5: Check for OWE (Enhanced Open)
        else if (s.OweElement || s.privacy?.OweElement) {
          security = 'OWE (Enhanced Open)';
        }
        // Priority 6: Check for WEP
        else if (s.WepElement || s.privacy?.WepElement) {
          security = 'WEP';
        }
        // Priority 7: Check explicit security/auth type fields
        else if (s.security?.type) {
          security = s.security.type;
        } else if (s.securityType) {
          security = s.securityType;
        } else if (s.authType) {
          security = s.authType;
        } else if (s.privacyType && s.privacyType !== 'None') {
          security = s.privacyType;
        }
        // Priority 8: Check mode field
        else if (s.mode) {
          const mode = s.mode.toLowerCase();
          if (mode === 'open' || mode === 'none') {
            security = 'Open';
          } else {
            security = s.mode;
          }
        }
        // Priority 9: Check privacy object has any keys (non-empty = secured)
        else if (s.privacy && typeof s.privacy === 'object' && Object.keys(s.privacy).length > 0) {
          // Has privacy config but we didn't match specific type - assume WPA2
          security = 'WPA2';
        }
        
        // Debug: Log services that still show as Open
        if (security === 'Open') {
          console.log(`[MobileNetworks] "${ssidName}" detected as Open. Service data:`, {
            hasPrivacy: !!s.privacy,
            privacyKeys: s.privacy ? Object.keys(s.privacy) : [],
            topLevelKeys: Object.keys(s).filter(k => k.toLowerCase().includes('wpa') || k.toLowerCase().includes('privacy') || k.toLowerCase().includes('security') || k.toLowerCase().includes('radius') || k.toLowerCase().includes('eap'))
          });
        }

        // Get client count from our mapping
        const ssid = s.ssid || s.serviceName;
        const clientCount = s.clientCount ?? clientCountByService[s.id] ?? clientCountBySSID[ssid] ?? 0;

        return {
          id: s.id,
          ssid,
          serviceName: s.serviceName,
          security,
          passphrase,
          hidden: s.suppressSsid || false,
          enabled: s.status === 'enabled',
          clientCount,
        };
      });

      setNetworks(networkList);
    } catch (error) {
      console.error('[MobileNetworks] Error loading networks:', error);
      toast.error('Failed to load networks');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadNetworks();
  }, [currentSite]);

  const handleRefresh = async () => {
    haptic.medium();
    await loadNetworks(true);
    haptic.success();
  };

  const handleShowQR = (network: Network) => {
    setSelectedNetwork(network);
    setQrSheetOpen(true);
  };

  const filteredNetworks = networks.filter(n =>
    n.ssid.toLowerCase().includes(searchTerm.toLowerCase()) ||
    n.serviceName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="px-3 py-3 space-y-3 pb-24">
      {/* Search and Refresh */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search networks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 h-10 text-sm"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="h-10 w-10 flex-shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Loading state */}
      {loading && networks.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
        </div>
      )}

      {/* Networks list */}
      {!loading && filteredNetworks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Networks</span>
            <span className="text-xs text-muted-foreground">
              {filteredNetworks.length}
            </span>
          </div>
          {filteredNetworks.map((network) => (
            <NetworkCard key={network.id} network={network} onShowQR={handleShowQR} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredNetworks.length === 0 && (
        <div className="text-center py-8">
          <Wifi className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm font-medium">
            {searchTerm ? 'No matching networks' : 'No Networks'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {searchTerm ? 'Try a different search' : 'No WLANs configured'}
          </p>
        </div>
      )}

      {/* QR Code Sheet */}
      <QRCodeSheet
        network={selectedNetwork}
        isOpen={qrSheetOpen}
        onClose={() => setQrSheetOpen(false)}
      />
    </div>
  );
}
