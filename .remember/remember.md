# Handoff

## State
Worktree `claude/competent-volhard`. Audit Plan 1 executing via subagent-driven-development.
- Tasks 1-4 COMPLETE (scaffold, Swagger catalog, route inventory, component inventory — all committed)
- Task 5 IN PROGRESS: feature-to-endpoint matrix (`audit/aura-feature-endpoint-matrix.md`) — subagent was about to be dispatched but not yet started
- Task 6 PENDING: summary README and push
- Sites/Site Groups refactor spec approved, implementation plan not yet written

## Next
1. Dispatch subagent for Task 5: Build feature-to-endpoint matrix — read all 28 route components, map each feature to its API call, cross-ref to Swagger, flag mock data, identify unused Swagger endpoints
2. Then Task 6: write audit README, commit, push
3. After Plan 1: write Sites/Site Groups implementation plan from `docs/superpowers/specs/2026-03-28-sites-and-site-groups-refactor-design.md`

## Context
- Swagger at `public/swagger.json` (328 endpoints, 37 tags)
- 13 dead code candidates found in Task 4
- Skip controller switching audit (demo only)
- No nested left-nav panels in pages (design constraint)
- Visual companion server likely needs restart if needed again
