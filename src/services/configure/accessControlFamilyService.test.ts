/**
 * Access Control family wire adapters: rule-set flattening + name-keyed rule
 * CRUD, and the local-password-repository users adapter (read-modify-write
 * PUT of the owning repo — the wire has no per-user endpoint).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api', () => ({
  apiService: { makeAuthenticatedRequest: vi.fn() },
  getDynamicControllerUrl: () => null,
}));

import { apiService } from '../api';
import {
  acLocalPasswordUsersService,
  acPortalsService,
  acRulesService,
  flattenRuleSets,
  repoUserId,
  toWireUser,
  type AcRule,
  type AcRuleSet,
} from './accessControlFamilyService';

const mockRequest = apiService.makeAuthenticatedRequest as ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  mockRequest.mockReset();
});

const rule = (name: string): AcRule => ({
  name,
  enabled: true,
  enabled_edit: true,
  role: { value: 'Enterprise User', edit: true, invert: null },
});

describe('flattenRuleSets', () => {
  it('flattens {id, reorderable, rules[]} sets in wire order', () => {
    const sets: AcRuleSet[] = [
      { id: 0, reorderable: false, rules: [rule('Blacklist')] },
      { id: 1, reorderable: true, rules: [] },
      { id: 2, reorderable: false, rules: [rule('Unreg A'), rule('Unreg B')] },
    ];
    expect(flattenRuleSets(sets).map((r) => r.name)).toEqual(['Blacklist', 'Unreg A', 'Unreg B']);
  });

  it('tolerates sets whose rules field is missing', () => {
    expect(flattenRuleSets([{ id: 0, reorderable: true } as AcRuleSet])).toEqual([]);
  });
});

describe('acRulesService', () => {
  it('list() GETs the collection and returns the flattened rules', async () => {
    mockRequest.mockResolvedValueOnce(
      jsonResponse([{ id: 0, reorderable: false, rules: [rule('Blacklist')] }])
    );
    const rules = await acRulesService.list();
    expect(mockRequest.mock.calls[0][0]).toBe('/access-control/v1/rules');
    expect(rules.map((r) => r.name)).toEqual(['Blacklist']);
  });

  it('CRUD is keyed by RULE NAME (encoded), not by set id', async () => {
    mockRequest.mockImplementation(() => Promise.resolve(jsonResponse(rule('Guest Rule'))));
    await acRulesService.get('Guest Rule');
    await acRulesService.create(rule('Guest Rule'));
    await acRulesService.update('Guest Rule', rule('Guest Rule'));
    await acRulesService.remove('Guest Rule');
    const calls = mockRequest.mock.calls.map((c) => [c[0], c[1]?.method ?? 'GET']);
    expect(calls).toEqual([
      ['/access-control/v1/rules/Guest%20Rule', 'GET'],
      ['/access-control/v1/rules', 'POST'],
      ['/access-control/v1/rules/Guest%20Rule', 'PUT'],
      ['/access-control/v1/rules/Guest%20Rule', 'DELETE'],
    ]);
  });
});

describe('acPortalsService', () => {
  it('list() GETs /access-control/v1/portals and returns the bare-array rows', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse([{ name: 'Default' }, { name: 'Guest' }]));
    const portals = await acPortalsService.list();
    expect(mockRequest.mock.calls[0][0]).toBe('/access-control/v1/portals');
    expect(portals.map((p) => p.name)).toEqual(['Default', 'Guest']);
  });
});

describe('acLocalPasswordUsersService', () => {
  const repo = {
    name: 'Default',
    users: [
      { username: 'Admin', display_name: 'Admin', enabled: true },
      { username: 'guest', display_name: 'Guest', enabled: false },
    ],
  };

  it('list() flattens repo users and tags each with its repository', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse([{ name: 'Default' }]));
    mockRequest.mockResolvedValueOnce(jsonResponse(repo));
    const users = await acLocalPasswordUsersService.list();
    expect(mockRequest.mock.calls[0][0]).toBe('/access-control/v1/local_password_repos');
    expect(mockRequest.mock.calls[1][0]).toBe('/access-control/v1/local_password_repos/Default');
    expect(users).toHaveLength(2);
    expect(users[0]).toMatchObject({ username: 'Admin', repository: 'Default' });
    expect(repoUserId(users[0])).toBe('Default:Admin');
  });

  it('create() appends the user and PUTs the whole repository (repository tag stripped)', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse(repo));
    mockRequest.mockResolvedValueOnce(jsonResponse({ ...repo }));
    const created = await acLocalPasswordUsersService.create({
      username: 'newuser',
      password: 'longenough',
      repository: 'Default',
    });
    const [putPath, putInit] = mockRequest.mock.calls[1];
    expect(putPath).toBe('/access-control/v1/local_password_repos/Default');
    expect(putInit.method).toBe('PUT');
    const body = JSON.parse(putInit.body as string);
    expect(body.users).toHaveLength(3);
    expect(body.users[2]).toEqual({ username: 'newuser', password: 'longenough' });
    expect(body.users[2].repository).toBeUndefined();
    expect(created.repository).toBe('Default');
  });

  it('create() rejects a duplicate username without touching the wire', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse(repo));
    await expect(
      acLocalPasswordUsersService.create({ username: 'Admin', repository: 'Default' })
    ).rejects.toThrow(/already exists/);
    expect(mockRequest).toHaveBeenCalledTimes(1); // GET only, no PUT
  });

  it('update() replaces the user matched by the composite id', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse(repo));
    mockRequest.mockResolvedValueOnce(jsonResponse({ ...repo }));
    await acLocalPasswordUsersService.update('Default:guest', {
      username: 'guest',
      enabled: true,
      repository: 'Default',
    });
    const body = JSON.parse(mockRequest.mock.calls[1][1].body as string);
    expect(body.users).toHaveLength(2);
    expect(body.users[1]).toMatchObject({ username: 'guest', enabled: true });
    expect(body.users[0]).toMatchObject({ username: 'Admin' }); // untouched
  });

  it('remove() PUTs the repository back without the user', async () => {
    mockRequest.mockResolvedValueOnce(jsonResponse(repo));
    mockRequest.mockResolvedValueOnce(jsonResponse({ ...repo }));
    await acLocalPasswordUsersService.remove('Default:guest');
    const body = JSON.parse(mockRequest.mock.calls[1][1].body as string);
    expect(body.users).toEqual([{ username: 'Admin', display_name: 'Admin', enabled: true }]);
  });
});

describe('toWireUser', () => {
  it('strips the UI-side repository tag', () => {
    expect(toWireUser({ username: 'x', repository: 'Default' })).toEqual({ username: 'x' });
  });
});
