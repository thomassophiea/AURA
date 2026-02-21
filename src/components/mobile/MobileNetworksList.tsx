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
    <div className="rounded-xl p-4 border bg-card active:bg-muted/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Network Name */}
          <div className="flex items-center gap-2 mb-1">
            <Wifi className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="font-semibold truncate">{network.ssid}</span>
          </div>
          
          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge variant="outline" className={`text-xs ${getSecurityColor(network.security)}`}>
              <Shield className="h-3 w-3 mr-1" />
              {getSecurityLabel(network.security)}
            </Badge>
            {network.hidden && (
              <Badge variant="outline" className="text-xs">
                <EyeOff className="h-3 w-3 mr-1" />
                Hidden
              </Badge>
            )}
            {network.enabled === false && (
              <Badge variant="destructive" className="text-xs">
                Disabled
              </Badge>
            )}
          </div>

          {/* Client count */}
          {network.clientCount !== undefined && (
            <div className="text-xs text-muted-foreground mt-2">
              {network.clientCount} connected client{network.clientCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* QR Button */}
        <Button
          variant="outline"
          size="icon"
          className="h-12 w-12 flex-shrink-0"
          onClick={handleQRClick}
        >
          <QrCode className="h-6 w-6" />
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

  if (!network) return null;

  // Generate WiFi QR string
  const generateWifiQRString = () => {
    const security = network.security?.toLowerCase() || 'open';
    let authType = 'nopass';

    if (security.includes('wpa3') || security.includes('wpa2') || security.includes('wpa')) {
      authType = 'WPA';
    } else if (security.includes('wep')) {
      authType = 'WEP';
    }

    const ssid = network.ssid;
    const password = network.passphrase || '';
    const hidden = network.hidden ? 'true' : 'false';

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
              a.download = `wifi-${network.ssid.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
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
                  const file = new File([blob], `wifi-${network.ssid}.png`, { type: 'image/png' });
                  await navigator.share({
                    title: `WiFi: ${network.ssid}`,
                    text: `Scan this QR code to connect to ${network.ssid}`,
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
    if (network.passphrase) {
      navigator.clipboard.writeText(network.passphrase);
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
              <h2 className="text-xl font-bold">{network.ssid}</h2>
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
          {network.passphrase && (
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Password</label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={network.passphrase}
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

      const services = await apiService.getServices();
      
      // Transform to network format with security detection
      const networkList: Network[] = services.map((s: any) => {
        let security = 'Open';
        let passphrase = '';

        if (s.privacy) {
          if (s.privacy.WpaPskElement) {
            security = 'WPA2-PSK';
            passphrase = s.privacy.WpaPskElement.presharedKey || '';
          } else if (s.privacy.Wpa3SaeElement) {
            security = 'WPA3-Personal';
            passphrase = s.privacy.Wpa3SaeElement.presharedKey || '';
          } else if (s.privacy.Wpa2EnterpriseElement) {
            security = 'WPA2-Enterprise';
          } else if (s.privacy.OweElement) {
            security = 'OWE';
          }
        }

        return {
          id: s.id,
          ssid: s.ssid || s.serviceName,
          serviceName: s.serviceName,
          security,
          passphrase,
          hidden: s.suppressSsid || false,
          enabled: s.status === 'enabled',
          clientCount: s.clientCount,
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
    <div className="p-4 space-y-4 pb-24">
      {/* Search and Refresh */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search networks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 h-12"
        />
        <Button
          variant="outline"
          size="icon"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="h-12 w-12 flex-shrink-0"
        >
          <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Loading state */}
      {loading && networks.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Loading networks...</span>
        </div>
      )}

      {/* Networks list */}
      {!loading && filteredNetworks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Networks</h2>
            <span className="text-xs text-muted-foreground">
              {filteredNetworks.length} WLAN{filteredNetworks.length !== 1 ? 's' : ''}
            </span>
          </div>
          {filteredNetworks.map((network) => (
            <NetworkCard key={network.id} network={network} onShowQR={handleShowQR} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredNetworks.length === 0 && (
        <div className="text-center py-12">
          <Wifi className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-lg font-semibold">
            {searchTerm ? 'No matching networks' : 'No Networks'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {searchTerm ? 'Try a different search term' : 'No WLANs configured'}
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
