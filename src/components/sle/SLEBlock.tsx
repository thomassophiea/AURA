/**
 * SLE Block - Core reusable card displaying one SLE metric
 * Inspired by Mist SLE block layout: score on left, timeline in center, classifiers below
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { ChevronDown, ChevronUp, Wifi, Signal, Radio, Zap, Shield, Clock, Activity, Target } from 'lucide-react';
import { SLEScoreGauge } from './SLEScoreGauge';
import { SLETimeline } from './SLETimeline';
import { SLEClassifierTree } from './SLEClassifierTree';
import { SLERootCausePanel } from './SLERootCausePanel';
import type { SLEMetric, SLEClassifier, SLERootCause } from '../../types/sle';
import { SLE_STATUS_COLORS } from '../../types/sle';

const SLE_ICONS: Record<string, React.ElementType> = {
  coverage: Signal,
  throughput: Activity,
  ap_health: Wifi,
  capacity: Target,
  successful_connects: Shield,
  time_to_connect: Clock,
  roaming: Radio,
};

interface SLEBlockProps {
  sle: SLEMetric;
  stations?: any[];
  aps?: any[];
}

function buildRootCause(classifier: SLEClassifier, sle: SLEMetric, stations: any[], aps: any[]): SLERootCause {
  // Build affected devices list based on classifier type
  let affectedDevices: SLERootCause['affectedDevices'] = [];
  let affectedAPs: SLERootCause['affectedAPs'] = [];
  let recommendations: string[] = [];

  if (sle.id === 'coverage' && classifier.id === 'weak_signal') {
    affectedDevices = stations
      .filter(s => (s.rssi ?? s.rss ?? 0) < -70)
      .slice(0, 30)
      .map(s => ({
        mac: s.macAddress || '',
        name: s.hostName || s.hostname || '',
        ap: s.apName || s.apSerial || '',
        rssi: s.rssi ?? s.rss,
      }));
    recommendations = [
      'Consider adding additional access points to improve coverage in affected areas',
      'Verify AP transmit power settings are appropriate',
      'Check for physical obstructions between APs and client locations',
    ];
  } else if (sle.id === 'ap_health' && classifier.id === 'ap_disconnected') {
    affectedAPs = aps
      .filter(ap => {
        const status = (ap.status || ap.connectionState || '').toLowerCase();
        return status.includes('disconnect') || status.includes('offline');
      })
      .slice(0, 20)
      .map(ap => ({
        serial: ap.serialNumber || '',
        name: ap.name || ap.hostname || ap.serialNumber || '',
        status: ap.status || ap.connectionState || 'offline',
      }));
    recommendations = [
      'Check network connectivity to disconnected access points',
      'Verify PoE power delivery to affected APs',
      'Review switch port status for AP uplinks',
    ];
  } else {
    // Generic affected devices
    affectedDevices = stations
      .slice(0, 10)
      .map(s => ({
        mac: s.macAddress || '',
        name: s.hostName || s.hostname || '',
        ap: s.apName || s.apSerial || '',
      }));
    recommendations = [
      'Monitor this classifier for trends over time',
      'Review network configuration for the affected segment',
    ];
  }

  return {
    classifierId: classifier.id,
    classifierName: classifier.name,
    description: `${classifier.affectedClients} ${sle.id === 'ap_health' ? 'access points' : 'clients'} affected by ${classifier.name.toLowerCase()} issues`,
    affectedDevices,
    affectedAPs,
    recommendations,
  };
}

export function SLEBlock({ sle, stations = [], aps = [] }: SLEBlockProps) {
  const [showClassifiers, setShowClassifiers] = useState(false);
  const [rootCause, setRootCause] = useState<SLERootCause | null>(null);

  const Icon = SLE_ICONS[sle.id] || Target;
  const statusColors = SLE_STATUS_COLORS[sle.status];
  const activeClassifiers = sle.classifiers.filter(c => c.affectedClients > 0);

  return (
    <>
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-card to-card/50 hover:shadow-xl transition-all duration-300 group">
        <div className={`absolute inset-0 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity`} style={{ background: `linear-gradient(135deg, ${statusColors.hex}, transparent)` }} />

        <CardHeader className="pb-2 relative">
          <div className="flex items-center justify-between">
            {/* Left: Icon + Name */}
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg shadow-sm" style={{ background: `linear-gradient(135deg, ${statusColors.hex}22, ${statusColors.hex}44)` }}>
                <Icon className="h-4 w-4" style={{ color: statusColors.hex }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide">{sle.name}</h3>
                <p className="text-[10px] text-muted-foreground">{sle.description}</p>
              </div>
            </div>

            {/* Right: Score */}
            <SLEScoreGauge value={sle.successRate} status={sle.status} size={64} />
          </div>

          {/* User Minutes badge */}
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-[10px]">
              {sle.totalUserMinutes} {sle.id === 'ap_health' ? 'APs' : 'clients'}
            </Badge>
            {sle.affectedUserMinutes > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {sle.affectedUserMinutes} affected
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="relative pt-0">
          {/* Timeline chart */}
          <SLETimeline data={sle.timeSeries} status={sle.status} height={60} />

          {/* Classifiers toggle */}
          <button
            onClick={() => setShowClassifiers(!showClassifiers)}
            className="flex items-center gap-1 w-full mt-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showClassifiers ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span className="font-medium">Classifiers</span>
            {activeClassifiers.length > 0 && (
              <Badge variant="secondary" className="text-[10px] ml-1">{activeClassifiers.length} active</Badge>
            )}
          </button>

          {/* Classifier tree */}
          {showClassifiers && (
            <div className="mt-1 border-t border-border/50 pt-2">
              <SLEClassifierTree
                classifiers={sle.classifiers}
                onClassifierClick={(c) => {
                  setRootCause(buildRootCause(c, sle, stations, aps));
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Root Cause Panel */}
      <SLERootCausePanel
        open={rootCause !== null}
        onClose={() => setRootCause(null)}
        rootCause={rootCause}
      />
    </>
  );
}
