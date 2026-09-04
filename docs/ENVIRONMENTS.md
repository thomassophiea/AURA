# Environments: Integration and Production Demo

AURA runs in two deployments out of one codebase. **Integration** tracks `main`
and changes constantly. **Production Demo** tracks the `production` branch and
only moves when a build is deliberately promoted, so it stays stable for customer
demonstrations.

Both live in the Railway project *EDGE Services*, environment `production`.
That is not a mistake: Railway private networking (`*.railway.internal`) only
works within one project + environment, and Production Demo AURA has to reach
Production CWP privately. Separation comes from separate services, separate
databases, and separate secrets — and it is enforced in code, not by convention
(see [Isolation](#isolation)).

## Topology

| | Integration | Production Demo |
|---|---|---|
| App | `Integration (AURA)` — integration.up.railway.app | `Production Demo (AURA)` — production-demo.up.railway.app |
| Branch | `main` | `production` |
| Database | `Postgres` | `PostgresProd` |
| Collector | `aura-collector` | `prod-collector` |
| Cleanup | `aura-cleanup` (cron `17 * * * *`) | `prod-cleanup` (cron `17 * * * *`) |
| Captive portal | `OS-ONE-CWP` — os-one-cwp-production.up.railway.app | `Production CWP` — production-cwp.up.railway.app |
| Portal database | `PostgresCWP` | `PostgresCWPProd` |
| Guest WLAN | `AURA-CWP` | `AURA-PROD-CWP` |
| ECP identity | `OS-ONE-CWP` | `PRODUCTION-CWP` |
| Portal branch | `main` | `production` |

The portal branch split is not cosmetic. Both portals build from
`thomassophiea/OS-ONE-CWP`, and while both tracked `main`, every push to that
repository was an ungated deploy straight to the production portal. `Production
CWP` now tracks a `production` branch, and AURA-QA fails if the two ever share
one again.

Both environments talk to the same physical gateway. They are kept apart there by
using different WLANs, different ECP identities, and different shared secrets.

## Isolation

The realistic accident is not a bug in this repository — it is a `DATABASE_URL`
service reference pointed at the wrong Postgres. The two environments run
byte-identical images, so that mistake is completely silent: the connection
succeeds, the schema matches, `/health` reports green, and the retention sweep
deletes seven days of the *other* environment's history on its next tick.

So each database carries a stamp. Migration `0003_environment_identity.sql`
writes a single row naming the environment it belongs to, and
`server/db/environmentGuard.js` checks it:

- at boot, in the web role — fatal in production;
- in `runRetentionCleanup`, **before any `DELETE`**.

Verified against the live deployment on 2026-08-07: a production process pointed
at the Integration database read the stamp, threw `EnvironmentMismatchError`, and
deleted nothing.

```
connected database stamped: {"stamped":true,"environment":"integration",...}
REFUSED: EnvironmentMismatchError
```

`AURA_ENVIRONMENT` defaults to `integration` when unset. That direction is
deliberate: if the variable is ever lost, the safe failure is a Production
process refusing to touch the Production database, not an Integration process
claiming to be Production.

## QA and Release

Promotion now runs through two services that sit between the two environments —
**AURA-QA** (aura-qa-production.up.railway.app) and **AURA-Release**
(aura-release-production.up.railway.app), built from
[`thomassophiea/AURA-Pipeline`](https://github.com/thomassophiea/AURA-Pipeline)
and deployed alongside everything else in *EDGE Services*.

QA validates the exact deployed commit — real browsers, APIs, schema and
migration safety, collector, cleanup, portal, gateway, and environment isolation
as a blocking gate — and reports READY or BLOCKED. It never promotes. Release
compares the two environments, generates release notes, and promotes a
QA-validated commit behind a typed-sha confirmation, then verifies Production and
keeps a rollback path.

Details, including why isolation blocks on its own and how to add a test, are in
[QA_AND_RELEASE.md](QA_AND_RELEASE.md).

QA/Release operational state lives in its own `PostgresQA` service. It never
touches `Postgres`, `PostgresProd`, `PostgresCWP` or `PostgresCWPProd`.

## Promoting a build

The pipeline is the normal path. The script below remains as the break-glass one
— it runs the same fast-forward-and-tag model from a laptop, without the QA gate,
release notes or history.

```bash
scripts/promote-to-production.sh              # full run
scripts/promote-to-production.sh --dry-run    # show what would happen
```

The script:

1. checks the working tree is clean and fetches `origin`;
2. runs the test suite;
3. asserts Integration's `/api/v1/system/health` is `ok` **and that Integration is
   actually running `origin/main`** — promoting a commit Integration has not
   validated is the mistake this exists to prevent;
4. fast-forwards `production` to that commit and tags it `prod-<UTC>-<sha>`;
5. waits for Railway to deploy, then verifies the environment, the database
   stamp, health, and the guest/monitoring/system APIs;
6. prints the running version and the rollback command.

`--ff-only` is a safety property, not a style preference: a merge commit would
let `production` diverge from `main`, after which "production is a known-good
Integration commit" stops being true.

### Rollback

```bash
git push --force-with-lease origin <previous-tag-or-sha>:production
```

Or redeploy the previous deployment from the Railway dashboard, which needs no
rebuild. Release tags (`prod-*`) mark every promoted commit.

Application code and production data are separate concerns — promotion never
copies a database.

## System API

For the QA/validation application. Unauthenticated and deliberately secret-free:
configuration is reported as variable **names and presence only**, never values.
Each probe is independently guarded, so a broken dependency becomes a `status`
field rather than a 500 — an endpoint that fails when a dependency is down is
useless exactly when it is needed.

| Endpoint | Answers |
|---|---|
| `GET /api/v1/system/version` | which environment, commit, branch, release tag |
| `GET /api/v1/system/health` | rollup; `200` healthy / `503` degraded, with a `failing` list |
| `GET /api/v1/system/dependencies` | database + schema version, collector liveness, cleanup state, portal health, gateway reachability, config shape, feature flags |

Collector and cleanup liveness are inferred from data rather than heartbeats: the
age of the newest sample proves collection is actually happening, and the age of
the oldest proves retention is actually sweeping.

Comparing the two environments is a diff of
`/api/v1/system/dependencies` — `configuration.required`, `schema.latest`,
`features`, and each dependency's `status`. No secret is involved on either side.

## Gateway

`AURA-PROD-CWP` was cloned from `AURA-CWP`, with only the environment-specific
values changed: portal redirect, ECP identity, shared secret, and the
walled-garden rules that name the portal host. Shared with the reference:
topology `v1`, AAA policy *Local onboarding*, authenticated role *Enterprise
User*, `sessionTimeout` 3600, pre-auth idle 300, post-auth idle 1800.

A backup of the reference configuration is in `audit/gateway-backup-<date>/`.

Creating an ECP WLAN over the API has a non-obvious requirement: **the service id
must equal the unregistered role's id, and the role must be created first**. The
controller does not auto-create it, and every other failure surfaces as a
misleading `422 "Policy not found"`. The full set of traps is recorded in the
`ai-first` skill's `references/gotchas.md`.

`POST /v3/roles` **ignores a client-supplied `id`** and assigns one of its own.
Because the service id has to equal the role id, the *role* decides the pair's
id, and a deleted ECP WLAN cannot be recreated at its original id. `PUT
/v3/roles/{id}` does not upsert — it answers `422 "Can not find Role"`. Create
the role, read its id back, then POST the service with that id.

`AURA-PROD-CWP` was rebuilt this way on 2026-09-04 after it was found missing
from the controller (every production gateway check was failing or skipping on
`422 Can not find Service`). Its id therefore changed from
`ba3b44b0-3e0f-4195-b8eb-c70e48e3922e` to
`f4554eab-7d26-4976-95e2-29b2e02fc849`; the pipeline's `lib/topology.js` and the
`archangel` skill's references were updated to match. Configuration is otherwise
identical to the reference, and it is bound to `AP5010-LAB1` radios 1 and 2.

### Rolling back the gateway change

```
DELETE /management/v1/services/f4554eab-7d26-4976-95e2-29b2e02fc849
```

Removing the service also removes it from every profile's `radioIfList`.
`AURA-CWP` is untouched by this and keeps working.
