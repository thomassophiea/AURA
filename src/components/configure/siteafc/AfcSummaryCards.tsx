/**
 * The three AFC summary cards from the controller's Site → Access Points → AFC
 * header (GEO LOCATION / AFC STATUS / SP RADIO OPERATIONAL STATUS). Values are
 * config-derived tallies; the controller's live donuts (Available/Reduced,
 * Expire date, Subgraph) are runtime telemetry NOT exposed by the config API,
 * so each card carries an honest "runtime — not exposed" footnote instead of a
 * fabricated live state.
 */
import React from 'react';
import { MapPin, ShieldCheck, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '../../ui/card';
import type { AfcSummary } from './siteAfcModel';

interface CardStat {
  label: string;
  value: string;
}

function SummaryCard({
  icon: Icon,
  title,
  headline,
  stats,
  note,
}: {
  icon: LucideIcon;
  title: string;
  headline: string;
  stats: CardStat[];
  note: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </h3>
        </div>
        <p className="text-2xl font-semibold">{headline}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">{s.label}</dt>
              <dd className="font-medium tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[11px] leading-snug text-muted-foreground/80">{note}</p>
      </CardContent>
    </Card>
  );
}

const RUNTIME_NOTE = 'runtime status not exposed by controller config API';

export function AfcSummaryCards({ summary }: { summary: AfcSummary }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <SummaryCard
        icon={MapPin}
        title="Geo Location"
        headline={`${summary.apsWithGeo}/${summary.totalAps} located`}
        stats={[
          { label: 'Anchor APs', value: String(summary.anchorAps) },
          { label: 'AP Ranging', value: summary.apRanging ? 'Enabled' : 'Disabled' },
        ]}
        note={`Last location update / subgraph completeness — ${RUNTIME_NOTE}.`}
      />
      <SummaryCard
        icon={ShieldCheck}
        title="AFC Status"
        headline={`${summary.spEligibleRadios} SP eligible`}
        stats={[
          { label: 'AFC radios', value: String(summary.afcRadios) },
          { label: 'Total APs', value: String(summary.totalAps) },
        ]}
        note={`AFC availability & expiry are ${RUNTIME_NOTE}; shown value is config eligibility.`}
      />
      <SummaryCard
        icon={Zap}
        title="SP Radio Operational Status"
        headline={`${summary.spRadios} SP radios`}
        stats={[
          { label: 'Power capped', value: String(summary.cappedRadios) },
          { label: 'AFC radios', value: String(summary.afcRadios) },
        ]}
        note={`Live operational up/down state is ${RUNTIME_NOTE}.`}
      />
    </div>
  );
}
