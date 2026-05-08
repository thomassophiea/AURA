import { memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { AlertTriangle } from 'lucide-react';

export interface PoorService {
  id: string | number;
  name: string;
  reliability?: number;
  uptime?: number;
}

interface ServicesHealthSectionProps {
  poorServices: PoorService[];
}

/**
 * ServicesHealthSection — list of services with degraded reliability/uptime.
 * Renders nothing when poorServices is empty (caller should also gate via
 * showSection('services-health')).
 */
function ServicesHealthSectionImpl({ poorServices }: ServicesHealthSectionProps) {
  return (
    <Card className="border-[color:var(--status-warning)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-[color:var(--status-warning)]" />
          Services Requiring Attention
        </CardTitle>
        <CardDescription>Services with degraded performance</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {poorServices.map((service) => (
            <div
              key={service.id}
              className="flex items-center justify-between p-3 rounded-lg border border-[color:var(--status-warning)]/50 bg-[color:var(--status-warning-bg)]"
            >
              <div>
                <div className="font-medium">{service.name}</div>
                <div className="text-sm text-muted-foreground">
                  {Number.isFinite(service.reliability) && (service.reliability as number) < 95 && (
                    <span className="mr-3">Reliability: {service.reliability}%</span>
                  )}
                  {Number.isFinite(service.uptime) && (service.uptime as number) < 95 && (
                    <span>Uptime: {service.uptime}%</span>
                  )}
                </div>
              </div>
              <Badge
                variant="outline"
                className="border-[color:var(--status-warning)] text-[color:var(--status-warning)]"
              >
                Degraded
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export const ServicesHealthSection = memo(ServicesHealthSectionImpl);
