import { describe, it, expect, vi } from 'vitest';
import { createGatewayRegistry, GatewayNotFoundError } from './gatewayRegistry.js';

const norm = (u) =>
  String(u)
    .replace(/\/+$/, '')
    .replace(/\/management$/, '');
const SOURCES = [
  { id: 's-default', baseUrl: 'https://gw-a.example:443', displayName: 'Lab A' },
  { id: 's-b', baseUrl: 'https://gw-b.example', displayName: 'Boston' },
  { id: 's-c', baseUrl: 'https://gw-c.example', displayName: 'Chicago' },
];

function make(allow) {
  const resolveDefault = vi.fn(async () => ({
    controllerUrl: 'https://gw-a.example:443',
    session: { name: 'default' },
  }));
  const openSession = vi.fn(async (source) => ({
    controllerUrl: source.baseUrl,
    session: { name: source.id },
  }));
  const reg = createGatewayRegistry({
    resolveDefault,
    defaultUrl: 'https://gw-a.example:443',
    listSources: async () => SOURCES,
    getCredentials: async (id) => (id === 's-c' ? null : { username: 'u', password: 'p' }),
    openSession,
    normalizeBaseUrl: norm,
    allow,
  });
  return { reg, resolveDefault, openSession };
}

describe('gatewayRegistry', () => {
  it('exposes only the default Gateway unless MCP_GATEWAYS opts others in', async () => {
    const { reg } = make(undefined);
    expect((await reg.list()).map((g) => g.id)).toEqual(['s-default']);
    const all = make('*');
    expect((await all.reg.list()).map((g) => g.id)).toEqual(['s-default', 's-b', 's-c']);
    const some = make('boston');
    expect((await some.reg.list()).map((g) => g.id)).toEqual(['s-default', 's-b']);
  });

  it('resolves by name, host or id, and the default without a selector', async () => {
    const { reg, resolveDefault, openSession } = make('*');
    expect((await reg.resolve()).gateway.name).toBe('Lab A');
    expect(resolveDefault).toHaveBeenCalledTimes(1);
    expect((await reg.resolve('Boston')).session.name).toBe('s-b');
    expect((await reg.resolve('gw-b.example')).session.name).toBe('s-b');
    expect((await reg.resolve('s-b')).gateway.id).toBe('s-b');
    expect(openSession).toHaveBeenCalledTimes(3);
  });

  it('refuses an unregistered selector and never connects to it', async () => {
    const { reg, openSession } = make('*');
    await expect(reg.resolve('https://evil.example')).rejects.toBeInstanceOf(GatewayNotFoundError);
    expect(openSession).not.toHaveBeenCalled();
  });

  it('refuses a Gateway that is registered but not opted in', async () => {
    const { reg } = make(undefined);
    await expect(reg.resolve('Boston')).rejects.toBeInstanceOf(GatewayNotFoundError);
  });

  it('reports missing credentials as an error, not a crash', async () => {
    const { reg } = make('*');
    await expect(reg.resolve('Chicago')).rejects.toThrow(/no stored credentials/);
  });

  it('falls back to the default Gateway when the source registry is unreadable', async () => {
    const reg = createGatewayRegistry({
      resolveDefault: async () => ({ controllerUrl: 'x', session: {} }),
      defaultUrl: 'https://gw-a.example',
      listSources: async () => {
        throw new Error('db down');
      },
      normalizeBaseUrl: norm,
    });
    const list = await reg.list();
    expect(list).toHaveLength(1);
    expect(list[0].isDefault).toBe(true);
  });
});

describe('gatewayRegistry naming', () => {
  it('names the seeded default source by its host, not its env-variable label', async () => {
    const reg = createGatewayRegistry({
      resolveDefault: async () => null,
      defaultUrl: 'https://tsophiea.example:443',
      listSources: async () => [
        {
          id: 'd',
          baseUrl: 'https://tsophiea.example:443',
          displayName: 'Default controller (CAMPUS_CONTROLLER_URL)',
        },
      ],
      normalizeBaseUrl: (u) => String(u).replace(/\/+$/, ''),
    });
    expect((await reg.list())[0].name).toBe('tsophiea.example');
  });
});
