import { ReactNode } from 'react';
import { ArrowRight, Network } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { AccessPointDetail } from '../AccessPointDetail';
import { ClientDetail } from '../ClientDetail';

type Kind = 'access-point' | 'client' | 'switch';

interface EntityDetailViewProps {
  kind: Kind;
  entityId: string;
  entityName?: string | null;
  onBack: () => void;
}

const COPY: Record<Kind, { fallbackTitle: string; subtitle: string }> = {
  'access-point': {
    fallbackTitle: 'Access Point Details',
    subtitle: 'Detailed AP information and connected clients',
  },
  client: {
    fallbackTitle: 'Client Details',
    subtitle: 'Client connection and performance details',
  },
  switch: {
    fallbackTitle: 'Switch Details',
    subtitle: 'Switch configuration and port status',
  },
};

/**
 * EntityDetailView — wraps the back-button-header pattern used by the
 * access-point / client / switch detail views and dispatches to the
 * corresponding child component (or a placeholder for switch).
 */
export function EntityDetailView({ kind, entityId, entityName, onBack }: EntityDetailViewProps) {
  const copy = COPY[kind];

  let body: ReactNode;
  if (kind === 'access-point') {
    body = <AccessPointDetail serialNumber={entityId} />;
  } else if (kind === 'client') {
    body = <ClientDetail macAddress={entityId} />;
  } else {
    body = (
      <Card>
        <CardContent className="py-12 text-center">
          <Network className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h4 className="text-lg font-medium mb-2">Switch Details</h4>
          <p className="text-sm text-muted-foreground">
            Switch detail view for {entityName || entityId}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-b pb-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2">
            <ArrowRight className="h-4 w-4 rotate-180 mr-1" />
            Back
          </Button>
          <div>
            <h3 className="text-lg font-semibold">{entityName || copy.fallbackTitle}</h3>
            <p className="text-sm text-muted-foreground">{copy.subtitle}</p>
          </div>
        </div>
      </div>
      {body}
    </div>
  );
}
