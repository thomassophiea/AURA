/**
 * Site → Access Points tab, with the controller's three sub-views:
 * GENERAL (AP inventory) · AFC · GEO DIAGNOSTICS. The AP records are loaded
 * once by the parent page (union of every device group's apSerialNumbers, read
 * from /v1/aps/{serial}) and shared across the sub-views.
 */
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import { BandBadge } from '../../wifi7/wifi7Viz';
import { ehtBands } from '../../wifi7/wifi7Model';
import type { ApDetail } from '../../../types/configure';
import { SiteAfcTab } from './SiteAfcTab';
import { SiteGeoDiagnosticsTab } from './SiteGeoDiagnosticsTab';

export interface SiteAccessPointsTabProps {
  aps: ApDetail[];
  apRanging: boolean;
  loading: boolean;
}

function ApGeneralGrid({ aps, loading }: { aps: ApDetail[]; loading: boolean }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Serial</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>IP Address</TableHead>
            <TableHead>Floor</TableHead>
            <TableHead>Wi-Fi 7 Bands</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {aps.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                {loading ? 'Loading access points…' : 'No access points in this site.'}
              </TableCell>
            </TableRow>
          ) : (
            aps.map((ap) => {
              const bands = ehtBands(ap.radios ?? []);
              return (
                <TableRow key={ap.serialNumber}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {ap.apName || ap.serialNumber}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {ap.serialNumber}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {ap.hardwareType || '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {ap.ipAddress || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {ap.ftm?.zSubelement?.floorNumber ?? '—'}
                  </TableCell>
                  <TableCell>
                    {bands.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {bands.map((b) => (
                          <BandBadge key={b} band={b} eht />
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function SiteAccessPointsTab({ aps, apRanging, loading }: SiteAccessPointsTabProps) {
  return (
    <Tabs defaultValue="general">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="afc">AFC</TabsTrigger>
        <TabsTrigger value="geo">Geo Diagnostics</TabsTrigger>
      </TabsList>
      <TabsContent value="general" className="pt-4">
        <ApGeneralGrid aps={aps} loading={loading} />
      </TabsContent>
      <TabsContent value="afc" className="pt-4">
        <SiteAfcTab aps={aps} apRanging={apRanging} loading={loading} />
      </TabsContent>
      <TabsContent value="geo" className="pt-4">
        <SiteGeoDiagnosticsTab aps={aps} apRanging={apRanging} loading={loading} />
      </TabsContent>
    </Tabs>
  );
}
