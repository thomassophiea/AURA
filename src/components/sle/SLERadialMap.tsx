/**
 * SLE Radial Map - Hub-spoke mind-map layout for SLE metrics
 * Center: overall score. Ring: SLE nodes. Click to expand detail panel.
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { Wifi, Signal, Radio, Shield, Clock, Activity, Target } from 'lucide-react';
import { SLESankeyFlow } from './SLESankeyFlow';
import { SLERootCausePanel } from './SLERootCausePanel';
import { SLE_STATUS_COLORS, getSLEStatus } from '../../types/sle';
import type { SLEMetric, SLEClassifier, SLERootCause } from '../../types/sle';

const SLE_ICONS: Record<string, React.ElementType> = {
  coverage: Signal,
  throughput: Activity,
  ap_health: Wifi,
  capacity: Target,
  successful_connects: Shield,
  time_to_connect: Clock,
  roaming: Radio,
};

const STATUS_NODE_BG = {
  good: 'rgba(22, 101, 52, 0.85)',
  warn: 'rgba(133, 77, 14, 0.85)',
  poor: 'rgba(153, 27, 27, 0.85)',
} as const;

const STATUS_NODE_BORDER = {
  good: 'rgba(34, 197, 94, 0.6)',
  warn: 'rgba(245, 158, 11, 0.6)',
  poor: 'rgba(239, 68, 68, 0.6)',
} as const;

const STATUS_LINE = {
  good: 'rgba(34, 197, 94, 0.4)',
  warn: 'rgba(245, 158, 11, 0.4)',
  poor: 'rgba(239, 68, 68, 0.4)',
} as const;

const STATUS_DETAIL_BG = {
  good: 'rgba(22, 101, 52, 0.7)',
  warn: 'rgba(133, 77, 14, 0.7)',
  poor: 'rgba(153, 27, 27, 0.7)',
} as const;

/** Resolve the best human-friendly name for a station */
function clientName(s: any): string {
  return s.hostName || s.hostname || s.username || s.deviceType || s.macAddress || 'Unknown';
}

/** Resolve the best human-friendly AP name for a station */
function clientAP(s: any): string {
  return s.apName || s.apDisplayName || s.apHostname || s.accessPointName || s.apSerialNumber || s.apSerial || s.apSn || '-';
}

/** Resolve the best human-friendly AP name from an AP object */
function apName(ap: any): string {
  return ap.name || ap.hostname || ap.apName || ap.displayName || ap.serialNumber || ap.serial || 'Unknown AP';
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
        name: clientName(s),
        ap: clientAP(s),
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
        serial: ap.serialNumber || ap.serial || '',
        name: apName(ap),
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
        name: clientName(s),
        ap: clientAP(s),
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

interface SLERadialMapProps {
  sles: SLEMetric[];
  stations: any[];
  aps: any[];
}

export function SLERadialMap({ sles, stations, aps }: SLERadialMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rootCause, setRootCause] = useState<SLERootCause | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(800);

  const selected = sles.find(s => s.id === selectedId) || null;

  // Overall score
  const overallScore = sles.length > 0
    ? sles.reduce((sum, s) => sum + s.successRate, 0) / sles.length
    : 0;
  const overallStatus = getSLEStatus(overallScore);

  // Responsive: measure container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      setContainerW(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Derived dimensions
  const containerH = Math.max(400, containerW * 0.55);
  const centerX = containerW / 2;
  const centerY = containerH / 2;
  const ringRadius = Math.min(containerW * 0.32, containerH * 0.38);
  const nodeSize = Math.max(70, Math.min(100, containerW * 0.11));
  const hubSize = Math.max(90, Math.min(120, containerW * 0.13));

  // Node positions around the ring
  const nodePositions = useMemo(() => {
    return sles.map((_sle, i) => {
      const angle = (i * 2 * Math.PI / sles.length) - Math.PI / 2;
      return {
        x: centerX + Math.cos(angle) * ringRadius,
        y: centerY + Math.sin(angle) * ringRadius,
      };
    });
  }, [sles.length, centerX, centerY, ringRadius]);

  return (
    <>
      {/* Radial map container */}
      <div
        ref={containerRef}
        className="relative w-full"
        style={{ height: containerH }}
      >
        {/* SVG connection lines */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={containerW}
          height={containerH}
        >
          {sles.map((sle, i) => {
            const pos = nodePositions[i];
            const isSelected = sle.id === selectedId;
            return (
              <line
                key={sle.id}
                x1={centerX}
                y1={centerY}
                x2={pos.x}
                y2={pos.y}
                stroke={isSelected ? SLE_STATUS_COLORS[sle.status].hex : STATUS_LINE[sle.status]}
                strokeWidth={isSelected ? 3 : 1.5}
                strokeDasharray={isSelected ? 'none' : '6 4'}
                className="transition-all duration-300"
              />
            );
          })}
        </svg>

        {/* Center hub */}
        <div
          className="absolute flex flex-col items-center justify-center rounded-full z-10"
          style={{
            width: hubSize,
            height: hubSize,
            left: centerX - hubSize / 2,
            top: centerY - hubSize / 2,
            background: 'radial-gradient(circle, rgba(25,25,35,0.95) 0%, rgba(15,15,25,0.9) 100%)',
            border: `2px solid ${SLE_STATUS_COLORS[overallStatus].hex}80`,
            boxShadow: `0 0 30px rgba(0,0,0,0.5), 0 0 60px ${SLE_STATUS_COLORS[overallStatus].hex}30`,
          }}
        >
          <span
            className="text-xl font-bold"
            style={{ color: SLE_STATUS_COLORS[overallStatus].hex }}
          >
            {overallScore.toFixed(1)}%
          </span>
          <span className="text-[9px] text-white/70 uppercase tracking-widest">Overall</span>
        </div>

        {/* SLE nodes */}
        {sles.map((sle, i) => {
          const pos = nodePositions[i];
          const Icon = SLE_ICONS[sle.id] || Target;
          const isSelected = sle.id === selectedId;
          const activeCount = sle.classifiers.filter(c => c.affectedClients > 0).length;

          return (
            <button
              key={sle.id}
              onClick={() => setSelectedId(isSelected ? null : sle.id)}
              className="absolute flex flex-col items-center justify-center rounded-full transition-all duration-300 z-10 hover:brightness-110"
              style={{
                width: nodeSize,
                height: nodeSize,
                left: pos.x - nodeSize / 2,
                top: pos.y - nodeSize / 2,
                background: STATUS_NODE_BG[sle.status],
                border: `2px solid ${isSelected ? SLE_STATUS_COLORS[sle.status].hex : STATUS_NODE_BORDER[sle.status]}`,
                boxShadow: isSelected
                  ? `0 0 20px ${SLE_STATUS_COLORS[sle.status].hex}50, 0 0 40px ${SLE_STATUS_COLORS[sle.status].hex}25`
                  : '0 4px 16px rgba(0,0,0,0.4)',
                transform: isSelected ? 'scale(1.12)' : 'scale(1)',
              }}
            >
              <Icon className="h-3.5 w-3.5 text-white/90 mb-0.5" />
              <span className="text-sm font-bold text-white leading-none">
                {sle.successRate.toFixed(1)}%
              </span>
              <span className="text-[8px] text-white/80 uppercase tracking-wider leading-tight mt-0.5 max-w-[80%] truncate">
                {sle.name}
              </span>

              {/* Active classifier badge */}
              {activeCount > 0 && (
                <span
                  className="absolute flex items-center justify-center rounded-full text-[8px] font-bold text-white"
                  style={{
                    width: 18,
                    height: 18,
                    bottom: -2,
                    right: -2,
                    background: 'rgba(239, 68, 68, 0.9)',
                    border: '1.5px solid rgba(0,0,0,0.3)',
                  }}
                >
                  {activeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Sankey flow diagram for selected SLE */}
      {selected && (
        <div
          className="rounded-xl overflow-hidden transition-all duration-300"
          style={{
            background: STATUS_DETAIL_BG[selected.status],
            border: `1px solid ${STATUS_NODE_BORDER[selected.status]}`,
          }}
        >
          {/* Compact header */}
          <div className="flex items-center gap-2.5 px-5 pt-4 pb-2">
            <div className="p-1.5 rounded-lg bg-white/15">
              {(() => {
                const Icon = SLE_ICONS[selected.id] || Target;
                return <Icon className="h-4 w-4 text-white/90" />;
              })()}
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-white">
                {selected.name}
              </h3>
              <p className="text-[11px] text-white/60">{selected.description}</p>
            </div>
            <span
              className="ml-auto text-xl font-bold"
              style={{ color: SLE_STATUS_COLORS[selected.status].hex }}
            >
              {selected.successRate.toFixed(1)}%
            </span>
          </div>

          {/* Sankey flow */}
          <div className="px-3 pb-4">
            <SLESankeyFlow
              sle={selected}
              onClassifierClick={(c) => {
                setRootCause(buildRootCause(c, selected, stations, aps));
              }}
            />
          </div>
        </div>
      )}

      {/* Root Cause Panel */}
      <SLERootCausePanel
        open={rootCause !== null}
        onClose={() => setRootCause(null)}
        rootCause={rootCause}
      />
    </>
  );
}
