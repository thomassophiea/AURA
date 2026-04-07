/**
 * Type augmentations for non-standard / vendor-prefixed browser APIs.
 * These extend global interfaces so that experimental browser APIs can be
 * accessed without `as any` casts throughout the codebase.
 */

// --- Network Information API ---
interface NetworkInformation {
  effectiveType?: '2g' | '3g' | '4g' | 'slow-2g';
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  type?: string;
}

interface Navigator {
  /** Network Information API (not in all browsers) */
  connection?: NetworkInformation;
  /** Battery API */
  getBattery(): Promise<BatteryManager>;
  /** iOS PWA standalone mode */
  standalone?: boolean;
}

// --- Battery Status API ---
interface BatteryManager extends EventTarget {
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  level: number;
}

// --- Speech Recognition API ---
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

declare let SpeechRecognition: {
  new (): SpeechRecognition;
};

interface Window {
  SpeechRecognition?: typeof SpeechRecognition;
  webkitSpeechRecognition?: typeof SpeechRecognition;
}

// --- IndexedDB databases() ---
interface IDBFactory {
  /** Returns a list of all available databases (not universally supported) */
  databases(): Promise<{ name: string; version: number }[]>;
}
