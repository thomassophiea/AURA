/**
 * System Health / Diagnostics engine — pure, framework-free. Mirrors the
 * Extreme controller's Tools → Diagnostics "System Health" (CONFIGURATION +
 * OPERATIONAL) and "Network Health" panels by COMPUTING each check from live
 * config data. There is NO health REST endpoint on the controller (every
 * candidate 404s), so every status here is derived from real records; nothing
 * is fabricated. Checks that require runtime telemetry not present in the
 * config API are emitted with `runtime: true` and a note instead of a fake
 * pass/fail.
 *
 * Schema source of truth: audit/SYSTEM_HEALTH_DIAGNOSTICS_FINDINGS.md and
 * audit/SITE_AFC_GEO_FINDINGS.md.
 */
import type { AaaPolicy, AaaRadiusServer, ApDetail, ApProfile } from '../../types/configure';
import { apBandOf } from '../configure/aps/apHelpers';

export type Severity = 'ok' | 'warn' | 'alert';
export type CheckCategory = 'configuration' | 'operational';

/** One System Health row — mirrors a controller check line. */
export interface HealthCheck {
  id: string;
  title: string;
  severity: Severity;
  category: CheckCategory;
  /** AP / profile names the check fired on (empty when severity is 'ok'). */
  affected: string[];
  detail: string;
  /** True when the true status lives in runtime telemetry not in the config API. */
  runtime?: boolean;
}

/** Minimal AP status row from `/v1/aps/query` (status + identity fields). */
export interface ApStatusRow {
  serialNumber?: string;
  apName?: string;
  status?: string;
}

export interface NetworkHealth {
  totalAps: number;
  activeAps: number;
  inactiveAps: number;
  /** status string -> count, so the UI can show the real breakdown. */
  apStatusBreakdown: Record<string, number>;
  totalSwitches: number;
  activeSwitches: number;
  inactiveSwitches: number;
  troubleSwitches: number;
}

export interface DiagnosticsInput {
  /** Full per-AP config records (`/v1/aps`) — carry radios + override flags. */
  aps: ApDetail[];
  /** Device profiles (`/v3/profiles`). */
  profiles: ApProfile[];
  /** Lightweight status rows (`/v1/aps/query`). */
  apStatus: ApStatusRow[];
  /** Switch records (`/v1/switches`) — [] on controllers with no switches. */
  switches: unknown[];
  /** AAA policies (`/v1/aaapolicy`) — carry the RADIUS server lists. */
  aaaPolicies: AaaPolicy[];
}

export interface DiagnosticsResult {
  checks: HealthCheck[];
  networkHealth: NetworkHealth;
}

/** Standard-Power radio: pwrMode6 mentions SP (SP or SP_WITH_LPI_FALLBACK). */
function isStandardPower(pwrMode6: string | undefined): boolean {
  return (pwrMode6 ?? '').toUpperCase().includes('SP');
}

/** The 6 GHz radio of an AP, if any. */
function radio6(ap: ApDetail) {
  return (ap.radios ?? []).find((r) => apBandOf(r) === 'Band6');
}

const apLabel = (ap: ApDetail): string => ap.apName || ap.serialNumber;

/** AFC power-reduction lower/upper bounds (dBm) per the findings doc. */
export const AFC_POWER_REDUCTION_MIN_DB = 3;
export const AFC_POWER_REDUCTION_MAX_DB = 6;
/** Mesh poll-timeout floor (seconds) — flagged below this value. */
export const MESH_POLL_TIMEOUT_MIN_SEC = 60;

// ── Configuration checks ────────────────────────────────────────────────────

/**
 * Standard-Power APs power-reduced by AFC: a 6 GHz SP radio whose configured
 * Tx power is 3–6 dBm below its max (the AFC ceiling has capped it). alert.
 */
export function checkAfcPowerReduction(aps: ApDetail[]): HealthCheck {
  const affected: string[] = [];
  for (const ap of aps) {
    const r = radio6(ap);
    if (!r || !isStandardPower(r.pwrMode6)) continue;
    const gap = Number(r.txMaxPower ?? 0) - Number(r.txPower ?? 0);
    if (gap >= AFC_POWER_REDUCTION_MIN_DB && gap <= AFC_POWER_REDUCTION_MAX_DB) {
      affected.push(apLabel(ap));
    }
  }
  return {
    id: 'afc-power-reduction',
    title: `Standard-Power APs using ${AFC_POWER_REDUCTION_MIN_DB}–${AFC_POWER_REDUCTION_MAX_DB} dBm less than configured Tx power`,
    severity: affected.length ? 'alert' : 'ok',
    category: 'configuration',
    affected,
    detail: affected.length
      ? `${affected.length} Standard-Power 6 GHz radio(s) are running ${AFC_POWER_REDUCTION_MIN_DB}–${AFC_POWER_REDUCTION_MAX_DB} dBm below their configured maximum — AFC has reduced their power.`
      : 'No Standard-Power 6 GHz radios are being power-reduced by AFC.',
  };
}

/**
 * 6 GHz SP AP using a fixed / manually-assigned fallback channel. warn.
 */
export function checkFallbackChannel(aps: ApDetail[]): HealthCheck {
  const affected: string[] = [];
  for (const ap of aps) {
    const r = radio6(ap);
    if (!r || !isStandardPower(r.pwrMode6)) continue;
    const fb = Array.isArray(r.fallbackChannels) ? r.fallbackChannels : [];
    if (fb.length > 0) affected.push(apLabel(ap));
  }
  return {
    id: 'afc-fallback-channel',
    title: '6 GHz Standard-Power AP using a fixed / manually-assigned fallback channel',
    severity: affected.length ? 'warn' : 'ok',
    category: 'configuration',
    affected,
    detail: affected.length
      ? `${affected.length} Standard-Power AP(s) have a manually-assigned 6 GHz fallback channel; a fixed fallback can conflict with AFC channel availability.`
      : 'No Standard-Power APs use a fixed 6 GHz fallback channel.',
  };
}

/** AP-level and radio-level `*Ovr === true` flags mark a config override. */
function hasOverride(ap: ApDetail): boolean {
  const record = ap as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (key.endsWith('Ovr') && value === true) return true;
  }
  for (const r of ap.radios ?? []) {
    const rr = r as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(rr)) {
      if (key.endsWith('Ovr') && value === true) return true;
    }
  }
  return false;
}

/** AP has configuration overrides (any `*Ovr` flag set). warn. */
export function checkConfigOverrides(aps: ApDetail[]): HealthCheck {
  const affected = aps.filter(hasOverride).map(apLabel);
  return {
    id: 'config-overrides',
    title: 'AP has configuration overrides',
    severity: affected.length ? 'warn' : 'ok',
    category: 'configuration',
    affected,
    detail: affected.length
      ? `${affected.length} AP(s) override profile-inherited settings; overrides drift from the profile and are easy to lose track of.`
      : 'No APs override their profile configuration.',
  };
}

/**
 * APs not running the recommended (fleet-modal) software version. The
 * recommended version is the most common softwareVersion across the fleet
 * (ties broken by the lexicographically greatest, i.e. newest, string). warn.
 */
export function checkRecommendedVersion(aps: ApDetail[]): HealthCheck {
  const withVersion = aps.filter((ap) => ap.softwareVersion);
  const counts = new Map<string, number>();
  for (const ap of withVersion) {
    counts.set(ap.softwareVersion, (counts.get(ap.softwareVersion) ?? 0) + 1);
  }
  let recommended = '';
  let best = -1;
  for (const [version, count] of counts) {
    if (count > best || (count === best && version > recommended)) {
      best = count;
      recommended = version;
    }
  }
  const affected = withVersion
    .filter((ap) => ap.softwareVersion !== recommended)
    .map(apLabel);
  return {
    id: 'recommended-version',
    title: 'APs not running the recommended version image',
    severity: affected.length ? 'warn' : 'ok',
    category: 'configuration',
    affected,
    detail: recommended
      ? affected.length
        ? `${affected.length} AP(s) are not on the fleet's recommended image (${recommended}).`
        : `All APs are running the recommended image (${recommended}).`
      : 'No AP software version information available.',
  };
}

/** Mesh AP = has at least one meshpoint binding. */
function isMeshAp(ap: ApDetail): boolean {
  return Array.isArray(ap.meshpoints) && ap.meshpoints.length > 0;
}

/** Mesh APs whose poll timeout is below the recommended floor. alert. */
export function checkMeshPollTimeout(aps: ApDetail[]): HealthCheck {
  const meshAps = aps.filter(isMeshAp);
  const affected = meshAps
    .filter((ap) => Number(ap.pollTimeout ?? 0) > 0 && Number(ap.pollTimeout) < MESH_POLL_TIMEOUT_MIN_SEC)
    .map(apLabel);
  return {
    id: 'mesh-poll-timeout',
    title: 'Mesh APs poll timeout is too low',
    severity: affected.length ? 'alert' : 'ok',
    category: 'configuration',
    affected,
    detail: meshAps.length
      ? affected.length
        ? `${affected.length} mesh AP(s) have a poll timeout below ${MESH_POLL_TIMEOUT_MIN_SEC}s; a low timeout can drop mesh links during transient loss.`
        : `All ${meshAps.length} mesh AP(s) have an acceptable poll timeout.`
      : 'No mesh APs configured.',
  };
}

/** Mesh Root point configured to use a dynamic (SmartRF) RF policy. warn. */
export function checkMeshRootDynamicRf(aps: ApDetail[]): HealthCheck {
  const affected: string[] = [];
  for (const ap of aps) {
    const meshpoints = Array.isArray(ap.meshpoints) ? ap.meshpoints : [];
    const isRoot = meshpoints.some((m) => (m as { meshRoot?: boolean }).meshRoot === true);
    if (!isRoot) continue;
    const dynamicRf = (ap.radios ?? []).some((r) => r.useSmartRf === true);
    if (dynamicRf) affected.push(apLabel(ap));
  }
  return {
    id: 'mesh-root-dynamic-rf',
    title: 'Mesh Root point configured to use dynamic RF management policy',
    severity: affected.length ? 'warn' : 'ok',
    category: 'configuration',
    affected,
    detail: affected.length
      ? `${affected.length} mesh root AP(s) use dynamic (SmartRF) channel/power; a mesh root should normally run a fixed RF plan.`
      : 'No mesh root APs use a dynamic RF management policy.',
  };
}

/** Profiles with Enforce Manufacturing Certificate (Extreme PKI) disabled. warn. */
export function checkEnforcePki(profiles: ApProfile[]): HealthCheck {
  const affected = profiles
    .filter((p) => p.enforcePkiAuth === false)
    .map((p) => p.name || p.id);
  return {
    id: 'enforce-pki',
    title: 'Enforce Manufacturing Certificate disabled (Extreme PKI)',
    severity: affected.length ? 'warn' : 'ok',
    category: 'configuration',
    affected,
    detail: affected.length
      ? `${affected.length} profile(s) do not enforce the Extreme manufacturing certificate; disabling PKI auth weakens AP adoption trust.`
      : 'All profiles enforce the Extreme manufacturing certificate.',
  };
}

/**
 * Multicast access fully open — the controller derives this from multicast
 * filter posture on services/roles, which is not exposed by the config
 * endpoints probed. Emitted as a runtime-not-in-API row rather than a fake pass.
 */
export function checkMulticastOpen(): HealthCheck {
  return {
    id: 'multicast-open',
    title: 'Multicast access fully open',
    severity: 'ok',
    category: 'configuration',
    affected: [],
    detail:
      'Multicast filter posture is not exposed by the controller config API probed; verify multicast filtering on the controller directly.',
    runtime: true,
  };
}

// ── Operational (runtime) checks ────────────────────────────────────────────

/** Backup schedule is runtime state not present in the config API. */
export function checkBackupSchedule(): HealthCheck {
  return {
    id: 'backup-schedule',
    title: 'Backup of system configuration has not been scheduled',
    severity: 'ok',
    category: 'operational',
    affected: [],
    detail:
      'The backup schedule is runtime state and is not exposed by the controller config API; confirm the backup schedule on the controller directly.',
    runtime: true,
  };
}

/** Controller synchronization / mobility / availability — runtime telemetry. */
export function checkClusterStatus(): HealthCheck {
  return {
    id: 'cluster-status',
    title: 'Synchronization / Mobility / Availability status',
    severity: 'ok',
    category: 'operational',
    affected: [],
    detail:
      'Synchronization, mobility and availability are live status not exposed by the controller config API.',
    runtime: true,
  };
}

// ── Network Health ──────────────────────────────────────────────────────────

/** An AP counts as active when its query status is InService. */
export function buildNetworkHealth(apStatus: ApStatusRow[], switches: unknown[]): NetworkHealth {
  const breakdown: Record<string, number> = {};
  let active = 0;
  for (const row of apStatus) {
    const status = (row.status ?? 'Unknown').trim() || 'Unknown';
    breakdown[status] = (breakdown[status] ?? 0) + 1;
    if (status === 'InService') active += 1;
  }
  const totalAps = apStatus.length;

  const list = Array.isArray(switches) ? switches : [];
  let activeSwitches = 0;
  let troubleSwitches = 0;
  for (const raw of list) {
    const status = String((raw as { status?: unknown })?.status ?? '').trim();
    if (status === 'InService') activeSwitches += 1;
    else if (status) troubleSwitches += 1;
  }
  return {
    totalAps,
    activeAps: active,
    inactiveAps: totalAps - active,
    apStatusBreakdown: breakdown,
    totalSwitches: list.length,
    activeSwitches,
    inactiveSwitches: list.length - activeSwitches - troubleSwitches,
    troubleSwitches,
  };
}

// ── RADIUS servers ──────────────────────────────────────────────────────────

export interface RadiusServerRow {
  policyName: string;
  role: 'Authentication' | 'Accounting';
  ipAddress: string;
  port: number;
  serverType: string;
  timeout: number;
  totalRetries: number;
}

/** Flatten every AAA policy's auth + accounting RADIUS servers into rows. */
export function collectRadiusServers(policies: AaaPolicy[]): RadiusServerRow[] {
  const rows: RadiusServerRow[] = [];
  const push = (policy: AaaPolicy, role: RadiusServerRow['role'], servers: AaaRadiusServer[] | undefined) => {
    for (const s of servers ?? []) {
      rows.push({
        policyName: policy.name || policy.id,
        role,
        ipAddress: s.ipAddress,
        port: s.port,
        serverType: s.serverType,
        timeout: s.timeout,
        totalRetries: s.totalRetries,
      });
    }
  };
  for (const policy of policies) {
    push(policy, 'Authentication', policy.authenticationRadiusServers);
    push(policy, 'Accounting', policy.accountingRadiusServers);
  }
  return rows;
}

// ── Top-level ───────────────────────────────────────────────────────────────

/** Severity ranking for sorting (alert first). */
const SEVERITY_RANK: Record<Severity, number> = { alert: 0, warn: 1, ok: 2 };

/** Run every check and roll up Network Health. Pure — no I/O. */
export function runDiagnostics(input: DiagnosticsInput): DiagnosticsResult {
  const { aps, profiles, apStatus, switches } = input;
  const checks: HealthCheck[] = [
    checkAfcPowerReduction(aps),
    checkFallbackChannel(aps),
    checkConfigOverrides(aps),
    checkRecommendedVersion(aps),
    checkMeshPollTimeout(aps),
    checkMeshRootDynamicRf(aps),
    checkEnforcePki(profiles),
    checkMulticastOpen(),
    checkBackupSchedule(),
    checkClusterStatus(),
  ];
  return {
    checks,
    networkHealth: buildNetworkHealth(apStatus, switches),
  };
}

/** Checks for one category, real (severity) issues first, runtime rows last. */
export function checksByCategory(checks: HealthCheck[], category: CheckCategory): HealthCheck[] {
  return checks
    .filter((c) => c.category === category)
    .sort((a, b) => {
      if (Boolean(a.runtime) !== Boolean(b.runtime)) return a.runtime ? 1 : -1;
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    });
}

/** Worst non-runtime severity across the check set (for the header rollup). */
export function overallSeverity(checks: HealthCheck[]): Severity {
  let worst: Severity = 'ok';
  for (const c of checks) {
    if (c.runtime) continue;
    if (c.severity === 'alert') return 'alert';
    if (c.severity === 'warn') worst = 'warn';
  }
  return worst;
}
