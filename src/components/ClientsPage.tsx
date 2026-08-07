import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Users, UserPlus } from 'lucide-react';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { TrafficStatsConnectedClients } from './TrafficStatsConnectedClients';
import { GuestUsers } from './clients/GuestUsers';

interface ClientsPageProps {
  onShowDetail?: (macAddress: string, hostName?: string) => void;
}

/**
 * The Clients area: everything that was here, plus guest management.
 *
 * A shell rather than a rewrite — the existing clients view is mounted
 * unchanged, so nothing about it moves. Guest Users is a sibling because it
 * answers a different question about a different population: not "what is on
 * my network" but "who am I letting on it".
 *
 * The guest tab is wrapped in its own error boundary: it depends on a second
 * service, and a failure there must not take the clients table down with it.
 */
export function ClientsPage({ onShowDetail }: ClientsPageProps) {
  const [tab, setTab] = useState('clients');

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="clients">
          <Users className="h-4 w-4 mr-2" aria-hidden="true" />
          Clients
        </TabsTrigger>
        <TabsTrigger value="guests">
          <UserPlus className="h-4 w-4 mr-2" aria-hidden="true" />
          Guest Users
        </TabsTrigger>
      </TabsList>

      <TabsContent value="clients" className="space-y-4">
        <TrafficStatsConnectedClients onShowDetail={onShowDetail} />
      </TabsContent>

      <TabsContent value="guests" className="space-y-4">
        <ErrorBoundary fallbackTitle="Guest Users Error">
          <GuestUsers />
        </ErrorBoundary>
      </TabsContent>
    </Tabs>
  );
}

export default ClientsPage;
