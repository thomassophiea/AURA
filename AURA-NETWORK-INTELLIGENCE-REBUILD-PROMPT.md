# Claude Code Prompt: AURA Network Intelligence Rebuild

You are working in:

`/home/redq/Desktop/2027 Project Folder/AURA`

This is a **complete rebuild of the dashboard AI experience**, not a small voice feature or an addition to the existing Cortex UI.

The new product should be called **AURA Network Intelligence**. The assistant should be called **AURA**. Existing Cortex namespaces and modules may be reused internally during migration, but the visible product must become one unified AURA experience.

## Authoritative sources

Read these before editing:

- `/home/redq/Desktop/2027 Obsidian Vault/09-Skills/skill-files/ai-first-configuration.md`
- `/home/redq/Desktop/2027 Obsidian Vault/09-Skills/skill-files/ai-first-troubleshooting.md`
- `/home/redq/Desktop/2027 Obsidian Vault/10-Artifacts/AI-First-Configuration.md`
- `/home/redq/Desktop/2027 Obsidian Vault/10-Artifacts/AI-First-Troubleshooting.md`
- `/home/redq/Desktop/2027 Obsidian Vault/01-Controller-Features/Networks and WLANs.md`
- `/home/redq/Desktop/2027 Obsidian Vault/01-Controller-Features/VLANs and Topology.md`
- `/home/redq/Desktop/2027 Obsidian Vault/00-Index.md`
- `CLAUDE.md`
- `.github/copilot-instructions.md`, if present

Inspect the existing implementation before changing it:

- `server/cortex/`
- `server/cortexOrchestrator.js`
- `server/cortexLlmProvider.js`
- `server/cortexModelRegistry.js`
- `server/cortexContextSanitizer.js`
- `server/cortex/toolCatalog.js`
- `server/cortex/toolDispatcher.js`
- `server/cortex/wirelessQueryPipeline.js`
- `server/cortex/wirelessSystemPrompt.js`
- `src/contexts/CortexContext.tsx`
- `src/services/cortexApiClient.ts`
- `src/cortex/`
- `src/components/AgentCoworker/`
- `src/components/AgentCoworker/panels/`
- `src/components/AgentCoworker/ModelSelector.tsx`
- `ai-first-configuration` / `ai-first-troubleshooting` skills
- `ai-first-skill.md`
- Existing controller API, configuration, authentication, and audit services
- Existing Cortex, Agent Coworker, and API tests

Inspect the Railway configuration and deployment setup without printing secret values. Do not commit credentials or reveal environment-variable values.

## Product objective

Replace the visible Cortex and AI functionality in the dashboard with a unified wireless operations assistant that can:

- Answer natural-language wireless questions using live controller evidence.
- Accept push-to-talk voice-to-text instructions.
- Maintain conversational context across follow-up questions.
- Investigate WLAN, VLAN, topology, Role, Profile, AP, client, RF, DHCP, and authentication state.
- Explain likely causes and recommend specific actions.
- Build deterministic WLAN configuration plans.
- Validate plans against live Campus Controller data.
- Show the exact planned changes.
- Require explicit operator approval.
- Provision through the existing API and AI-First execution rules.
- Read back every meaningful write.
- Verify actual WLAN broadcast and operational state on live Access Points.
- Report success, degraded state, partial failure, or failure accurately.
- Offer explicit rollback.
- Preserve a complete audit trail without storing secrets.

This must not become a generic chatbot, terminal wrapper, fake dashboard, unrestricted autonomous agent, or form-only workflow.

## Complete replacement scope

The existing implementation is reference material and reusable infrastructure only. Reuse proven API clients, authentication, controller proxying, model/provider integrations, evidence normalization, guardrails, tests, and domain logic where appropriate, but do not preserve the existing product boundaries when they conflict with this design.

The new AURA experience replaces:

- Visible Cortex conversational entry points.
- Existing Cortex wireless query presentation.
- Existing Agent Coworker panel content.
- Terminal and Ops tabs in the AURA panel.
- Terminal-oriented empty/loading/permission states.
- Fragmented Cortex, Agent Coworker, and voice state.
- Separate read-only and configuration conversations.

There must be:

- One primary AI entry point.
- One conversation/session model.
- One evidence model.
- One authorization path.
- One validation path.
- One approval path.
- One controller API boundary.
- One coherent voice and text workflow.

Do not create a second competing assistant.

Before editing, create a migration matrix mapping every current AI-related file, export, and consumer to one of:

- Migrate behind the new AURA interfaces.
- Refactor into the AURA architecture.
- Replace with a new implementation.
- Retain temporarily as an internal compatibility layer.
- Deprecate and remove after consumers migrate.

Do not leave duplicate visible entry points. Preserve backend services used elsewhere after tracing their consumers.

## Replace the existing AURA panel

Replace the current visible AURA coworker panel in its entirety. The current panel contains a model selector, Terminal tab, Ops tab, terminal content, and terminal-oriented status messaging.

Remove Terminal and Ops from the visible replacement panel. Do not put the new workflow inside either tab.

Preserve the existing outer shell and visual language where useful:

- Floating/docked placement.
- Dark enterprise styling.
- Minimize, maximize, pin, close, and resize behavior where supported.
- Responsive behavior and z-index behavior.
- Existing model/provider selector integration.

The replacement panel becomes the primary wireless configuration and operations workspace.

### New panel structure

The header should include:

- AURA identity.
- Model/provider selector.
- Provider/connection status.
- Current workflow status.
- Existing shell controls where applicable.

Do not show Terminal or Ops tabs.

The main workflow is:

1. Voice or text instruction.
2. Transcript review.
3. Intent interpretation.
4. Missing-information collection.
5. Live validation or read-only investigation.
6. Configuration preview.
7. Explicit approval.
8. Provisioning.
9. Closed-loop verification.
10. Completion, degraded state, rollback, or failure.

The initial state should show:

- “Tell AURA what wireless configuration you want.”
- A push-to-talk `Talk` button.
- Text input fallback.
- Current Organization, Site Group, and Site scope.
- Model/provider selector.
- A clear explanation that AURA previews and validates changes before configuring anything.

## Terminology and hierarchy

Use these terms consistently:

- Organization
- Site Group
- Site
- Access Point / AP
- Client
- WLAN
- SSID only for the WLAN broadcast name
- Role
- Profile
- Model Profile
- RRM

Respect:

`Organization > Site Group > Site > Access Point`

Every request must show explicit scope: Site, Site Group, or Global. Never infer Global scope silently.

## Push-to-talk voice-to-text

This requires speech-to-text, not an autonomous voice agent.

Use push-to-talk only:

1. Operator clicks `Talk`.
2. Request microphone permission if needed.
3. Begin recording and show `Listening`.
4. Operator clicks `Stop`, or the provider reports final speech.
5. Stop recording and immediately release the microphone.
6. Send the short recording to the configured speech-to-text adapter.
7. Display the final transcript in an editable field.
8. Never configure directly from raw speech.

Never use continuous listening, wake-word detection, background recording, or always-on microphone access.

Required states:

- `idle`
- `requesting_permission`
- `listening`
- `transcribing`
- `transcript_ready`
- `permission_denied`
- `unsupported`
- `error`
- `cancelled`

Create a provider-neutral adapter:

```ts
interface SpeechToTextProvider {
  transcribeAudio(input: AudioInput): Promise<SpeechTranscript>;
}

interface AudioInput {
  audio: Blob | Buffer;
  mimeType: string;
  language?: string;
  sampleRate?: number;
}

interface SpeechTranscript {
  text: string;
  isFinal: boolean;
  confidence?: number;
  language?: string;
  durationMs?: number;
  provider: string;
}
```

Prefer a server-side speech-to-text adapter for production reliability if deployment support exists. Inspect Railway and existing providers before selecting one. Browser-native recognition is acceptable only if the supported browser matrix makes it reliable.

If server-side transcription is used:

- Authenticate the user.
- Enforce maximum duration and upload size.
- Validate MIME type and audio format.
- Rate-limit requests.
- Do not log raw audio.
- Define and enforce temporary-audio retention.
- Delete audio after transcription unless retention is explicitly required.
- Keep provider keys server-side.
- Return provider failures explicitly.
- Never return a successful transcript when transcription failed.

Document provider configuration in `.env.example` with placeholders only, for example:

```text
SPEECH_TO_TEXT_PROVIDER=browser|server
SPEECH_TO_TEXT_MODEL=<provider-specific-model>
SPEECH_TO_TEXT_LANGUAGE=en-US
SPEECH_MAX_DURATION_SECONDS=60
SPEECH_MAX_UPLOAD_BYTES=<configured-limit>
SPEECH_AUDIO_RETENTION=discard
```

If no speech provider is configured, keep text input fully functional and show “Speech-to-text is not configured.” Do not fake transcription.

## Transcript and intent review

After transcription, show separate sections:

### What you said

The raw editable transcript.

### AURA interpreted

The structured interpretation:

- Action.
- Organization.
- Site Group.
- Site.
- Access Point scope.
- WLAN name.
- SSID.
- VLAN/topology.
- Security mode.
- Role.
- Profile.
- Model Profile.
- Schedule and timezone.

### Current controller state

Only show data retrieved from live APIs:

- Matching WLANs.
- Matching Sites and Site Groups.
- Existing topologies/VLANs.
- Existing Roles and Profiles.
- Existing AP assignments.
- Existing conflicts.

### Planned changes

Show exactly what would change if approved.

Any edit to the transcript, interpreted fields, scope, or planned changes invalidates previous validation and requires validation again.

## Typed intent and state

Use strict TypeScript interfaces and discriminated unions:

```ts
interface WirelessConfigurationIntent {
  action:
    | 'create_wlan'
    | 'update_wlan'
    | 'delete_wlan'
    | 'assign_wlan'
    | 'schedule_wlan'
    | 'validate_only';

  organizationId?: string;
  siteGroupId?: string;
  siteId?: string;
  accessPointIds?: string[];
  wlanName?: string;
  ssid?: string;
  vlanId?: number;

  security?: {
    mode:
      | 'open'
      | 'wpa2_personal'
      | 'wpa3_personal'
      | 'wpa2_enterprise'
      | 'wpa3_enterprise'
      | 'owe';
    credentialReference?: string;
  };

  roleId?: string;
  profileId?: string;
  modelProfileId?: string;

  schedule?: {
    type: 'always' | 'recurring' | 'one_time';
    days?: string[];
    startTime?: string;
    endTime?: string;
    timezone?: string;
  };

  requestedBy: string;
  source: 'voice' | 'text';
  rawInstruction: string;
}
```

The parser must return:

- Structured intent.
- Missing required fields.
- Ambiguities.
- Risk level.
- Human-readable interpretation.
- Read-only or mutating classification.

Ask for clarification rather than guessing missing or ambiguous Organization, Site Group, Site, WLAN, VLAN/topology, security, schedule, Role, Profile, Model Profile, or AP scope.

Never guess controller URLs, credentials, passwords, PSKs, topology IDs, Role IDs, Profile IDs, or VLAN IDs.

## Unified session and workflow

Use one authoritative session model:

```ts
type AssistantMode =
  | 'conversation'
  | 'read_only_investigation'
  | 'configuration_intake'
  | 'validation'
  | 'approval'
  | 'provisioning'
  | 'verification'
  | 'rollback';

interface WirelessAssistantSession {
  sessionId: string;
  mode: AssistantMode;
  messages: AssistantMessage[];
  activeScope: NetworkScope;
  pendingIntent?: WirelessConfigurationIntent;
  parsedIntent?: ParsedWirelessIntent;
  validationReport?: WirelessValidationReport;
  approval?: ApprovalState;
  provisioning?: ProvisioningState;
  verification?: VerificationState;
  lastEvidence?: EvidenceBundle;
  createdAt: string;
  updatedAt: string;
}
```

Use the workflow states:

- `idle`
- `capturing_voice`
- `entering_text`
- `transcribing`
- `missing_information`
- `validating`
- `validation_ready`
- `awaiting_approval`
- `provisioning`
- `verifying`
- `completed`
- `failed`
- `cancelled`

No write is allowed from validation, validation-ready, or approval states without explicit approval.

## Natural-language operational use cases

Support normal network-admin questions with live evidence. The operator should not need to know API paths or controller object names.

Understand references such as:

- “this network”
- “that Site”
- “the APs on the third floor”
- “the Guest WLAN”
- “the network I just created”
- “all APs at Boston Office”
- “the affected clients”
- “what changed recently?”

Resolve references using explicit selections, active Organization/Site Group/Site context, selected objects, pending intent, recent conversation context, and live lookup. If multiple matches exist, ask the operator to choose.

### Read-only questions

Support at least:

- What WLANs are configured at this Site?
- What SSIDs are currently broadcasting?
- What VLAN/topology is the Guest WLAN using?
- Which Role, Profile, or Model Profile does this WLAN use?
- Where is this WLAN deployed?
- Which APs are broadcasting or missing this WLAN?
- Which WLANs use VLAN 120?
- Is this WLAN enabled, hidden, or available on 6 GHz?
- How many clients are connected?
- Why is this WLAN not broadcasting?
- Why are clients authenticating but not receiving DHCP?
- Which APs are offline, overloaded, or unhealthy?
- Which APs have high utilization, retries, or poor signal?
- What changed in the last hour?
- Who changed this WLAN?
- Are there drift alerts?
- What is the biggest wireless problem at this Site or Site Group?
- Compare a WLAN across Sites.
- Show recent configuration changes and related events.

### Mutating requests

Support:

- Add a guest WLAN.
- Create a WLAN at a selected Site.
- Clone an existing WLAN.
- Deploy a WLAN to selected APs or a Profile.
- Change a WLAN VLAN/topology.
- Change WLAN security.
- Rotate a PSK through a secure credential workflow.
- Enable, disable, hide, or unhide a WLAN.
- Schedule a WLAN.
- Create a topology when explicitly requested.
- Remove a WLAN.
- Roll back a recently approved change.

Every mutation uses:

`parse intent -> resolve references -> inspect state -> validate -> preview -> explicit approval -> provision -> read back -> verify`

### Troubleshooting

Support:

- WLAN exists but is not on APs.
- Profile update succeeded but radio bindings were silently dropped.
- `radioIfList` contains an invalid index.
- WPA2 WLAN is missing from 6 GHz.
- Only some APs received the WLAN.
- Clients authenticate but do not receive DHCP.
- Clients cannot associate.
- APs have inconsistent Profile assignments.
- A topology or VLAN is missing from the deployment path.
- Wireless health degraded after a configuration change.

Cross-reference service state, Profile assignment, `radioIfList`, active radio slots, AP state, AP `services[]`, topology/VLAN state, client associations, DHCP state, authentication events, and audit/configuration changes.

## AI-First execution rules

The AI-First skills in the Obsidian vault are the wireless authority — `ai-first-configuration`
for anything that writes (and for proving the write landed), `ai-first-troubleshooting` for
diagnosis after that. They were one skill until 2026-09-11.

Follow its discipline:

1. Authenticate through existing secure API architecture.
2. Inspect current controller state.
3. Find a known-good WLAN/service template.
4. Mirror existing topology, Role, CoS, and payload conventions.
5. Build from the known-good template.
6. Create or update the WLAN/service.
7. Bind it to appropriate Profiles and radio interfaces.
8. Read back every write.
9. Wait for propagation where required.
10. Verify actual broadcast on live APs.

Critical rules:

- HTTP `201 Created` does not prove the WLAN was applied.
- XCC may silently drop invalid payload portions.
- Never use `radioIfList.index: 0`.
- Radio indexes are radio slots, not list positions.
- WPA2 may be silently dropped from 6 GHz; use WPA3-SAE or OWE where appropriate.
- Inspect existing services before constructing payloads.
- Do not invent topology, Role, Profile, or VLAN IDs.
- Verify Profile radio bindings after PUT.
- Verify the WLAN appears in live AP `services[]`.
- Preserve rollback behavior.
- Never echo or persist credentials or PSKs unnecessarily.

Prefer existing AI-First scripts and runbooks over ad-hoc API logic — the write-side ones live in
`ai-first-configuration/scripts/`, the diagnostic ones in `ai-first-troubleshooting/scripts/`.

## Validation and planning

Create a deterministic configuration planner between intent parsing and execution. It must:

1. Normalize the intent.
2. Resolve object references.
3. Load current state.
4. Select a known-good template.
5. Calculate exact before/after differences.
6. Determine affected Sites, Profiles, APs, radios, Roles, and topologies.
7. Detect conflicts.
8. Determine required checks.
9. Produce a stable plan hash.
10. Invalidate the plan when relevant inputs change.

```ts
interface WirelessValidationReport {
  intent: WirelessConfigurationIntent;
  checks: WirelessValidationCheck[];
  confidence: {
    score: number;
    band: 'LOW' | 'MEDIUM' | 'HIGH';
    blockingIssues: string[];
    warnings: string[];
  };
  recommendation: string;
  preProvisionSnapshot?: unknown;
  validationToken?: string;
  expiresAt?: string;
}
```

Validate, where relevant:

- Organization, Site Group, and Site existence.
- AP scope and availability.
- Existing WLAN conflicts.
- VLAN/topology existence.
- DHCP or relay availability.
- Switch/trunk path.
- AP model compatibility.
- WLAN limits.
- Profile and Model Profile compatibility.
- Role compatibility.
- Security and radio compatibility.
- RF/beacon overhead.
- Existing assignments and schedules.
- Controller health and drift.

Confidence:

- Below 60: block.
- 60–79: show warnings and require approval.
- 80–100: still require approval.
- Any blocking failure prevents provisioning.
- Controller/API failure fails closed.
- The LLM cannot override deterministic validation.

Use a stable plan hash and an expiring validation token. Approval and provisioning must prove they refer to the same plan.

## Approval and safety

Before every write, show:

- What the operator said.
- AURA’s interpretation.
- Current controller state.
- Exact planned changes.
- Organization, Site Group, Site, and AP scope.
- WLAN/SSID, VLAN/topology, security, Role, Profile/Model Profile, and schedule.
- Affected AP count.
- Validation evidence, warnings, blockers, confidence, and token expiry.

Provide:

- `Confirm and Configure WLAN at <Site>`
- `Talk to Confirm`
- `Cancel`
- `Edit`

Disable confirmation when required fields are missing, validation has not completed, blockers exist, token expired, scope changed, intent changed, or planned changes changed.

Voice confirmation is push-to-talk again. Display the new transcript and accept only clear phrases such as:

- “Confirm and configure.”
- “Approve this WLAN.”
- “Deploy this configuration.”

Ambiguous phrases such as “yes,” “okay,” “do it,” or “go ahead” require visible button confirmation.

## Tool architecture

Organize tools into:

### Read-only

Organizations, Site Groups, Sites, APs, AP health/radios, WLANs, WLAN assignments/stations/reports, Profiles, Model Profiles, Roles, topologies, clients, events, audit logs, drift, RF, DHCP, and LLDP topology.

### Planning

Intent parsing, reference resolution, known-good template lookup, configuration planning, affected-scope calculation, impact estimation.

### Validation

Intent, topology, VLAN reachability, DHCP, Profile compatibility, radio compatibility, security compatibility, WLAN limits, deployment scope, and validation-token creation.

### Mutating

Create/update/delete WLAN, assign/remove WLAN from Profiles, update radio bindings, create/update/delete topology, schedule/unschedule WLAN, and rollback.

### Verification

Read back WLAN/Profile state, verify radio bindings, assignments, AP broadcast, client association, DHCP, authentication, and final outcome.

Every tool declares category, schemas, approval requirement, validation-token requirement, and supported scopes. Reject invalid category transitions. Mutating tools cannot execute without authorization, matching plan hash, explicit approval, and an unexpired validation token.

## Authorization

Respect authenticated operator permissions and controller/tenant boundaries. LLM output is never authorization.

Before every mutation:

```ts
interface ActionAuthorization {
  allowed: boolean;
  action: string;
  scope: NetworkScope;
  reason?: string;
  requiresApproval: boolean;
  requiredPermission?: string;
}
```

Block actions when permission, controller scope, or target scope is unknown, or when the action attempts to bypass validation or approval.

## Real data only

Never fake production behavior or use realistic-looking fallback data:

- No invented WLANs, VLANs, AP serials, client counts, health scores, controller responses, validation passes, progress, or broadcast verification.
- If live data is unavailable, show the actual state: controller unavailable, authentication required, no data, provider unavailable, validation incomplete, or verification incomplete.
- Test fixtures are allowed only in explicitly isolated tests and development fixtures. They must never be returned by production routes or silently replace failed live calls.

The LLM may interpret and summarize evidence but may not invent API results, success, authorization, or configuration state.

## Railway and provider integration

Inspect Railway services, deployment configuration, runtime, health checks, logs/configuration, current environment-variable names, API proxy, CORS, and LLM setup without revealing secret values.

Before adding a speech provider:

1. Check whether a compatible provider already exists.
2. Confirm server-side support.
3. Confirm Railway runtime/package support.
4. Confirm privacy and retention behavior.
5. Document required variable names in `.env.example`.
6. Do not activate a paid provider blindly.
7. Make provider failures visible.

Never expose Railway, controller, LLM, or speech credentials in browser code, `VITE_` variables, logs, commits, prompts, transcripts, or audit records.

## Audit

Record append-only or durable audit events for validation and mutations:

- Session/conversation ID.
- Operator.
- Organization, Site Group, Site, and controller.
- Redacted raw instruction and transcript source.
- Parsed intent and resolved references.
- Plan and plan hash.
- Validation checks/evidence references/confidence.
- Approval method and timestamp.
- Provisioning and read-back results.
- Verification, rollback, errors, duration, and correlation ID.

Never store passwords, PSKs, bearer tokens, API keys, raw audio unless explicitly required, or unredacted sensitive responses.

## UI components

Reuse existing shell, model selector, dialog, drawer, button, status, API client, context, and reducer patterns. Create focused components only where needed:

- `VoiceInputControl`
- `TranscriptReview`
- `WirelessIntentSummary`
- `ScopeBreadcrumb`
- `ValidationProgress`
- `ValidationReport`
- `ConfigurationPreview`
- `ApprovalControls`
- `ProvisioningProgress`
- `VerificationResult`

Keep API calls and workflow transitions outside presentation components. Include loading, empty, error, unsupported, permission-denied, cancelled, expired-token, partial-failure, and completed states.

## Prepared scenarios

Support and test these workflows with real adapters and isolated fixtures only:

1. “What VLAN is the Guest WLAN using?”
2. “Add a guest WLAN at Boston Office using the existing guest topology and deploy it to all APs.”
3. “Create a new WLAN.” (Ask for missing fields.)
4. “Can I create WPA2 on VLAN 120 and enable it on 6 GHz?” (Explain compatibility; no write.)
5. Clone an existing WLAN with a changed schedule.
6. Diagnose a WLAN missing from AP-03.
7. Diagnose clients authenticating but not receiving DHCP.
8. Compare a WLAN across two Sites.
9. Find changes before a WLAN stopped working.
10. Deploy only to selected third-floor APs.
11. Change WLAN security after showing impact.
12. Roll back a recently approved change after separate approval.
13. Schedule an event WLAN with an explicit timezone.
14. Continue a multi-turn request without losing pending intent.
15. Identify the largest current wireless issue across a Site Group.

## Tests

Add or update tests for:

- Voice state transitions, permission denial, unsupported provider, cancellation, and transcript editing.
- Intent parsing, missing fields, ambiguity, reference resolution, and scope enforcement.
- Real-data failure states.
- Validation failures and controller/API failure.
- Plan hash changes and expired tokens.
- Approval gating and ambiguous voice confirmation.
- Radio index 0 rejection.
- WPA2/6 GHz compatibility.
- Partial provisioning, read-back failure, verification failure, and explicit rollback.
- Unified session state and follow-up context.
- No secret leakage.

## Implementation process

1. Inspect the existing code, vault skill, Railway deployment, current Cortex capabilities, wireless tools, guardrails, and panel structure.
2. Report the migration matrix and safest extension points.
3. Implement the new AURA shell and unified workflow, not a parallel chatbot.
4. Build the smallest complete vertical slice: text intake, typed intent, live validation, preview, approval, provisioning, read-back, and verification.
5. Add push-to-talk speech-to-text through an adapter and keep text fully functional without it.
6. Migrate read-only Cortex investigation and evidence capabilities.
7. Remove visible Terminal/Ops/Cortex duplication after tracing consumers.
8. Add safety-critical tests and update documentation/environment examples.
9. Run the smallest relevant existing tests, lint, type-check, and build.
10. Do not modify unrelated features or claim unsupported integrations are complete.

## Definition of done

The rebuild is complete only when AURA Network Intelligence is the single visible AI experience:

1. The operator opens AURA from the dashboard.
2. The operator asks a live read-only question by text or push-to-talk voice.
3. AURA returns evidence-backed results and contextual follow-ups.
4. The operator starts a WLAN operation by text or voice.
5. The transcript and structured intent are editable.
6. Organization > Site Group > Site > AP scope is visible.
7. Current controller state and exact before/after changes are visible.
8. Validation is live, deterministic, and fail-closed.
9. Approval is explicit by button or clear second push-to-talk confirmation.
10. Execution follows AI-First known-good-template and radio-binding rules.
11. Every meaningful write is read back.
12. Live AP broadcast and operational state are verified.
13. Success, degraded, partial, and failure states are honest and recoverable.
14. Rollback requires separate approval.
15. The operator can continue asking normal network-admin questions afterward.

The implementation is not complete if it merely adds voice to the existing Cortex UI, uses fake production data, claims success without verification, bypasses the controller proxy, performs unvalidated writes, or leaves separate visible Cortex, Agent Coworker, Terminal, or Ops experiences.
