/**
 * Air Defense (ADSP) wire adapter (audit gap 6.3). Editor model
 * `servers[] {addr, port}` <-> API `svrAddr[]`. Reads both "host[:port]"
 * strings and {addr,port} objects; writes "host" / "host:port" (port omitted
 * when 443, matching the controller's list rendering). Pure — no view/service
 * imports, so it is safe to unit-test in isolation.
 */
export interface AdspServer {
  addr: string;
  port: number;
}

export function parseServers(svrAddr: unknown): AdspServer[] {
  const list = Array.isArray(svrAddr) ? svrAddr : [];
  return list.map((e) => {
    if (e && typeof e === 'object') {
      const obj = e as { addr?: string; port?: number };
      return { addr: String(obj.addr ?? ''), port: obj.port ?? 443 };
    }
    const s = String(e);
    const i = s.lastIndexOf(':');
    return i > 0
      ? { addr: s.slice(0, i), port: Number(s.slice(i + 1)) || 443 }
      : { addr: s, port: 443 };
  });
}

export const toSvrAddr = (servers: AdspServer[]): string[] =>
  servers.map((s) => (s.port === 443 ? s.addr : `${s.addr}:${s.port}`));
