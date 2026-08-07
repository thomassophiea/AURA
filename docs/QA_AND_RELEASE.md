# QA and Release

Two services sit between Integration and Production Demo. They live in
[`thomassophiea/AURA-Pipeline`](https://github.com/thomassophiea/AURA-Pipeline)
and deploy into the same Railway project.

| | | Answers |
|---|---|---|
| **AURA-QA** | aura-qa-production.up.railway.app | *Is this exact Integration commit safe to promote?* |
| **AURA-Release** | aura-release-production.up.railway.app | *What differs, what will be promoted, and do I want to promote it?* |

```
main → Integration deploys → AURA-QA runs → READY → AURA-Release → production → Production Demo
                                              │                                       │
                                            BLOCKED                            verify · roll back
```

They are separate services, not two views of one, because the split is a
capability boundary: AURA-Release can move the `production` branch and deploy to
Production; AURA-QA has no code path that does either. QA passing never promotes
anything — it sets a status and stops.

## What QA validates

Eleven groups. Only a **blocking** failure prevents a release; other failures and
warnings are visible and do not stop anything, which is what makes the flag mean
something.

| Group | Notes |
|---|---|
| **Environment Isolation** | The blocking gate. See below. |
| Application | Health, identity, and that the deployment is running `main`'s head |
| Browser / UI | Real Chromium (blocking), Firefox and WebKit (advisory) |
| APIs | Status, response *shape*, auth, pagination, filtering, invalid input, error bodies |
| Database | Schema comparison, migration classification, and a real dry run |
| Collector | Deployment status plus sample freshness |
| Cleanup | Schedule, restart policy, retention, target database — never executes a sweep |
| Guest / CWP | Integration in full; Production health, TLS and configuration only |
| Gateway | WLAN, ECP, AAA, roles, walled garden — every call a `GET` |
| Regression | Always runs in full, whatever the diff says |
| Security / Configuration | Required variable *names*, headers, rate limiting, secret-leak checks |

**Why Environment Isolation blocks on its own.** The realistic accident is not a
bug in this repository — it is a `DATABASE_URL` service reference pointed at the
other environment's Postgres. The two environments run byte-identical images, so
that mistake is completely silent: the connection succeeds, the schema matches,
`/health` reports green, and the retention sweep deletes seven days of the other
environment's history on its next hourly tick. Browser tests pass, APIs answer,
the collector writes. Nothing else in the suite can see it.

So it is asserted directly, against the **unrendered** Railway variable — the
reference expression `${{Postgres.DATABASE_URL}}`, not the value it resolves to.
No secret is read to answer the question, and a literal connection string fails
even when it happens to point somewhere correct today, because nothing keeps it
pointing there.

**Browser tests are real.** `src/App.tsx` is a `switch (currentPage)` state
machine behind a login gate — there is no URL to deep-link to — so the tests sign
in and click through the sidebar exactly as a person would. A broken navigation
item is invisible to a test that bypasses navigation. Screenshots, Playwright
traces, console errors and failed requests are stored in the QA database, because
the container is not around when someone wants to read them.

**Destructive tests are Integration-only.** The guest create → read → revoke →
delete round trip runs against a pipeline-owned MAC in a locally-administered
range and cleans up in a `finally`. Nothing destructive ever runs against
Production, and the revoke *dialog* is opened and cancelled rather than confirmed
— the guests on these networks are real.

## Test selection

QA diffs the deployed commit against the last successfully released one and maps
changed paths to product areas, then runs those browser scenarios **in addition
to** every always-on scenario. Selection can only ever add work. Every
non-browser group runs on every run regardless — the failures worth catching are
the ones nobody predicted would be affected.

## Automatic trigger

AURA-QA polls Integration's `/api/v1/system/version` and starts a run when it
sees a new commit that has been *continuously healthy* for 90 seconds. Railway's
public API exposes no way to create a deployment webhook, and polling turns out
to fit better anyway: the trigger condition is not "a deployment finished" but "a
new commit is deployed and healthy", and a deployment reports healthy before its
connection pool has warmed. `Run QA now` is always available.

## Promotion

Seven conditions must all hold before the button appears, and they are
re-evaluated immediately before the promotion runs — a gate checked only at page
render can be walked past by leaving a tab open.

1. A QA run exists for the deployed commit
2. It reported READY
3. Integration has not changed since
4. Integration is healthy now
5. Production is healthy now
6. No pending migration is destructive
7. There is something to promote

Confirmation is a **typed short sha**, not a yes/no. Then:
`production` is fast-forwarded, tagged `prod-<UTC>-<sha>`, deployed, and
verified — environment, database stamp, schema, APIs, portal, collector,
cleanup, gateway, and a real Chromium pass over the dashboard, Clients and Guest
Users. The result is `SUCCESS` or `FAILED — ROLLBACK AVAILABLE`.

The fast-forward is enforced by GitHub: the ref is moved with
`PATCH /git/refs/heads/production` and `force: false`, which the API refuses
unless the move is a fast-forward. A merge commit would let `production` diverge
from `main`, and once it has, "Production is a known-good Integration commit"
stops being true.

**No application data is ever copied.** Promotion moves code, schema level and
configuration shape. `Postgres`, `PostgresProd`, `PostgresCWP` and
`PostgresCWPProd` stay independent, and QA/Release state lives in its own
`PostgresQA`.

## Rollback

Every release records its previous commit, previous schema version and previous
**Railway deployment id**. Rollback redeploys that deployment — an image that
already built and already ran, so there is nothing new in it that can fail — and
moves the `production` branch back under a lease (the caller states the sha it
believes the branch points at, and the move is refused if reality has moved on).

**Migrations are never reversed.** If the release being rolled back contained a
destructive migration, rollback reports that manual schema work is required and
refuses to guess. Writing DDL that deletes data, against a schema nobody is
currently looking at, during an incident, is not a thing to automate.

## Release notes

Generated for every proposed and completed release, from the commit history, the
file diff, the changed route declarations, the migration DDL, the QA results and
the configuration drift — never a dump of commit subjects. `Migration 0027`
becomes *"Added guest authorization status and expiration indexes to improve
Guest Users query performance."* Notes are persisted in the QA database, shown in
the Release UI with full history, and published as a GitHub Release on the tag.

## Endpoints this depends on

`server/system/systemRouter.js` is the contract. It is unauthenticated and
deliberately secret-free — configuration is reported as variable names and
presence only — and each dependency probe is independently guarded so a broken
dependency becomes a `status` field rather than a 500.

| Endpoint | Answers |
|---|---|
| `GET /api/v1/system/version` | environment, commit, branch, release tag |
| `GET /api/v1/system/health` | rollup; `200` healthy / `503` degraded with a `failing` list |
| `GET /api/v1/system/dependencies` | schema + migrations, collector, cleanup, portal, gateway, config shape |

**Changing these three routes changes the pipeline's eyesight.** The regression
group asserts they are still mounted and still return AURA JSON, because
unmatched `/api/*` paths fall through to the Campus Controller and answer with a
Jetty HTML 404 — a removed route would otherwise look like a correct 404.

## Adding a test

Browser scenarios live in `qa/tests/browser/scenarios.js` as plain objects with a
`run(context)`; page objects are in `qa/tests/browser/pages/`. Non-browser checks
live in `qa/checks/<group>.js` and return a verdict rather than throwing, so a
run always completes and describes everything that is broken rather than only the
first thing.

Bind selectors to accessible affordances — `aria-label="Search guests"`,
`#guest-mac` — not class names. Those attributes exist for screen readers and are
the least likely to change for cosmetic reasons, which also means a change that
breaks a test usually broke accessibility.

Mark a check `blocking: true` only when shipping past it would be worse than not
shipping.
