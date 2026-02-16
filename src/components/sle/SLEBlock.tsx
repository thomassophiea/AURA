/**
 * SLE Block - Full-bleed gradient card displaying one SLE metric
 * Mist-style: status-colored gradient background, white text, immersive design
 */

import { useState } from 'react';
import { Badge } from '../ui/badge';
import { ChevronDown, ChevronUp, Wifi, Signal, Radio, Shield, Clock, Activity, Target } from 'lucide-react';
import { SLEScoreGauge } from './SLEScoreGauge';
import { SLETimeline } from './SLETimeline';
import { SLEClassifierTree } from './SLEClassifierTree';
import { SLERootCausePanel } from './SLERootCausePanel';
import type { SLEMetric, SLEClassifier, SLERootCause } from '../../types/sle';

// Status-based gradient backgrounds (left-to-right, like Mist)
const STATUS_GRADIENTS = {
  good: 'linear-gradient(135deg, #1a3a2a 0%, #0f2b1f 30%, #162420 100%)',
  warn: 'linear-gradient(135deg, #3a2a0a 0%, #2b1f0a 30%, #242016 100%)',
  poor: 'linear-gradient(135deg, #3a1a1a 0%, #2b0f0f 30%, #241616 100%)',
} as const;

// Border glow based on status
const STATUS_BORDER = {
  good: '1px solid rgba(34, 197, 94, 0.25)',
  warn: '1px solid rgba(245, 158, 11, 0.25)',
  poor: '1px solid rgba(239, 68, 68, 0.25)',
} as const;

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
  const activeClassifiers = sle.classifiers.filter(c => c.affectedClients > 0);

  return (
    <>
      <div
        className="rounded-xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:scale-[1.01] group"
        style={{
          background: STATUS_GRADIENTS[sle.status],
          border: STATUS_BORDER[sle.status],
          minHeight: '260px',
        }}
      >
        {/* Header: Icon + Name + Score gauge */}
        <div className="flex items-start justify-between p-5 pb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="p-1.5 rounded-lg bg-white/10">
                <Icon className="h-4 w-4 text-white/70" />
              </div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-white">{sle.name}</h3>
            </div>
            <p className="text-[11px] text-white/50 ml-9">{sle.description}</p>

            {/* Client/AP count badges */}
            <div className="flex items-center gap-2 mt-3 ml-9">
              <span className="text-[10px] font-medium text-white/80 bg-white/10 px-2.5 py-0.5 rounded-full">
                {sle.totalUserMinutes} {sle.id === 'ap_health' ? 'APs' : 'clients'}
              </span>
              {sle.affectedUserMinutes > 0 && (
                <span className="text-[10px] font-medium text-red-200 bg-red-500/30 px-2.5 py-0.5 rounded-full">
                  {sle.affectedUserMinutes} affected
                </span>
              )}
            </div>
          </div>

          {/* Score gauge */}
          <SLEScoreGauge value={sle.successRate} status={sle.status} size={72} />
        </div>

        {/* Timeline chart - centered, subtle */}
        <div className="px-5 flex-1">
          <SLETimeline data={sle.timeSeries} status={sle.status} height={70} id={sle.id} />
        </div>

        {/* Classifiers toggle - bottom of card */}
        <div className="px-5 pb-4 pt-1">
          <button
            onClick={() => setShowClassifiers(!showClassifiers)}
            className="flex items-center gap-1.5 w-full py-1.5 text-xs text-white/60 hover:text-white/90 transition-colors"
          >
            {showClassifiers ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span className="font-medium">Classifiers</span>
            {activeClassifiers.length > 0 && (
              <span className="text-[10px] font-medium text-white/80 bg-white/15 px-2 py-0.5 rounded-full ml-1">
                {activeClassifiers.length} active
              </span>
            )}
          </button>

          {/* Classifier tree (expands below) */}
          {showClassifiers && (
            <div className="mt-2 pt-2 border-t border-white/10">
              <SLEClassifierTree
                classifiers={sle.classifiers}
                onClassifierClick={(c) => {
                  setRootCause(buildRootCause(c, sle, stations, aps));
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Root Cause Panel */}
      <SLERootCausePanel
        open={rootCause !== null}
        onClose={() => setRootCause(null)}
        rootCause={rootCause}
      />
    </>
  );
}
