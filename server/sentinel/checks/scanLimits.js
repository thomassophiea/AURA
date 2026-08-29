/**
 * Shared scan cap for sentinel checks that do per-AP controller work
 * (LLDP fetch per AP, per-AP state iteration, etc.).
 *
 * Target customers run fleets up to ~100,000 APs. A sentinel check that walks
 * every AP on every poll cycle does not degrade gracefully at that scale — it
 * either opens tens of thousands of controller requests (vlanTrunkCheck's
 * per-AP LLDP fetch) or iterates a response payload two orders of magnitude
 * larger than any check was designed against (apStatusCheck). Both cost real
 * wall-clock time and controller load on every poll, for every tenant.
 *
 * Rather than let a large fleet make a check silently slow or time out, each
 * check bounds its per-AP work to this cap and reports the fact honestly via
 * evidence (`sampled`, `scannedCount`, `totalCount`) instead of quietly
 * scanning a subset while claiming fleet-wide coverage. 500 is generous
 * headroom over any lab/demo estate while staying well under the point where
 * a poll cycle would stall a shared sentinel worker.
 */
export const SENTINEL_MAX_APS_SCANNED = 500;
