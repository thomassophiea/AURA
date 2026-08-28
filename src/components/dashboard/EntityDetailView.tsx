import { ArrowRight } from 'lucide-react';
import { Button } from '../ui/button';
import { AccessPointDetail } from '../AccessPointDetail';
import { ClientDetail } from '../ClientDetail';

type Kind = 'access-point' | 'client';

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
};

/**
 * EntityDetailView — wraps the back-button-header pattern used by the
 * access-point / client detail views and dispatches to the corresponding
 * child component.
 */
export function EntityDetailView({ kind, entityId, entityName, onBack }: EntityDetailViewProps) {
  const copy = COPY[kind];

  const body =
    kind === 'access-point' ? (
      <AccessPointDetail serialNumber={entityId} />
    ) : (
      <ClientDetail macAddress={entityId} />
    );

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
