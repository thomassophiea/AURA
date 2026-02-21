import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { Shield, Plus, Upload, Download, Trash2, RefreshCw, AlertTriangle, CheckCircle, Clock, Key } from 'lucide-react';
import { toast } from 'sonner';
import { apiService } from '../services/api';
import type { TrustPoint, CertificateType, CertificateStatus } from '../types/system';

export function CertificateManager() {
  const [certificates, setCertificates] = useState<TrustPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<CertificateType>('browser');
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [uploadType, setUploadType] = useState<CertificateType>('browser');
  const [selectedCert, setSelectedCert] = useState<TrustPoint | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({ name: '', certificate: '', privateKey: '' });

  const loadCertificates = async () => {
    setLoading(true);
    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/trustpoints', {}, 8000);
      if (response.ok) {
        const data = await response.json();
        setCertificates(data || []);
      }
    } catch (error) {
      console.error('Failed to load certificates:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCertificates();
  }, []);

  const getStatusBadge = (status: CertificateStatus) => {
    switch (status) {
      case 'valid': return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Valid</Badge>;
      case 'expired': return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Expired</Badge>;
      case 'expiring-soon': return <Badge className="bg-yellow-500"><Clock className="h-3 w-3 mr-1" />Expiring Soon</Badge>;
      default: return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const filterByType = (type: CertificateType) => certificates.filter(c => c.type === type);

  const getExpiringCertificates = () => {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return certificates.filter(c => {
      const expiryDate = new Date(c.notAfter);
      return expiryDate <= thirtyDaysFromNow && c.status !== 'expired';
    });
  };

  const handleUpload = async () => {
    if (!uploadForm.name.trim()) {
      toast.error('Certificate name is required');
      return;
    }
    if (!uploadForm.certificate.trim()) {
      toast.error('Certificate file is required');
      return;
    }

    try {
      const response = await apiService.makeAuthenticatedRequest('/v1/trustpoints', {
        method: 'POST',
        body: JSON.stringify({
          name: uploadForm.name,
          type: uploadType,
          certificate: uploadForm.certificate,
          privateKey: uploadForm.privateKey || undefined,
        }),
      });

      if (response.ok) {
        toast.success('Certificate uploaded successfully');
        setIsUploadDialogOpen(false);
        setUploadForm({ name: '', certificate: '', privateKey: '' });
        loadCertificates();
      } else {
        toast.error('Failed to upload certificate');
      }
    } catch (error) {
      toast.error('Failed to upload certificate');
    }
  };

  const handleDelete = async (cert: TrustPoint) => {
    if (!window.confirm(`Delete certificate "${cert.name}"?`)) return;

    try {
      const response = await apiService.makeAuthenticatedRequest(`/v1/trustpoints/${cert.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Certificate deleted');
        setCertificates(certificates.filter(c => c.id !== cert.id));
      } else {
        toast.error('Failed to delete certificate');
      }
    } catch (error) {
      toast.error('Failed to delete certificate');
    }
  };

  const handleFileUpload = (field: 'certificate' | 'privateKey') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setUploadForm(prev => ({ ...prev, [field]: content }));
    };
    reader.readAsText(file);
  };

  const expiringCerts = getExpiringCertificates();

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Certificate Manager
          </h2>
          <p className="text-muted-foreground">Manage SSL certificates and trust points</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadCertificates} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => { setUploadType(activeTab); setIsUploadDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Upload Certificate
          </Button>
        </div>
      </div>

      {expiringCerts.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {expiringCerts.length} certificate(s) expiring within 30 days: {expiringCerts.map(c => c.name).join(', ')}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Trust Points</CardTitle>
          <CardDescription>{certificates.length} certificate(s) configured</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CertificateType)}>
            <TabsList>
              <TabsTrigger value="browser">Browser/HTTPS</TabsTrigger>
              <TabsTrigger value="radius">RADIUS</TabsTrigger>
              <TabsTrigger value="radsec">RadSec</TabsTrigger>
              <TabsTrigger value="ca">Certificate Authorities</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-4">
              {filterByType(activeTab).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No {activeTab} certificates configured
                </div>
              ) : (
                filterByType(activeTab).map(cert => (
                  <Card key={cert.id} className="mb-3">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Shield className="h-5 w-5 text-primary" />
                        <div>
                          <div className="font-medium">{cert.name}</div>
                          <div className="text-sm text-muted-foreground">
                            Expires: {new Date(cert.notAfter).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {cert.privateKeyPresent && (
                          <Badge variant="outline"><Key className="h-3 w-3 mr-1" />Key</Badge>
                        )}
                        {getStatusBadge(cert.status)}
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedCert(cert); setIsDetailDialogOpen(true); }}>
                          View
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(cert)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Certificate</DialogTitle>
            <DialogDescription>Upload a new certificate to the trust store</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Certificate Type</Label>
              <select
                className="w-full p-2 border rounded-md"
                value={uploadType}
                onChange={(e) => setUploadType(e.target.value as CertificateType)}
              >
                <option value="browser">Browser/HTTPS</option>
                <option value="radius">RADIUS</option>
                <option value="radsec">RadSec</option>
                <option value="ca">Certificate Authority</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={uploadForm.name}
                onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                placeholder="Certificate name"
              />
            </div>
            <div className="space-y-2">
              <Label>Certificate File (PEM/CRT)</Label>
              <Input
                type="file"
                accept=".pem,.crt,.cer"
                onChange={handleFileUpload('certificate')}
              />
              {uploadForm.certificate && (
                <div className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Certificate loaded
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Private Key (optional)</Label>
              <Input
                type="file"
                accept=".pem,.key"
                onChange={handleFileUpload('privateKey')}
              />
              {uploadForm.privateKey && (
                <div className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Private key loaded
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpload}>
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Certificate Details</DialogTitle>
          </DialogHeader>
          {selectedCert && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Name</Label>
                  <div className="font-medium">{selectedCert.name}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Type</Label>
                  <div className="font-medium capitalize">{selectedCert.type}</div>
                </div>
                <div className="col-span-2">
                  <Label className="text-muted-foreground">Subject</Label>
                  <div className="font-medium text-sm break-all">{selectedCert.subject}</div>
                </div>
                <div className="col-span-2">
                  <Label className="text-muted-foreground">Issuer</Label>
                  <div className="font-medium text-sm break-all">{selectedCert.issuer}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Serial Number</Label>
                  <div className="font-mono text-sm">{selectedCert.serialNumber}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div>{getStatusBadge(selectedCert.status)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Valid From</Label>
                  <div className="font-medium">{new Date(selectedCert.notBefore).toLocaleDateString()}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Valid To</Label>
                  <div className="font-medium">{new Date(selectedCert.notAfter).toLocaleDateString()}</div>
                </div>
                {selectedCert.fingerprint && (
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">Fingerprint (SHA-256)</Label>
                    <div className="font-mono text-xs break-all">{selectedCert.fingerprint}</div>
                  </div>
                )}
                <div className="col-span-2">
                  <Label className="text-muted-foreground">Private Key</Label>
                  <div className="flex items-center gap-2">
                    {selectedCert.privateKeyPresent ? (
                      <Badge className="bg-green-500"><Key className="h-3 w-3 mr-1" />Present</Badge>
                    ) : (
                      <Badge variant="secondary">Not Present</Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
