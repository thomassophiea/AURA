/**
 * In-memory alert store with deduplication, auto-resolve, and pruning.
 */

const MAX_ACTIVE_ALERTS = 500;
const RESOLVED_RETENTION_MS = 30 * 60 * 1000; // 30 minutes

export class AlertStore {
  #alerts = new Map(); // id -> alert object
  #pruneTimer = null;

  constructor() {
    this.#pruneTimer = setInterval(() => this.#pruneResolved(), 60_000);
  }

  /**
   * Upsert an alert. If an alert with the same id exists, bump occurrences + lastSeenAt.
   * If it was previously resolved, reopen it.
   */
  upsert({ id, severity, checkName, message, target, context }) {
    const now = new Date().toISOString();
    const existing = this.#alerts.get(id);

    if (existing) {
      existing.severity = severity;
      existing.message = message;
      existing.context = context;
      existing.lastSeenAt = now;
      existing.occurrences += 1;
      if (existing.resolvedAt) {
        existing.resolvedAt = null; // reopen
      }
      return existing;
    }

    // Enforce hard cap
    const activeCount = this.getActive().length;
    if (activeCount >= MAX_ACTIVE_ALERTS) return null;

    const alert = {
      id,
      severity,
      checkName,
      message,
      target,
      context: context ?? {},
      firstSeenAt: now,
      lastSeenAt: now,
      resolvedAt: null,
      occurrences: 1,
    };
    this.#alerts.set(id, alert);
    return alert;
  }

  /**
   * Auto-resolve alerts that were NOT seen in the current poll cycle.
   * Call after a check completes with the set of alert IDs it produced.
   */
  resolveAbsent(checkName, activeIds) {
    const now = new Date().toISOString();
    for (const alert of this.#alerts.values()) {
      if (alert.checkName === checkName && !alert.resolvedAt && !activeIds.has(alert.id)) {
        alert.resolvedAt = now;
      }
    }
  }

  getActive() {
    return [...this.#alerts.values()].filter((a) => !a.resolvedAt);
  }

  getAll() {
    return [...this.#alerts.values()];
  }

  getByCheck(checkName) {
    return [...this.#alerts.values()].filter((a) => a.checkName === checkName && !a.resolvedAt);
  }

  getBySeverity(severity) {
    return [...this.#alerts.values()].filter((a) => a.severity === severity && !a.resolvedAt);
  }

  clear() {
    this.#alerts.clear();
  }

  get size() {
    return this.#alerts.size;
  }

  #pruneResolved() {
    const cutoff = Date.now() - RESOLVED_RETENTION_MS;
    for (const [id, alert] of this.#alerts) {
      if (alert.resolvedAt && new Date(alert.resolvedAt).getTime() < cutoff) {
        this.#alerts.delete(id);
      }
    }
  }

  destroy() {
    if (this.#pruneTimer) {
      clearInterval(this.#pruneTimer);
      this.#pruneTimer = null;
    }
  }
}
