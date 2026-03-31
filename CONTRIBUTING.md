# Contributing to AURA

Thank you for contributing to AURA! This guide will help you get set up and understand our development workflow.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Workflow](#development-workflow)
3. [Code Standards](#code-standards)
4. [Testing](#testing)
5. [Commit Guidelines](#commit-guidelines)
6. [Pull Request Process](#pull-request-process)
7. [Common Tasks](#common-tasks)

---

## Getting Started

### Prerequisites

- **Node.js:** 18+
- **npm:** 9+
- **Git:** 2.30+

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/thomassophiea/AURA.git
   cd AURA
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create `.env` file:**
   ```bash
   cp .env.example .env
   ```

4. **Configure environment variables:**
   ```env
   CAMPUS_CONTROLLER_URL=https://campus.example.com/api
   CORS_ORIGINS=http://localhost:3000
   NODE_ENV=development
   ```

5. **Start development server:**
   ```bash
   npm run dev
   ```

---

## Development Workflow

### Branch Strategy

We use **feature branches** for all development:

1. **Create a branch** from `main`:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/my-feature
   ```

2. **Branch naming:**
   - `feat/` – new features
   - `fix/` – bug fixes
   - `docs/` – documentation
   - `refactor/` – refactoring
   - `test/` – tests
   - `chore/` – config, dependencies

3. **Keep branch updated:**
   ```bash
   git fetch origin && git rebase origin/main
   ```

---

### Local Development

```bash
npm run dev         # Start dev server
npm run build       # Build for production
npm run preview     # Preview build
npm run lint        # Run linter
npm run test        # Run tests
```

---

## Code Standards

### TypeScript

- Enable **strict mode**
- Use explicit types
- Avoid `any` without justification

### React Components

**Naming:** PascalCase
```typescript
export function AccessPoints() { }  // ✅ Good
```

**Keep small:** < 300 lines  
**Use React.memo** for expensive renders

### Styling

Use **Tailwind CSS:**
```typescript
// ✅ Good
<div className="flex items-center gap-2">

// ❌ Bad
<div style={{ display: 'flex', gap: '8px' }}>
```

### Comments

Only when necessary – explain **why**, not **what**:
```typescript
// ✅ Good – explains purpose
const maxRetries = 3; // Prevents infinite retry loops

// ❌ Bad – obvious
const name = user.name; // Get the user's name
```

---

## Testing

### Test Coverage Goals

- Services: 80%+
- Hooks: 80%+
- Components: 50%+
- Overall: 60%+

### Running Tests

```bash
npm run test           # Run all tests
npm run test:ui        # Interactive UI
npm run test:coverage  # Coverage report
```

---

## Commit Guidelines

### Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

**Examples:**
```bash
git commit -m "feat(api): add rate limiting to endpoints"
git commit -m "fix(auth): prevent token refresh on 401"
git commit -m "docs: update SECURITY.md"
```

### Rules

- Keep commits **atomic** (one logical change)
- Each commit should compile and pass tests
- No mixing features with refactoring

---

## Pull Request Process

1. **Push your branch:**
   ```bash
   git push origin feat/my-feature
   ```

2. **Open PR on GitHub** with description

3. **PR Checklist:**
   - [ ] Tests pass (`npm run test`)
   - [ ] Linter passes (`npm run lint`)
   - [ ] Build succeeds (`npm run build`)
   - [ ] Documentation updated
   - [ ] No hardcoded credentials
   - [ ] Commits follow guidelines

4. **Address review feedback** before merging

---

## Common Tasks

### Add a New Component

```typescript
// src/components/MyComponent.tsx
export function MyComponent() {
  return <div>Content</div>;
}
```

### Add a New API Service

```typescript
// src/services/myService.ts
export async function getMyData(): Promise<MyData[]> {
  return apiClient.get('/my-endpoint');
}
```

### Add a New Route

1. Create component in `src/components/`
2. Add route to `src/App.tsx`
3. Update navigation in `src/config/navigationScopes.ts`

---

## Getting Help

- **Documentation:** See [README.md](./README.md)
- **Best Practices:** See [BEST_PRACTICES.md](./BEST_PRACTICES.md)
- **Security:** See [SECURITY.md](./SECURITY.md)
- **Issues:** Check GitHub issues
- **Questions:** Open a discussion

---

**Maintained By:** AURA Team  
**Last Updated:** 2026-03-31
