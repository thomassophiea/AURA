export class RollbackEngine {
  #snapshots = new Map();

  save(auditId, snapshot) {
    this.#snapshots.set(auditId, { ...snapshot, savedAt: new Date().toISOString() });
  }

  get(auditId) {
    return this.#snapshots.get(auditId) ?? null;
  }

  delete(auditId) {
    this.#snapshots.delete(auditId);
  }

  list() {
    return [...this.#snapshots.entries()].map(([auditId, { savedAt }]) => ({ auditId, savedAt }));
  }
}

export const rollbackEngine = new RollbackEngine();
