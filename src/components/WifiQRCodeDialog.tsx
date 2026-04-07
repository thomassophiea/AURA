import { useState, useRef } from 'react';
import { DetailSlideOut } from './DetailSlideOut';
import { Button } from './ui/button';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Wifi, Shield, Radio } from 'lucide-react';
import { Badge } from './ui/badge';
import { toast } from 'sonner';

interface WifiQRCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wlan: {
    ssid: string;
    security: string;
    passphrase?: string;
    hidden?: boolean;
    name?: string;
    serviceName?: string;
    band?: string;
  };
}

export function WifiQRCodeDialog({ open, onOpenChange, wlan }: WifiQRCodeDialogProps) {
  const qrRef = useRef<HTMLDivElement>(null);

  // Generate WiFi QR code string in standard format
  // Format: WIFI:T:<auth_type>;S:<ssid>;P:<password>;H:<hidden>;;
  const generateWifiQRString = () => {
    const security = wlan.security?.toLowerCase() || 'open';
    let authType = 'nopass';

    if (security.includes('wpa3')) {
      authType = 'WPA'; // WPA3 uses WPA auth type in QR
    } else if (security.includes('wpa2') || security.includes('wpa')) {
      authType = 'WPA';
    } else if (security.includes('wep')) {
      authType = 'WEP';
    }

    const ssid = wlan.ssid;
    const password = wlan.passphrase || '';
    const hidden = wlan.hidden ? 'true' : 'false';

    // Escape special characters in SSID and password
    const escapedSSID = ssid.replace(/([\\;,":])/g, '\\$1');
    const escapedPassword = password.replace(/([\\;,":])/g, '\\$1');

    if (authType === 'nopass') {
      return `WIFI:T:nopass;S:${escapedSSID};H:${hidden};;`;
    } else {
      return `WIFI:T:${authType};S:${escapedSSID};P:${escapedPassword};H:${hidden};;`;
    }
  };

  const qrString = generateWifiQRString();

  const handleDownload = () => {
    try {
      const svg = qrRef.current?.querySelector('svg');
      if (!svg) {
        throw new Error('QR code not found');
      }

      // Create a canvas from the SVG
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        // Set canvas size with padding
        const padding = 40;
        canvas.width = img.width + padding * 2;
        canvas.height = img.height + padding * 2;

        if (ctx) {
          // White background
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Draw QR code centered
          ctx.drawImage(img, padding, padding);

          // Convert to blob and download
          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `wifi-${wlan.ssid.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);

              toast.success('QR Code Downloaded', {
                description: `Saved as ${a.download}`
              });
            }
          }, 'image/png');
        }
      };

      img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    } catch (error) {
      console.error('Error downloading QR code:', error);
      toast.error('Failed to download QR code', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  const getSecurityBadge = () => {
    const security = wlan.security?.toLowerCase() || 'unknown';

    if (security.includes('open')) {
      return <Badge variant="outline" className="gap-1"><Shield className="h-3 w-3" /> Open</Badge>;
    } else if (security.includes('wpa3')) {
      return <Badge variant="default" className="gap-1"><Shield className="h-3 w-3" /> WPA3</Badge>;
    } else if (security.includes('wpa2-enterprise') || security.includes('enterprise')) {
      return <Badge variant="secondary" className="gap-1"><Shield className="h-3 w-3" /> WPA2-Enterprise</Badge>;
    } else if (security.includes('wpa2')) {
      return <Badge variant="secondary" className="gap-1"><Shield className="h-3 w-3" /> WPA2</Badge>;
    } else {
      return <Badge variant="outline">{wlan.security || 'Unknown'}</Badge>;
    }
  };

  return (
    <DetailSlideOut
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="WiFi QR Code"
      description="Scan with your phone to connect to this network"
      width="md"
    >
      <div className="space-y-4">
        {/* Network Info */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <div className="font-medium text-lg">{wlan.ssid}</div>
          <div className="flex items-center gap-2 flex-wrap">
            {getSecurityBadge()}
            {wlan.band && (
              <Badge variant="outline" className="gap-1">
                <Radio className="h-3 w-3" />
                {wlan.band}
              </Badge>
            )}
            {wlan.hidden && (
              <Badge variant="outline" className="text-xs">
                Hidden
              </Badge>
            )}
          </div>
        </div>

        {/* QR Code */}
        <div ref={qrRef} className="flex justify-center p-6 bg-white rounded-lg">
          <QRCodeSVG
            value={qrString}
            size={256}
            level="M"
            includeMargin={false}
          />
        </div>

        {/* Instructions */}
        <div className="text-sm text-muted-foreground space-y-1">
          <p className="font-medium">How to use:</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Open your phone's camera app</li>
            <li>Point it at the QR code above</li>
            <li>Tap the WiFi notification that appears</li>
            <li>Your device will connect automatically</li>
          </ol>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Close
          </Button>
          <Button onClick={handleDownload} className="gap-2 flex-1">
            <Download className="h-4 w-4" />
            Download QR Code
          </Button>
        </div>
      </div>
    </DetailSlideOut>
  );
}
