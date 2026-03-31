# AURA – Network Monitoring Platform

**Autonomous Unified Radio Agent** - Enterprise wireless network management and monitoring for Extreme Networks Campus Controller.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-blue.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.4-purple.svg)](https://vitejs.dev/)

**⚠️ SECURITY NOTICE:** Before production deployment, review [SECURITY.md](./SECURITY.md). Critical security issues must be addressed.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Features](#features)
4. [Architecture](#architecture)
5. [Development](#development)
6. [Documentation](#documentation)
7. [Security](#security)
8. [Support](#support)

---

## 🌟 Overview

AURA is an enterprise-grade network monitoring platform that provides comprehensive control over Extreme Networks wireless infrastructure.

**Core Capabilities:**

- 🎯 **Real-time Monitoring** – Live metrics for 1000+ access points and clients
- 📊 **Advanced Analytics** – Application insights, traffic analysis, AI-powered trends
- ⚙️ **Configuration Management** – Sites, networks, policies, device provisioning
- 🛡️ **System Tools** – Backup, licensing, firmware, diagnostics, security, events
- 🎨 **Professional UI** – Modern gradient design with dark/light themes

**Platform:**
- **Frontend:** React 18+ with TypeScript, Vite, Tailwind CSS
- **Backend:** Node.js with Express proxy to Campus Controller API
- **Database:** Supabase (optional)
- **Deployment:** Railway, Docker, or traditional servers

---

## 🚀 Quick Start

### Prerequisites

- **Node.js:** 18.20+
- **npm:** 9+
- **Campus Controller:** 10.x+ with API access

### Setup

```bash
# Clone repository
git clone https://github.com/thomassophiea/AURA.git
cd AURA

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Campus Controller URL

# Start development server
npm run dev

# Open browser
# http://localhost:3000
```

### Environment Variables

**Required:**
```env
CAMPUS_CONTROLLER_URL=https://campus.example.com/api
CORS_ORIGINS=http://localhost:3000
```

**Recommended (Production):**
```env
NODE_ENV=production
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

See [BEST_PRACTICES.md](./BEST_PRACTICES.md) for complete configuration guide.

---

## ✨ Features

### Dashboard & Monitoring
- **Service Levels Dashboard** – Real-time network health with timeline navigation
- **Network Rewind** – Travel back in time with historical metrics playback
- **App Insights** – Application-level traffic analytics
- **Client/AP Insights** – Connected devices monitoring
- **Report Widgets** – Customizable analytics dashboard
- **Compliance Reporting** – PCI DSS and security compliance

### Configuration Management
- **Sites** – Multi-site network topology
- **Networks (WLANs)** – SSID and WLAN configuration
- **Policies** – QoS, firewall, application control
- **AAA** – RADIUS, 802.1X, guest authentication
- **Adoption Rules** – Automated device provisioning

### System Administration
- **Backup Manager** – Configuration backup and restore
- **License Management** – License tracking and installation
- **Firmware Manager** – Bulk AP firmware upgrades
- **Network Diagnostics** – Ping, traceroute, DNS tools
- **Events & Alarms** – Real-time event monitoring
- **Security Dashboard** – Rogue AP detection
- **Guest Management** – Temporary wireless access

### Advanced Tools
- **RF Management** – Channel optimization, power level control
- **Packet Capture** – Live traffic analysis
- **Device Upgrade** – Firmware distribution
- **Global Elements** – Organization-level configuration
- **Drift Detection** – Configuration change monitoring

---

## 🏗️ Architecture

### Frontend Stack
- **Framework:** React 18 with TypeScript (strict mode)
- **Styling:** Tailwind CSS
- **UI Components:** Radix UI primitives
- **Routing:** React Router with lazy loading
- **State Management:** React Context + useReducer
- **Data Fetching:** React Query patterns (custom implementation)

### Backend Stack
- **Runtime:** Node.js (18.20+)
- **Server:** Express.js
- **Proxy:** http-proxy-middleware to Campus Controller API
- **Middleware:** CORS, helmet, rate limiting, compression
- **Database:** Optional Supabase integration

### Code Organization

```
src/
├── components/          # React components (40+)
├── contexts/            # React Context providers
├── hooks/               # Custom hooks (useWorkspace, useDriftDetection, etc.)
├── services/            # API services and business logic
├── types/               # TypeScript interfaces
├── lib/                 # Utilities and helpers
├── config/              # App configuration and constants
└── App.tsx              # Root component
```

### Performance

- **Code Splitting:** 40+ routes with lazy loading (~70% smaller initial bundle)
- **Prefetching:** Critical components pre-imported 2s after load
- **Memoization:** useMemo/useCallback on expensive components
- **Caching:** Immutable assets (1-year expiry), no-store HTML

---

## 💻 Development

### Available Scripts

```bash
npm run dev              # Start development server (http://localhost:3000)
npm run build            # Build for production
npm run preview          # Preview production build
npm run lint             # Run ESLint
npm run test             # Run tests with Vitest
npm run test:ui          # Interactive test UI
npm run test:coverage    # Coverage report
npm run typecheck        # Check TypeScript types
```

### Development Workflow

1. **Create a feature branch:** `git checkout -b feat/my-feature`
2. **Make changes** and test locally
3. **Run linter & tests:** `npm run lint && npm run test`
4. **Commit with message:** `git commit -m "feat(scope): description"`
5. **Open pull request** on GitHub
6. **Address review feedback** and merge

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

### Code Standards

- **TypeScript:** Strict mode enabled, explicit types
- **React:** Hooks-based, PascalCase components, <300 lines per component
- **Styling:** Tailwind CSS utilities
- **Testing:** Vitest with React Testing Library
- **Commits:** Conventional Commits format

---

## 📚 Documentation

### Essential Documents

| Document | Purpose |
|----------|---------|
| [BEST_PRACTICES.md](./BEST_PRACTICES.md) | Code standards, performance, accessibility, testing |
| [SECURITY.md](./SECURITY.md) | Security procedures, known issues, pre-production checklist |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Development workflow, testing, commit guidelines |
| [.env.example](./.env.example) | Environment variable template |

### Additional Resources

- **Architecture:** See `src/` directory structure and component organization
- **API Integration:** See `src/services/api.ts` and Campus Controller API docs
- **Testing:** See `src/services/logger.test.ts` for test examples
- **Styling:** See Tailwind CSS documentation and `src/App.tsx` for theme implementation

---

## 🔒 Security

### ⚠️ Pre-Production Requirements

AURA has known security issues that **MUST** be addressed before production:

| Issue | Priority | Status |
|-------|----------|--------|
| CORS configuration | CRITICAL | ⚠️ Needs fixing |
| Missing security headers | CRITICAL | ⚠️ Needs helmet |
| No rate limiting | HIGH | ⚠️ Needs implementation |
| Auth tokens in localStorage | HIGH | ⚠️ Needs cookie migration |
| Hardcoded backend URL | MEDIUM | ⚠️ Needs fixing |
| TLS verification disabled | MEDIUM | ⚠️ Needs enabling |

**See [SECURITY.md](./SECURITY.md) for:**
- Detailed issue descriptions
- Mitigation steps
- Pre-production checklist
- Vulnerability reporting procedure

### Security Best Practices

- ✅ Environment variables for all sensitive config
- ✅ Input validation and output escaping
- ✅ HTTPS/TLS encryption in transit
- ✅ Error boundary for crash prevention
- ✅ ESLint with accessibility rules
- ⚠️ Low test coverage (<5%) – expand before production
- ⚠️ No structured error logging – add Sentry/Datadog

---

## 🚀 Deployment

### Railway (Recommended for Quick Start)

```bash
# Connect GitHub repository to Railway
# Add environment variables in Railway dashboard
# Deploy from main branch
```

### Docker

```bash
docker build -t aura:latest .
docker run -p 3000:3000 \
  -e CAMPUS_CONTROLLER_URL=https://campus.example.com \
  -e CORS_ORIGINS=https://aura.example.com \
  aura:latest
```

### Traditional Server

```bash
npm install
npm run build
npm start  # Runs on PORT (default: 3000)
```

### Environment Setup

Create `.env.production` with production values:

```env
NODE_ENV=production
CAMPUS_CONTROLLER_URL=https://campus-prod.example.com/api
CORS_ORIGINS=https://aura.example.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## 📦 Dependencies

### Core Dependencies

- **react** 18.3 – UI framework
- **react-router-dom** 6.x – Routing
- **typescript** 5.x – Type checking
- **tailwindcss** 3.x – Styling
- **recharts** 2.x – Charts and data visualization
- **radix-ui** – Accessible UI primitives
- **lucide-react** – Icon library
- **vite** 6.x – Build tool

### Development Dependencies

- **vitest** – Test runner
- **@testing-library/react** – Component testing
- **eslint** – Code linting
- **prettier** – Code formatting
- **typescript** – Type checking

See `package.json` for complete dependency list.

---

## 🤝 Contributing

We welcome contributions! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for:

- Setup instructions
- Development workflow
- Code standards
- Testing requirements
- Commit guidelines
- Pull request process

### Quick Contribution Checklist

- [ ] Fork and clone repository
- [ ] Create feature branch
- [ ] Run `npm install` and `npm run dev`
- [ ] Make changes and test locally
- [ ] Run `npm run lint && npm run test`
- [ ] Commit with message: `feat(scope): description`
- [ ] Open pull request with description

---

## 📞 Support & Contact

### Getting Help

1. **Documentation** – Check [BEST_PRACTICES.md](./BEST_PRACTICES.md) and [CONTRIBUTING.md](./CONTRIBUTING.md)
2. **Issues** – Search existing GitHub issues
3. **Security** – Report vulnerabilities privately (see [SECURITY.md](./SECURITY.md))
4. **Questions** – Open GitHub discussion

### Community

- **GitHub Issues:** Report bugs and feature requests
- **GitHub Discussions:** Ask questions and share ideas
- **Contributing:** Submit pull requests

---

## 📄 License

This project is licensed under the MIT License – see LICENSE file for details.

---

## 🙏 Acknowledgments

- **Extreme Networks** – Campus Controller API and documentation
- **Open Source Community** – React, TypeScript, Vite, and all dependencies

---

## 📊 Project Status

| Category | Status |
|----------|--------|
| Development | ✅ Active |
| Security | ⚠️ Needs Review |
| Testing | ⚠️ Low Coverage (<5%) |
| Documentation | ✅ Comprehensive |
| Performance | ✅ Good |
| Accessibility | ⚠️ Partial |

**Last Updated:** 2026-03-31  
**Maintained By:** AURA Team
