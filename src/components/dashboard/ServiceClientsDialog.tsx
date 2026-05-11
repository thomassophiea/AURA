/**
 * ServiceClientsDialog — list the connected clients for a selected service
 * (SSID). Clicking a row opens the parent's ClientDetailDialog with that
 * client preselected.
 */

import { memo } from 'react';
import { CheckCircle, Signal, Users } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { DetailSlideOut } from '../DetailSlideOut';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Station = any;

interface ServiceClientsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedService: string | null;
  clients: Station[];
  onSelectClient: (client: Station) => void;
}

function ServiceClientsDialogComponent({
  isOpen,
  onClose,
  selectedService,
  clients,
  onSelectClient,
}: ServiceClientsDialogProps) {
  return (
    <DetailSlideOut
      isOpen={isOpen}
      onClose={onClose}
      title={`Clients on ${selectedService}`}
      description={`${clients.length} client(s) connected to this service`}
      width="xl"
    >
      <div className="space-y-2">
        {clients.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No clients found for this service</p>
          </div>
        ) : (
          clients.map((client, idx) => (
            <Card
              key={client.macAddress || idx}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => onSelectClient(client)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {client.vendorIcon && <div className="text-2xl">{client.vendorIcon}</div>}
                    <div>
                      <p className="font-medium">{client.hostName || client.macAddress}</p>
                      <p className="text-xs text-muted-foreground">{client.macAddress}</p>
                      {client.ipAddress && (
                        <p className="text-xs text-muted-foreground">{client.ipAddress}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    {client.rssi !== undefined && (
                      <div className="flex items-center gap-1">
                        <Signal
                          className={`h-4 w-4 ${
                            client.rssi >= -50
                              ? 'text-[color:var(--status-success)]'
                              : client.rssi >= -60
                                ? 'text-[color:var(--status-info)]'
                                : client.rssi >= -70
                                  ? 'text-[color:var(--status-warning)]'
                                  : 'text-[color:var(--status-error)]'
                          }`}
                        />
                        <span className="text-muted-foreground">{client.rssi} dBm</span>
                      </div>
                    )}
                    {client.authenticated !== false && (
                      <Badge
                        variant="outline"
                        className="text-[color:var(--status-success)] border-[color:var(--status-success)]"
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Authenticated
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </DetailSlideOut>
  );
}

export const ServiceClientsDialog = memo(ServiceClientsDialogComponent);
