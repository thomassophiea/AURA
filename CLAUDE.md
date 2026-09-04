# AURA - Autonomous Unified Radio Agent

Enterprise network monitoring platform for Extreme Networks Campus Controller.

@.aura-session.md

## Knowledge base

Before answering "does the controller support X" / "what does epic Y cover" / "is X in scope" questions, or building against a Campus Controller feature, check the **2027 Obsidian Vault** (`../../2027 Obsidian Vault/`, sibling of this repo's parent folder) — it holds the real controller feature catalog, the API index, the Ascend Jira epics, and the scope rulings (deprecated/deferred/owned-elsewhere) that this platform is built against. See the `ascend-vault` skill for the routing, or start at the vault's `00-Index.md`.


## Stack

- **Frontend:** React 19, TypeScript 5.7 (strict), Vite 7, Tailwind CSS, Radix UI, Lucide React icons
- **Backend:** Express proxy server (`server.js`), port 3000
- **State:** React Context + useReducer (AppContext, PersonaContext, SiteContext)
- **Auth:** grantType/userId/password/scope -> tokens in localStorage, auto-refresh on 401
- **Optional:** Supabase integration (workspace persistence, future features)
- **Deploy:** Railway, Docker, or traditional Node

## Architecture

```
Browser -> Express (port 3000) -> Campus Controller API (/api/management)
                                -> XIQ Cloud API (xiqService.ts)
```

- Multi-controller support via `X-Controller-URL` request header
- Proxy pattern: frontend calls `/api/management/*`, Express forwards to controller
- In dev mode, frontend may call controller directly (base URL switches in apiService)
- 40+ lazy-loaded routes with Suspense + PageSkeleton fallback
- Dark/light themes via next-themes

## Directory Structure

```
server.js                  Express proxy server
server/
  cortex/                  AURA Cortex pipeline modules (intent, tools, wireless query)
    wirelessIntentParser.js    Deterministic text/voice -> typed WirelessConfigurationIntent
    wlanProvisioningEngine.js  Mirror-then-deviate WLAN create + radio binding + verification
    validationToken.js         Signed plan-hash tokens (create_wlan approval gate)
    groqSpeechToText.js        Optional server-side push-to-talk adapter (Groq Whisper)
  cortexOrchestrator.js    Session & LLM round-trip management
  cortexLlmProvider.js     Multi-provider LLM factory
  cortexModelRegistry.js   Model/provider discovery & registration
  consoleShell.js          SSH PTY WebSocket server (AURA Console; not surfaced in the AURA panel)
  validationEngine/        Network intent validation & drift detection
    wlanConfigValidator.js     Full WirelessValidationReport (site/AP/VLAN/radio checks + plan hash)
src/
  components/              250+ React TSX components
    AgentCoworker/         AURA workspace slideout — one unified workflow, no Terminal/Ops tabs
      wireless/                WirelessAssistantPanel + its sub-components (voice, transcript,
                                validation, preview, approval, provisioning, verification)
  cortex/                  AURA Cortex UI components (AnswerCard, FollowUpChips, etc.)
  contexts/
    CortexContext.tsx       Read-only investigation state (messages, session, page context)
  hooks/
    useCortexModel.ts       Multi-provider model picker hook
    useWirelessAssistant.ts WLAN-configuration workflow state machine (intake -> approval -> verify)
    useVoiceInput.ts        Push-to-talk (browser SpeechRecognition or server MediaRecorder+Groq)
  services/
    cortexApiClient.ts      HTTP client for /api/cortex/* routes
  types/
    cortex.ts               CortexPageContext, CortexPageType, CORTEX_PAGE_NAMES
    wirelessAssistant.ts     WirelessConfigurationIntent, WirelessValidationReport, NetworkScope
  services/                47 service files (API, data, business logic)
  hooks/                   30+ custom React hooks
  lib/                     Utilities & helpers
  config/                  Configuration & constants
  test/                    Test setup & fixtures
```

## Code Conventions

### Components
- PascalCase file and component names
- Max ~300 lines per component; split if larger
- `React.memo` for expensive renders
- Props typed with TypeScript interfaces (no inline prop types)
- Radix UI primitives for all interactive elements (dialogs, dropdowns, tooltips, etc.)
- Tailwind CSS utilities only -- no inline styles, no CSS modules
- Path alias: `@/*` maps to `src/*`

### TypeScript
- All interfaces PascalCase
- Optional fields use `?` operator
- Discriminated unions for status enums
- No `any` without justification comment
- Key type files by size: `api.ts` (23KB), `network.ts` (17KB), `system.ts` (13KB), `policy.ts` (11KB), `table.ts` (10KB)

### Formatting
- ESLint + Prettier enforced
- 2-space indent, single quotes, 100 char line width, trailing comma es5
- Accessibility: jsx-a11y ESLint rules + Radix UI primitives

### Git
- Conventional commits: `feat(scope):`, `fix(scope):`, `docs:`, `refactor:`, `test:`, `chore:`
- Branch naming: `feat/`, `fix/`, `docs/`, `refactor/`, `test/`, `chore/`

## Key Services

| Service | Purpose |
|---|---|
| `api.ts` (~400 lines) | HTTP client singleton, auth, token refresh, query builder, retry with exponential backoff, error categorization (network/timeout/server/auth), API call logging (500-cap) |
| `errorHandler.ts` | Error categorization, user-friendly messages |
| `cache.ts` | In-memory TTL cache |
| `driftDetectionService.ts` | Config change detection |
| `sleCalculationEngine.ts` | SLE metrics (uptime, latency, packet loss) |
| `globalElementsService.ts` | Template CRUD with variable substitution |
| `tenantService.ts` | Org/site-group/site hierarchy loading |
| `workspacePersistence.ts` | Widget configs (localStorage or Supabase) |
| `xiqService.ts` | XIQ Cloud API integration |

## Key Hooks

| Hook | Purpose |
|---|---|
| `useGlobalFilters()` | Site, timeRange, environment filters |
| `useWorkspace()` | Widget catalog, saved widget configs |
| `useAppContext()` | Org/site-group/site selection state |
| `useRealtimePolling()` | Polling with exponential backoff |
| `useDriftDetection()` | Config change monitoring |
| `useDeviceDetection()` | Mobile vs desktop layout |
| `useKeyboardShortcuts()` | cmd/ctrl+k and other shortcuts |

## API Patterns

- All API calls go through the `apiService` singleton in `src/services/api.ts`
- Base URL: `/api/management` in production (proxied), direct controller URL in dev
- Query builder supports field projection, pagination, sorting
- Retry logic: exponential backoff on transient failures
- 401 responses trigger automatic token refresh, then retry the original request
- API call logging is fire-and-forget with a 500-entry cap

## Environment Variables

**Required:**
- `CAMPUS_CONTROLLER_URL` -- target Campus Controller base URL
- `ALLOWED_ORIGINS` or `CORS_ORIGINS` -- CORS whitelist

**Optional:**
- `NODE_ENV` -- development/production
- `PORT` -- server port (default: 3000)
- `LOG_LEVEL` -- logging verbosity
- `RATE_LIMIT_WINDOW_MS` -- rate limit window (default: 900000)
- `RATE_LIMIT_MAX_REQUESTS` -- max requests per window (default: 100)

**LLM provider keys (any subset — picker shows whatever is configured):**
- `ANTHROPIC_API_KEY` -- Claude (Sonnet 4.6, Opus 4.7, Haiku 4.5)
- `OPENAI_API_KEY` -- GPT-4o family
- `GROQ_API_KEY` (`gsk_…`) -- Llama 3.x, Mixtral, GPT-OSS via Groq Cloud
- `GROK_API_KEY` (`xai-…`) -- xAI Grok 3 / Grok 3 Mini
- `GEMINI_API_KEY` -- Google Gemini 2.0 Flash / 1.5 Pro (free tier)
- `MISTRAL_API_KEY` -- Mistral Small / 7B / Large
- `CEREBRAS_API_KEY` -- Cerebras-hosted Llama 3.3 70B / 3.1 8B (ultra-fast)
- `DEEPSEEK_API_KEY` -- DeepSeek V3 / R1 reasoner (~$0.14/M tok)
- `OLLAMA_ENABLED=true` and/or `OLLAMA_API_BASE=http://192.168.100.177:11434/v1` -- local Ollama on redq box

**AURA Cortex (AI agent engine) overrides:**
- `CORTEX_LLM_PROVIDER` -- force a specific provider (`openai`, `anthropic`, `groq`, etc.; default: auto-detect from API keys)
- `CORTEX_LLM_MODEL` -- force a default model ID (overrides registry default)

**AURA push-to-talk speech-to-text (optional):**
- `SPEECH_TO_TEXT_PROVIDER` -- `browser` (default, Web Speech API, no server component) or `server` (Groq Whisper via `POST /api/cortex/speech/transcribe`, requires `GROQ_API_KEY`)
- `SPEECH_MAX_DURATION_SECONDS` / `SPEECH_MAX_UPLOAD_BYTES` -- server-provider limits (default 60s / 8MB)

**Identity / session signing:**
- `SESSION_SECRET` -- HMAC secret for signed session cookies and WLAN-provisioning validation tokens (`server/identity/sessionService.js`, `server/cortex/validationToken.js`). Without it a random per-boot secret is used, so sessions and any pending validation tokens don't survive a restart.

**Security rule:** NEVER use `VITE_` prefixed variables for credentials or secrets. Vite exposes these in the browser bundle.

## Security

- Helmet middleware for HTTP security headers
- Rate limiting on all `/api/*` routes
- CORS validation against `ALLOWED_ORIGINS`
- Auth tokens stored in localStorage (cookie migration planned)
- TLS verification disabled in dev only (`NODE_TLS_REJECT_UNAUTHORIZED`)

## Scripts

```bash
npm run dev              # Start dev server
npm run build            # Production build
npm run start            # Start production server
npm run test             # Run tests
npm run test:watch       # Tests in watch mode
npm run test:coverage    # Coverage report
npm run test:ui          # Vitest UI
npm run lint             # ESLint check
npm run lint:fix         # ESLint auto-fix
npm run format           # Prettier format
npm run format:check     # Prettier check
npm run type-check       # TypeScript type checking
```

## Testing

- **Framework:** Vitest + React Testing Library + jsdom
- **Coverage provider:** v8
- ~3,200 unit tests across ~270 files. The baseline is green — a failure is a
  real signal, not background noise
- Node 25 defines a built-in `localStorage` global that shadows jsdom's and has
  none of the Storage methods. `src/test/setup.ts` installs a working one when
  the ambient global is unusable; the runtime image is node:22-alpine, which is
  unaffected
- `.claude/worktrees/**` is excluded in `vitest.config.ts` -- collecting it runs
  every suite three or four extra times against stale branches
- When adding features or fixing bugs, write tests
- Prioritize testing services and hooks over pure UI components
- **End-to-end validation lives outside this repo.** Real browser, API, schema,
  collector, portal, gateway and environment-isolation tests run in AURA-QA
  (`thomassophiea/AURA-Pipeline`) against the deployed Integration build. See
  [docs/QA_AND_RELEASE.md](docs/QA_AND_RELEASE.md); add browser scenarios there,
  not here

## Common Pitfalls

- Token refresh race conditions: `apiService` handles this with a refresh lock -- do not implement separate refresh logic
- Multi-controller: always pass `X-Controller-URL` header when the user has selected a non-default controller
- Lazy routes: every new route must use `React.lazy()` + `Suspense` with `PageSkeleton` fallback
- State mutations: contexts use `useReducer` -- dispatch actions, do not mutate state directly
- API field projection: use the query builder to request only needed fields to reduce payload size
