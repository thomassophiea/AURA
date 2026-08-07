#!/usr/bin/env bash
#
# Promote the validated Integration build to Production Demo.
#
#   scripts/promote-to-production.sh            # full run
#   scripts/promote-to-production.sh --dry-run  # show what would happen
#   scripts/promote-to-production.sh --skip-tests
#
# The model is deliberately boring: `production` is a branch that only ever
# fast-forwards to a commit already proven healthy on Integration. Railway
# auto-deploys that branch, so "promote" and "git push" are the same act and
# there is no second source of truth about what production is running.
#
# --ff-only is not a stylistic choice. A merge commit on `production` would make
# it diverge from `main`, and the next promotion would need a real merge — at
# which point "production is a known-good Integration commit" stops being true.
# (It also happens to be the only thing that works in this repo: `--no-ff` dies
# with `fatal: stash failed` on this volume.)

set -euo pipefail

INTEGRATION_URL="${INTEGRATION_URL:-https://integration.up.railway.app}"
PRODUCTION_URL="${PRODUCTION_URL:-https://production-demo.up.railway.app}"
DEPLOY_TIMEOUT_SECONDS="${DEPLOY_TIMEOUT_SECONDS:-600}"

DRY_RUN=false
SKIP_TESTS=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --skip-tests) SKIP_TESTS=true ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ---------------------------------------------------------------- 1. preflight
bold "1. Preflight"

[ -z "$(git status --porcelain)" ] || die "Working tree is dirty. Commit or stash first."
git fetch origin --quiet
ok "working tree clean, origin fetched"

MAIN_SHA="$(git rev-parse origin/main)"
MAIN_SHORT="${MAIN_SHA:0:7}"
ok "candidate commit: $MAIN_SHORT ($(git log -1 --format=%s "$MAIN_SHA"))"

if git rev-parse --verify --quiet origin/production >/dev/null; then
  PREV_SHA="$(git rev-parse origin/production)"
  PREV_SHORT="${PREV_SHA:0:7}"
  ok "production currently at $PREV_SHORT"
  if [ "$PREV_SHA" = "$MAIN_SHA" ]; then
    warn "production already matches main — nothing to promote."
    exit 0
  fi
  # The whole safety property in one check: refuse anything that is not a
  # fast-forward, rather than discovering it mid-push.
  git merge-base --is-ancestor "$PREV_SHA" "$MAIN_SHA" \
    || die "origin/production is not an ancestor of origin/main. Someone committed directly to production; resolve by hand."
  ok "fast-forward is possible"
else
  PREV_SHA=""
  PREV_SHORT="(none)"
  warn "origin/production does not exist yet — this run creates it"
fi

# ------------------------------------------------------------------- 2. tests
bold "2. Tests"
if $SKIP_TESTS; then
  warn "skipped by --skip-tests"
else
  # Run against the candidate, not the working tree, so the thing being tested
  # is the thing being promoted.
  node node_modules/vitest/vitest.mjs run --silent 2>&1 | tail -5 || die "tests failed — not promoting"
  ok "test suite completed"
fi

# ------------------------------------------------- 3. Integration health check
bold "3. Integration health"

INT_HEALTH="$(curl -fsS -m 20 "$INTEGRATION_URL/api/v1/system/health" 2>/dev/null || true)"
[ -n "$INT_HEALTH" ] || die "Integration health endpoint unreachable at $INTEGRATION_URL"

INT_STATUS="$(printf '%s' "$INT_HEALTH" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).status' 2>/dev/null || echo unknown)"
INT_ENV="$(printf '%s' "$INT_HEALTH" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).environment' 2>/dev/null || echo unknown)"
[ "$INT_ENV" = "integration" ] || die "$INTEGRATION_URL reports environment=$INT_ENV — refusing to promote from it"
[ "$INT_STATUS" = "ok" ] || die "Integration is $INT_STATUS. Fix it before promoting. Detail: $INT_HEALTH"
ok "Integration healthy"

INT_COMMIT="$(curl -fsS -m 20 "$INTEGRATION_URL/api/version" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).commit' 2>/dev/null || echo unknown)"
if [ "$INT_COMMIT" != "$MAIN_SHORT" ]; then
  die "Integration is running $INT_COMMIT but origin/main is $MAIN_SHORT. Wait for the Integration deploy to finish — promoting an unvalidated commit is exactly what this script exists to prevent."
fi
ok "Integration is running the candidate commit ($INT_COMMIT)"

# ---------------------------------------------------------------- 4. promotion
TAG="prod-$(date -u +%Y%m%d-%H%M%S)-$MAIN_SHORT"
bold "4. Promote"

if $DRY_RUN; then
  warn "dry run — would fast-forward production $PREV_SHORT -> $MAIN_SHORT and tag $TAG"
  exit 0
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
cleanup() { git checkout --quiet "$CURRENT_BRANCH" 2>/dev/null || true; }
trap cleanup EXIT

if [ -n "$PREV_SHA" ]; then
  git checkout --quiet production 2>/dev/null || git checkout --quiet -b production origin/production
  git merge --ff-only "$MAIN_SHA" --quiet
else
  git checkout --quiet -b production "$MAIN_SHA"
fi

git tag -a "$TAG" -m "Promoted $MAIN_SHORT from Integration on $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push origin production --quiet
git push origin "$TAG" --quiet
ok "production -> $MAIN_SHORT, tagged $TAG"

# ------------------------------------------------------- 5. wait for the deploy
bold "5. Production Demo deploy"
echo "  waiting for $PRODUCTION_URL to report $MAIN_SHORT (timeout ${DEPLOY_TIMEOUT_SECONDS}s)"

DEADLINE=$(( $(date +%s) + DEPLOY_TIMEOUT_SECONDS ))
DEPLOYED=false
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  RUNNING="$(curl -fsS -m 10 "$PRODUCTION_URL/api/version" 2>/dev/null | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).commit' 2>/dev/null || echo pending)"
  if [ "$RUNNING" = "$MAIN_SHORT" ]; then DEPLOYED=true; break; fi
  printf '.'
  sleep 10
done
printf '\n'
if ! $DEPLOYED; then
  echo "  Rollback: git push --force-with-lease origin ${PREV_SHA:-<no previous release>}:production" >&2
  die "Production Demo did not reach $MAIN_SHORT within ${DEPLOY_TIMEOUT_SECONDS}s. Check the Railway build log."
fi
ok "Production Demo is running $MAIN_SHORT"

# ------------------------------------------------------------- 6. verification
bold "6. Verify Production Demo"

PROD_HEALTH="$(curl -sS -m 20 "$PRODUCTION_URL/api/v1/system/health" || true)"
PROD_STATUS="$(printf '%s' "$PROD_HEALTH" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).status' 2>/dev/null || echo unknown)"
PROD_ENV="$(printf '%s' "$PROD_HEALTH" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).environment' 2>/dev/null || echo unknown)"

[ "$PROD_ENV" = "production" ] || die "Production Demo reports environment=$PROD_ENV — its AURA_ENVIRONMENT is wrong"
ok "environment: production"

DB_MATCH="$(printf '%s' "$PROD_HEALTH" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).databaseEnvironment.matches' 2>/dev/null || echo unknown)"
[ "$DB_MATCH" = "true" ] || die "Production Demo is attached to a database stamped for another environment. Detail: $PROD_HEALTH"
ok "database stamp matches"

if [ "$PROD_STATUS" != "ok" ]; then
  FAILING="$(printf '%s' "$PROD_HEALTH" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).failing.join(", ")' 2>/dev/null || echo unknown)"
  warn "health is degraded — failing: $FAILING"
else
  ok "health: ok"
fi

# Smoke-test the surfaces a demo actually depends on. 200 or 401 both prove the
# route is mounted; only 404/5xx mean the build lost something.
for path in /api/v1/guests/summary /api/monitoring/sources /api/v1/system/dependencies; do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$PRODUCTION_URL$path" || echo 000)"
  case "$CODE" in
    200|401|403) ok "$path -> $CODE" ;;
    *) warn "$path -> $CODE (expected 200/401)" ;;
  esac
done

# ------------------------------------------------------------------ 7. summary
bold "7. Result"
echo "  Integration     $MAIN_SHORT   $INTEGRATION_URL"
echo "  Production Demo $MAIN_SHORT   $PRODUCTION_URL"
echo "  Release tag     $TAG"
echo "  Previous        $PREV_SHORT"
echo
bold "Rollback"
if [ -n "$PREV_SHA" ]; then
  echo "  git push --force-with-lease origin $PREV_SHA:production"
  echo "  (or redeploy the previous deployment from the Railway dashboard — no rebuild)"
else
  echo "  No previous production release exists to roll back to."
fi
