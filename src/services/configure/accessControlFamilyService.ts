/**
 * Access Control family (`/access-control/v1/*`) — RADIUS Servers, LDAP
 * Configurations, Local Password Repository, Groups, Rules, Certificates.
 *
 * These endpoints live OUTSIDE `/management` on the gateway; the apiService
 * base still prefixes `/management`, and server.js's pathRewrite strips it for
 * `/access-control/` exactly as it does for `/platformmanager/` — same
 * mechanism, verified live against 192.168.100.12:5825.
 *
 * Record identity (verified against the live appliance — none of these
 * resources carries an `id` field):
 *   radius_servers        -> keyed by `server_ip`
 *   ldap_configurations   -> keyed by `config_name`
 *   local_password_repos  -> repository keyed by `name`; USERS live inside the
 *                            repo's `users[]` and are edited by PUTting the
 *                            whole repository back (the wire has no per-user
 *                            endpoint). The gateway ships one repo, "Default".
 *   groups                -> keyed by `name`; the LIST omits `entries` — GET
 *                            /groups/{name} returns them.
 *   rules                 -> the LIST returns rule SETS {id, reorderable,
 *                            rules[]}, but the per-record path is keyed by the
 *                            RULE name (GET /rules/0 -> "Rule not found",
 *                            GET /rules/Blacklist -> the rule).
 *   certificates          -> keyed by `name`.
 *
 * None of these exposes a /default template — editors seed controller-shaped
 * defaults from accessControlModel.ts instead.
 */
import { configureRequest, createResourceClient, unwrapList } from './resourceClient';

/* ────────────────────────── wire record shapes ────────────────────────── */

export interface AcRadiusServer {
  server_ip: string;
  shared_secret?: string | null;
  /** Edit-mode-only field on the gateway UI (absent until first save). */
  response_window?: number | null;
  authentication_timeout?: number | null;
  authentication_retry_count?: number | null;
  authorization_client_port?: number | null;
  accounting_client_port?: number | null;
  proxy_radius_accounting_requests?: boolean;
  require_message_authenticator?: boolean;
  username_format?: string | null;
  use_server_status_request?: boolean;
  use_access_request?: boolean;
  username?: string | null;
  password?: string | null;
  check_interval?: number | null;
  number_of_answers_to_alive?: number | null;
  revive_interval?: number | null;
  canEdit?: boolean | null;
  canDelete?: boolean | null;
}

export interface AcLdapConfiguration {
  config_name: string;
  ldap_configuration_urls?: string[] | null;
  administrator_username?: string | null;
  administrator_password?: string | null;
  user_authentication_type?: string | null;
  keep_domain_name_for_user_lookup?: boolean;
  use_fqdn?: boolean;
  user_search_root?: string | null;
  host_search_root?: string | null;
  ou_search_root?: string | null;
  user_object_class?: string | null;
  user_search_attribute?: string | null;
  user_password_attribute?: string | null;
  host_object_class?: string | null;
  host_search_attribute?: string | null;
  ou_object_classes?: string | null;
  canEdit?: boolean | null;
  canDelete?: boolean | null;
}

export interface AcRepoUser {
  username: string;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  password?: string | null;
  password_hash_type?: string | null;
  description?: string | null;
  enabled?: boolean;
}

/** AcRepoUser tagged with the repository it lives in (UI-side only). */
export interface AcRepoUserRecord extends AcRepoUser {
  repository: string;
}

export interface AcPasswordRepository {
  name: string;
  users?: AcRepoUser[] | null;
}

/** One entry object carries every kind key; inactive kinds are null. */
export interface AcGroupEntry {
  mac_group_entry?: Record<string, unknown> | null;
  hostname_group_entry?: Record<string, unknown> | null;
  ip_group_entry?: Record<string, unknown> | null;
  ldap_group_entry?: Record<string, unknown> | null;
  ldap_user_group_entry?: Record<string, unknown> | null;
  radius_user_group_entry?: Record<string, unknown> | null;
  username_group_entry?: Record<string, unknown> | null;
  device_group_entry?: Record<string, unknown> | null;
  location_group_entry?: Record<string, unknown> | null;
}

export interface AcGroup {
  name: string;
  description?: string | null;
  type: string;
  type_category?: string | null;
  mode?: string | null;
  is_registration?: boolean;
  is_readonly?: boolean;
  /** Present on GET /groups/{name}; the list omits it. */
  entries?: AcGroupEntry[] | null;
  canEdit?: boolean | null;
  canDelete?: boolean | null;
}

export interface AcRuleCriterion {
  value: string;
  edit: boolean;
  invert: boolean | null;
}

export interface AcRule {
  name: string;
  enabled?: boolean;
  enabled_edit?: boolean;
  user_group?: AcRuleCriterion;
  end_system_group?: AcRuleCriterion;
  device_type_group?: AcRuleCriterion;
  location_group?: AcRuleCriterion;
  time_group?: AcRuleCriterion;
  role?: AcRuleCriterion;
  portal?: AcRuleCriterion;
}

export interface AcRuleSet {
  id: number;
  reorderable: boolean;
  rules: AcRule[];
}

export interface AcCertificate {
  name: string;
  subject?: string | null;
  issuer?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  crl_urls?: string[] | null;
  canEdit?: boolean | null;
  canDelete?: boolean | null;
}

/* ─────────────────────────── simple resources ─────────────────────────── */

/** RADIUS servers — CRUD keyed by `server_ip`, no /default template. */
export const acRadiusServersService = createResourceClient<AcRadiusServer>({
  resource: 'ac-radius-servers',
  basePaths: ['/access-control/v1/radius_servers'],
  supportsDefault: false,
});

/** LDAP configurations — CRUD keyed by `config_name`, no /default template. */
export const acLdapConfigurationsService = createResourceClient<AcLdapConfiguration>({
  resource: 'ac-ldap-configurations',
  basePaths: ['/access-control/v1/ldap_configurations'],
  supportsDefault: false,
});

/** Groups — CRUD keyed by `name`; get(name) is required to load `entries`. */
export const acGroupsService = createResourceClient<AcGroup>({
  resource: 'ac-groups',
  basePaths: ['/access-control/v1/groups'],
  supportsDefault: false,
});

/** Certificates — CRUD keyed by `name`, no /default template. */
export const acCertificatesService = createResourceClient<AcCertificate>({
  resource: 'ac-certificates',
  basePaths: ['/access-control/v1/certificates'],
  supportsDefault: false,
});

/* ────────────────────────────── rules ────────────────────────────── */

const RULES_BASE = '/access-control/v1/rules';

/** Flatten the wire's rule sets into the rules the grid/editor work with. */
export function flattenRuleSets(sets: AcRuleSet[]): AcRule[] {
  return sets.flatMap((set) => (Array.isArray(set.rules) ? set.rules : []));
}

/**
 * Rules — the collection GET returns rule sets; per-record CRUD is keyed by
 * the RULE name (mirroring the gateway's own rule.html save path).
 */
export const acRulesService = {
  async listSets(): Promise<AcRuleSet[]> {
    return unwrapList<AcRuleSet>(await configureRequest<unknown>(RULES_BASE));
  },
  async list(): Promise<AcRule[]> {
    return flattenRuleSets(await acRulesService.listSets());
  },
  async get(name: string): Promise<AcRule> {
    return configureRequest<AcRule>(`${RULES_BASE}/${encodeURIComponent(name)}`);
  },
  async create(payload: Partial<AcRule>): Promise<AcRule> {
    return configureRequest<AcRule>(RULES_BASE, { method: 'POST', body: payload });
  },
  async update(name: string, payload: Partial<AcRule>): Promise<AcRule> {
    return configureRequest<AcRule>(`${RULES_BASE}/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: payload,
    });
  },
  async remove(name: string): Promise<void> {
    await configureRequest<void>(`${RULES_BASE}/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  },
};

/* ───────────────────── local password repository users ───────────────────── */

const REPOS_BASE = '/access-control/v1/local_password_repos';

export const DEFAULT_REPOSITORY = 'Default';

/** Composite row id — the wire has no user id; identity is repo + username. */
export function repoUserId(user: Pick<AcRepoUserRecord, 'repository' | 'username'>): string {
  return `${user.repository}:${user.username}`;
}

function parseRepoUserId(id: string): { repository: string; username: string } {
  const sep = id.indexOf(':');
  if (sep < 0) return { repository: DEFAULT_REPOSITORY, username: id };
  return { repository: id.slice(0, sep), username: id.slice(sep + 1) };
}

/** Strip the UI-side repository tag before the record goes back on the wire. */
export function toWireUser(user: Partial<AcRepoUserRecord>): AcRepoUser {
  const { repository: _repository, ...wire } = user;
  return wire as AcRepoUser;
}

async function getRepository(name: string): Promise<AcPasswordRepository> {
  return configureRequest<AcPasswordRepository>(`${REPOS_BASE}/${encodeURIComponent(name)}`);
}

async function putRepository(repo: AcPasswordRepository): Promise<AcPasswordRepository> {
  return configureRequest<AcPasswordRepository>(`${REPOS_BASE}/${encodeURIComponent(repo.name)}`, {
    method: 'PUT',
    body: repo,
  });
}

/**
 * Adapter presenting the USERS inside the password repositories as a flat
 * CRUD collection (the shape useResourceCrud expects). Every mutation is a
 * read-modify-write PUT of the owning repository — the wire's only user
 * mutation path. Row ids are `repository:username` composites.
 */
export const acLocalPasswordUsersService = {
  async list(): Promise<AcRepoUserRecord[]> {
    const repos = unwrapList<AcPasswordRepository>(await configureRequest<unknown>(REPOS_BASE));
    const detailed = await Promise.all(repos.map((r) => getRepository(r.name)));
    return detailed.flatMap((repo) =>
      (Array.isArray(repo.users) ? repo.users : []).map((u) => ({
        ...u,
        repository: repo.name,
      }))
    );
  },

  async create(payload: Partial<AcRepoUserRecord>): Promise<AcRepoUserRecord> {
    const repository = payload.repository ?? DEFAULT_REPOSITORY;
    const wire = toWireUser(payload);
    const repo = await getRepository(repository);
    const users = Array.isArray(repo.users) ? repo.users : [];
    if (users.some((u) => u.username === wire.username)) {
      throw new Error(`User "${wire.username}" already exists in repository "${repository}"`);
    }
    await putRepository({ ...repo, users: [...users, wire] });
    return { ...wire, repository };
  },

  async update(id: string, payload: Partial<AcRepoUserRecord>): Promise<AcRepoUserRecord> {
    const { repository, username } = parseRepoUserId(id);
    const wire = toWireUser(payload);
    const repo = await getRepository(repository);
    const users = Array.isArray(repo.users) ? repo.users : [];
    if (!users.some((u) => u.username === username)) {
      throw new Error(`User "${username}" not found in repository "${repository}"`);
    }
    await putRepository({
      ...repo,
      users: users.map((u) => (u.username === username ? { ...u, ...wire } : u)),
    });
    return { ...wire, repository } as AcRepoUserRecord;
  },

  async remove(id: string): Promise<void> {
    const { repository, username } = parseRepoUserId(id);
    const repo = await getRepository(repository);
    const users = Array.isArray(repo.users) ? repo.users : [];
    await putRepository({ ...repo, users: users.filter((u) => u.username !== username) });
  },
};
