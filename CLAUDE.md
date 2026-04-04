# AURA - Autonomous Unified Radio Agent

Enterprise network monitoring platform for Extreme Networks Campus Controller.

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
src/
  components/              250+ React TSX components
  services/                47 service files (API, data, business logic)
  hooks/                   30+ custom React hooks
  contexts/                3 React Context providers (App, Persona, Site)
  types/                   TypeScript interfaces (api, network, system, policy, table, domain, deployment, globalElements)
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
- **Current coverage: <5% -- this is a critical gap**
- When adding features or fixing bugs, write tests
- Prioritize testing services and hooks over pure UI components

## Common Pitfalls

- Token refresh race conditions: `apiService` handles this with a refresh lock -- do not implement separate refresh logic
- Multi-controller: always pass `X-Controller-URL` header when the user has selected a non-default controller
- Lazy routes: every new route must use `React.lazy()` + `Suspense` with `PageSkeleton` fallback
- State mutations: contexts use `useReducer` -- dispatch actions, do not mutate state directly
- API field projection: use the query builder to request only needed fields to reduce payload size
