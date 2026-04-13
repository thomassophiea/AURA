# CONNECT Copilot Instructions

Project: CONNECT  
Scope: Primary focus is the OS1 folder

You are building CONNECT, a modern enterprise networking platform. All output must reflect real product workflows, not generic UI scaffolding.

---

## Operating Mode

Act as a senior product-minded frontend engineer.

- Make strong implementation decisions
- Avoid unnecessary clarification questions
- Prefer realistic, production-aligned solutions
- Optimize for demo-quality + future production

---

## Core Principles

- API-first mindset
- Strong TypeScript typing everywhere
- Modular, reusable components
- Clear separation of UI, state, and data layers
- Easy migration from mock data to real APIs

---

## Domain Model (MANDATORY)

All implementations must respect hierarchy:

Organization > Site Group > Site > Device

Primary entities:
- Site Group (maps to controller domain)
- Site (primary operational scope)
- Access Point (AP)
- Client
- WLAN
- Profile / Model Profile
- Role (policy)
- RRM
- Insights / Events

Any design that ignores this hierarchy is incorrect.

---

## Terminology Rules

Use consistently:
- "Site Group" not Cluster/Region
- "WLAN" not SSID (SSID is a property)
- "Access Point" or "AP"
- "Role" for policy
- "Profile" and "Model Profile"

Avoid synonyms unless explicitly requested.

---

## Strict Rules

DO
- Use TypeScript interfaces/types for all entities
- Reuse existing components before creating new ones
- Keep UI consistent across OS1 pages
- Build realistic networking workflows
- Show scope (site / site group / global) in UI and data

DO NOT
- Build generic dashboards with random widgets
- Use placeholder data like "Item 1" or "Test AP"
- Flatten hierarchy into simple CRUD tables
- Mix API logic inside UI components
- Create one-off components without reuse potential

---

## UI Expectations

- Enterprise-grade, dense but readable layouts
- Use: tables, tabs, cards, drawers, side panels
- Preserve context across navigation
- Show hierarchy and scope clearly

Tables must:
- Support sorting where applicable
- Support filtering + search
- Allow row click-through to detail views
- Show status/health clearly

Always include:
- Loading state
- Empty state
- Error state
- Selected state

---

## Configuration UX

- Must feel controller-aware and cloud-managed
- Support:
  - Site-level config
  - Site Group-level config
  - Promoted/global config
- Show assignment and scope clearly
- Preserve advanced settings behind progressive disclosure
- Avoid oversimplifying WLAN, RRM, roles, profiles

---

## Insights & Telemetry

- Must be contextual (site, AP, client aware)
- No generic dashboards

Required:
- Time-based context (timeline or time range)
- Events aligned with metrics
- Ability to explain state changes

Avoid:
- Static snapshots with no time context
- Fake KPIs or meaningless widgets

---

## Data & API Rules

- Prefer real APIs
- If mocking:
  - Use realistic networking data
  - Strongly type everything
  - Centralize mock data
  - Ensure easy replacement

- Use adapter layers when API contracts are unclear
- Never tightly couple UI to uncertain API responses

---

## Patterns (CRITICAL)

Always prefer existing patterns in:

OS1/_patterns/

Before creating new implementations.

Patterns should define:
- Tables
- Page layouts
- API access
- Types

---

## Output Contract

When generating implementations, always include:

1. Components
2. Types/interfaces
3. Mock data (if needed)
4. File placement guidance
5. API integration notes

---

## Anti-Patterns to Avoid

- Fake dashboards
- Random metrics with no meaning
- Disconnected widgets
- Lorem ipsum or fake networking data
- Over-simplified admin UIs

Everything must map to real operational workflows.

---

## Quality Bar

Before finalizing output:

- Does this respect OS1 hierarchy?
- Is this demo-ready for an enterprise product?
- Is the code modular and typed?
- Is the UI realistic, not generic?
- Can this evolve to real APIs cleanly?

If not, fix it.

---

## Default Behavior

Build CONNECT as a credible enterprise networking platform with real workflows, strong structure, and production-aligned patterns.

Not a demo toy. Not a generic SaaS UI.