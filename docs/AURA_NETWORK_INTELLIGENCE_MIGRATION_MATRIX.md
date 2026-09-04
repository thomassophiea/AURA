# AURA Network Intelligence — Migration Matrix

Produced per `AURA-NETWORK-INTELLIGENCE-REBUILD-PROMPT.md` step 2, before any editing.
Inspection basis: 3 parallel codebase audits (backend Cortex, frontend AgentCoworker,
validation/controller-API/audit/RBAC) + vault authoritative sources (`ai-first.md`,
`Networks and WLANs.md`, `VLANs and Topology.md`, `Sites.md`, `Gateway Vocabulary.md`).

## Headline finding

The one existing "mutating" path (`src/services/agentService.ts`, wired in from
`CortexContext.sendMessage` via crude regex intent-matching) is **non-functional and
unsafe to keep**: `executeStep()` replaces every `{id}`/`{serial}` path placeholder with
the literal string `"unknown"` before issuing the HTTP call, so it can never target a
real resource; its audit trail is `localStorage` only (no server record, no RBAC, no
correlation to `aura_audit_log`); its "validation" step is a label with no logic; its
rollback flips a status string. This is deleted, not migrated — see row 1.

Everything else in Cortex today is genuinely read-only and safe: the LLM tool catalog
is 100% GET, the wireless Q&A pipeline is deterministic evidence-only, and three routes
that would host real writes (`/api/cortex/tool-call`, `/config/preview`, `/config/commit`)
are honest `501` "Phase 3" stubs — never shipped, never faked.

## Matrix

| # | Current file/export/route | Consumers | Disposition | Notes |
|---|---|---|---|---|
| 1 | `src/services/agentService.ts` — `parseIntent`, `buildExecutionPlan`, `executeApprovedPlan`, `executeStep`, `rollbackOperation`, `rejectPlan`, `WRITE_PATTERNS` | `CortexContext.sendMessage` (write-intent branch) | **Replace.** Broken (`{id}`→`"unknown"`), client-only audit, no RBAC/token/validation. Delete these members; real pipeline lives server-side (rows 6-9). | `handleQuery` (read-only network summary) and the audit/timeline *getters* are left in place short-term (row 4) until the new session model has full parity, then removed. |
| 2 | `server/cortexOrchestrator.js`, `cortexLlmProvider.js`, `cortexModelRegistry.js`, `cortexContextSanitizer.js` | `/api/cortex/session,models,message,context` | **Migrate behind new interfaces.** Session/provider/model-registry infra is solid — reuse as the LLM substrate for intent narration and read-only chat; no change to provider selection logic. | Session store stays in-memory/TTL as today; not a blocker for the vertical slice. |
| 3 | `server/cortex/toolCatalog.js`, `toolDispatcher.js` (14 GET tools) | tool-loop in `cortexOrchestrator.processMessage` | **Retain as-is.** Genuinely read-only; becomes the read-only-investigation tool surface the new panel's Q&A mode calls through. | Explicit file-header comment already states writes never go through this path — keep that invariant. |
| 4 | `server/cortex/wirelessQueryPipeline.js` + `wirelessSystemPrompt.js`, `intentDetector.js`, `apiPlanner.js`, `auraApiClient.js`, `guardrails.js`, `evidenceNormalizer.js`, `rootCauseClassifier.js`, `confidenceScorer.js` | `POST /api/cortex/wireless/query`, `CortexContext.runWirelessQuery` | **Migrate + extend.** Keep the deterministic read-only diagnostic pipeline verbatim as the new panel's "read-only investigation" mode. Extend `intentDetector` with a mutating-intent branch (row 6) instead of `agentService`'s regex. | The 3 disruptive PUT templates in `apiPlanner.js` + dead `executeDisruptiveCall` in `auraApiClient.js` are out of scope for this slice — leave as unreachable until a future AP-reboot/packet-capture feature is scoped. |
| 5 | `server/validationEngine/*` (`xccClient`, `vlanValidator`, `dhcpValidator`, `lldpTopologyResolver`, `rfCapacityAnalyzer`, `confidenceAggregator`, `driftMonitor`, `rollbackEngine`, `validationRouter`) | `POST /api/validate/intent`, `ValidationPanel.tsx` (direct `fetch`, bypasses `cortexApiClient`) | **Refactor into full validator.** Real logic (VLAN existence, DHCP, LLDP trunk check, RF capacity/radio-index/6GHz-WPA2 rule, weighted confidence bands) is reusable — it's scoped to VLAN-only intent and its `provisioningToken` is an unsigned timestamp string with no server-side registry. New `wlanConfigValidator.js` (row 7) wraps these checks, adds WLAN-name-conflict/profile/Role checks, and replaces the token with an HMAC-signed, server-verified one carrying a real plan hash. | `driftMonitor`/`rollbackEngine` stay in-memory singletons for now (pre-existing constraint, matches "config snapshot restore not built" from prior session). |
| 6 | *(none — new)* | — | **New:** `server/cortex/wirelessIntentParser.js` | Typed `WirelessConfigurationIntent` (create/update/delete/assign/schedule/validate-only WLAN), missing-field + ambiguity detection, risk level, read-only-vs-mutating classification. Reuses `intentDetector.js` slot-resolution style. Replaces `agentService.parseIntent`. |
| 7 | *(none — new)* | — | **New:** `server/cortex/wlanConfigValidator.js` | Full `WirelessValidationReport`: org/site-group/site existence, AP scope, WLAN conflicts, VLAN/topology+DHCP (delegates to row 5), radio/security compatibility (delegates to `rfCapacityAnalyzer`), confidence banding (delegates to `confidenceAggregator`), stable SHA-256 plan hash, HMAC validation token with expiry, server-side verification on provisioning. |
| 8 | *(none — new)* | — | **New:** `server/cortex/wlanProvisioningEngine.js` | Implements the AI-First discipline in Node against `src/services/configure/servicesService.ts`-equivalent server calls: mirror-then-deviate template selection, correct per-radio `radioIfList` binding (never `index:0`), POST/PUT with read-back, propagation wait, live-AP `services[]` verification, honest completed/degraded/partial/failed outcome. |
| 9 | `app.post('/api/cortex/tool-call' \| '/config/preview' \| '/config/commit', ...501...)` | `cortexApiClient.executeCortexToolCall/previewCortexConfigChange/commitCortexConfigChange` (**zero production callers** today) | **Replace.** Swap the three 501 stubs for real routes: `POST /api/cortex/wireless/intent`, `/wireless/validate`, `/wireless/provision` — `operator`-gated + `audit()`-logged on validate/provision, matching the `sentinelRouter.js` "operator+audited" pattern exactly. | Old route names had zero real callers, so no client contract is broken by renaming them; `cortexApiClient.ts` is updated in the same change. |
| 10 | `server/identity/identityStore.js` (`audit`, `aura_audit_log`), `identityRouter.js` (`requireRole`) | sentinel/SSO/PPSK/portal routers | **Retain, reuse verbatim.** This *is* the audit/RBAC system the spec asks for — no new audit store needed. Add a `correlationId` (crypto.randomUUID) into `detail` jsonb per provisioning operation; no schema migration required (`detail` is jsonb). | |
| 11 | `src/types/domain.ts` (`NavigationContext`, `SiteGroup`, `Site`) | most of the app | **Refactor/alias.** No literal `NetworkScope` type exists anywhere except the rebuild prompt itself. Introduce `NetworkScope` as a purpose-built alias/subset of `NavigationContext` rather than a parallel hierarchy type. | |
| 12 | `src/components/AgentCoworker/index.tsx`, `AgentCommandBar.tsx`, `AgentWorkspace.tsx` (shell: floating pill, slideout, drag/resize, minimize/pin, keyboard shortcuts), `ModelSelector.tsx`, `useAgentWorkspace.ts` | `App.tsx` mount, all Ops panels | **Retain outer shell, replace inner workflow.** Keep placement/resize/pin/keyboard-shortcut chrome and the model selector integration verbatim. Replace the Terminal/Ops tab structure and `activePanel` union with the single unified workflow view. | `useAgentWorkspace`'s unused duplicate `inputValue/isListening/pendingPlanId` fields are dead — removed rather than carried forward. |
| 13 | `src/components/AgentCoworker/panels/ConsoleShell.tsx` + `server/consoleShell.js` (SSH PTY WebSocket) | only `AgentWorkspace` Terminal tab | **Deprecate the visible tab; retain the backend service.** No other consumer exists, but the SSH-console capability is a distinct, independently-useful feature (per CLAUDE.md, "AURA Console") — removing the *tab* satisfies "no visible Terminal/Ops duplication"; deleting the working WS server is out of scope creep and not requested by the product objective. Unmount it from the new panel; leave the route/component in the tree for a future dedicated entry point. | |
| 14 | `panels/ConversationStream.tsx` (incl. no-op Mic/MicOff toggle) | `AgentWorkspace` Ops "Chat" | **Refactor.** Becomes the read-only investigation view in the new workflow; the mic button is rewired to a real push-to-talk adapter (row 16) instead of a no-op boolean flip. | |
| 15 | `panels/ValidationPanel.tsx`, `ExecutionPlanView.tsx`, `ConfigDiffView.tsx`, `AuditHistoryView.tsx`, `APITimelineView.tsx`, `DriftPanel.tsx` | `AgentWorkspace` Ops tabs | **Refactor into named workflow components.** These already carry most of the needed shapes (`ExecutionPlan/PlanStep`, `DiffEntry`, `AuditEntry`, `APITimelineEntry` in `agentTypes.ts`) — become `ValidationReport`, `ConfigurationPreview`, `ApprovalControls`/`ProvisioningProgress`, `VerificationResult` per the spec's component list, wired to real server data instead of local-only state. `DriftPanel` folds into read-only Q&A ("are there drift alerts?") rather than staying a separate tab. | |
| 16 | *(none — new)* | — | **New:** `SpeechToTextProvider` adapter (`src/services/speechToText/`) | No speech code exists anywhere except an unused `SpeechRecognition` TS ambient type (`src/types/browser.d.ts`). No speech npm package, no `SPEECH_TO_TEXT_*` env vars. Default provider: **browser** (Web Speech API) — zero infra, real transcripts, matches "acceptable if browser matrix is reliable." Optional **server** adapter added behind `SPEECH_TO_TEXT_PROVIDER=server`, implemented via Groq's Whisper endpoint reusing the already-configured `GROQ_API_KEY` (no new provider onboarding needed) — audio never logged, discarded after transcription. |
| 17 | `src/contexts/CortexContext.tsx` | `AgentWorkspace`, 4 page components' `setWirelessContext` | **Refactor.** Keep session/page-context plumbing and the 4 external wireless-context setters (`ClientDetail`, `AccessPoints`, `TrafficStatsConnectedClients`, `ServiceLevelsEnhanced`) untouched. Replace the write-intent branch (row 1) and add the new `WirelessAssistantSession`/`AssistantMode` state machine driving the unified workflow. | |

## Safest extension points

- **Server:** add three new files under `server/cortex/` (rows 6-8) and one new file
  under `server/validationEngine/` is *not* needed — the new validator composes the
  existing engine rather than replacing it. Mount three new routes in `server.js` in
  place of the three 501 stubs (row 9); everything else in `server.js`'s Cortex block
  is untouched.
- **Client:** one new types file, one new API client, and new workflow components
  that reuse `agentTypes.ts` shapes — the shell (`AgentCoworker`/`AgentWorkspace`) needs
  structural edits only to its tab/panel switch, not its chrome.
- **Nothing outside `server/cortex/`, `server/validationEngine/` (additive),
  `src/components/AgentCoworker/`, `src/contexts/CortexContext.tsx`,
  `src/services/agentService.ts` (reduced), and `src/services/cortexApiClient.ts` needs
  to change for this slice.**

## Scope of the vertical slice built in this pass

Full create-WLAN path end to end: text intake → typed intent → live validation
(plan hash + signed token) → preview → explicit approval → provisioning (mirror-then-
deviate + correct radio binding) → read-back → live-AP verification → audit. Voice
push-to-talk via the browser adapter. Read-only investigation reuses the existing
wireless pipeline unchanged.

**Deferred** (tracked, not built this pass — each needs its own scoped follow-up):
update/delete/assign/schedule-WLAN actions beyond create; PSK rotation through the new
pipeline (script exists in `ai-first`, not yet ported to the Node engine); Role/Profile/
Model-Profile-level editing beyond WLAN-service fields; rollback-with-separate-approval
UI (backend `rollbackEngine`/`rollback_service.py` logic exists, not yet wired to a
button); cross-site WLAN comparison; scheduled PDF-report use cases (controller
`/v1/reports/*` returns `[]` on this controller per prior-session finding — unaffected
by this work); server-side speech provider activation (adapter is built, `browser` is
the shipped default, `server`/Groq path is implemented but requires the operator to
opt in via env var).
