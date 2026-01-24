# Wireless EDGE Services

A comprehensive enterprise wireless network management and monitoring dashboard that integrates with Extreme Networks' Campus Controller. Built with React, TypeScript, and modern web technologies for real-time network visibility, historical analytics, and intelligent automation.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-blue.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.4-purple.svg)](https://vitejs.dev/)
[![Railway](https://img.shields.io/badge/Deploy-Railway-blueviolet.svg)](https://edge-services-site-production.up.railway.app)

## 🌟 Overview

Wireless EDGE Services is an enterprise-grade network management platform providing comprehensive control over Extreme Networks wireless infrastructure with:

- 🎯 **Real-time Network Monitoring** - Live metrics for 1000+ access points and clients
- ⏮️ **Network Rewind** - Travel back in time with historical metrics and playback
- 📊 **Advanced Analytics** - Application insights, traffic analytics, and AI-powered trends
- ⚙️ **Complete Configuration Management** - Sites, networks, policies, and device provisioning
- 🛡️ **Enterprise System Tools** - Backup, licensing, firmware, diagnostics, security, and events
- 🤖 **AI Network Assistant** - Context-aware chatbot for intelligent network insights
- 🎨 **Professional UI/UX** - Modern gradient design with dark/light themes and accessibility

## ✨ Key Features

### 📈 Dashboard & Contextual Insights
- **Service Levels (Contextual Insights)** - Real-time network health with timeline navigation
  - Timeline slider to view historical metrics
  - Network Rewind feature with time-travel playback
  - Live vs. historical data comparison
  - Service-level KPIs and performance trends

- **App Insights** - Application-level traffic analytics and visibility
  - Top applications by traffic volume
  - Application performance monitoring
  - Protocol analysis and categorization

- **Client/AP Insights** - Unified device monitoring with timeline controls
  - Connected clients dashboard with historical views
  - Access point inventory and real-time status
  - Timeline navigation for client and AP metrics
  - Detailed device information and statistics

- **Report Widgets** - Customizable analytics dashboard
  - Real-time metrics visualization
  - Drag-and-drop widget customization
  - Export capabilities for reporting

- **PCI DSS Compliance** - Security compliance reporting
  - Cardholder data environment (CDE) analysis
  - PCI DSS requirement tracking
  - Compliance scoring and recommendations

### ⚙️ Configuration Management
- **Sites** - Multi-site network topology management
  - Hierarchical site organization
  - Site-specific configurations
  - Bulk operations across sites

- **Networks (WLANs)** - Complete SSID/WLAN configuration
  - WLAN creation and management
  - Security policies (WPA2/WPA3, 802.1X, PSK)
  - VLAN assignment and traffic management
  - Guest access configuration

- **Policies** - Network and security policies
  - QoS policies and bandwidth control
  - Firewall rules and access control
  - Application control policies

- **AAA Policies** - Authentication, Authorization, Accounting
  - RADIUS server configuration
  - 802.1X authentication
  - MAC authentication bypass (MAB)
  - Guest portal integration

- **Adoption Rules** - Automated device provisioning
  - Rule-based AP adoption
  - Serial number and MAC address patterns
  - Automatic configuration application

### 🛡️ System Management (NEW)
- **Backup & Storage Manager** - Configuration backup and flash memory management
  - Create and restore configuration backups
  - Download backup files
  - Flash memory usage monitoring
  - File cleanup and optimization
  - Professional gradient UI with storage alerts

- **License Management** - System licensing and entitlements
  - View license information and status
  - Install new licenses
  - Track license utilization and expiration
  - Device licensing statistics
  - Color-coded status indicators

- **Firmware Manager** - AP firmware upgrade orchestration
  - Bulk firmware upgrades
  - Scheduled upgrade windows
  - Version management and tracking
  - Force adoption and unadoption
  - Upgrade status monitoring

- **Network Diagnostics** - Network troubleshooting tools
  - Ping tests with packet statistics
  - Traceroute with hop-by-hop analysis
  - DNS lookup and resolution
  - IP address validation
  - Real-time results display

- **Events & Alarms** - System event monitoring and alarm management
  - Active alarms dashboard
  - Event history and filtering
  - Alarm acknowledgment and clearing
  - Severity-based categorization (Critical, Warning, Info)
  - Real-time event streaming

- **Security Dashboard** - Rogue AP detection and threat monitoring
  - Rogue AP scanning and detection
  - AP classification (Friendly, Malicious, Unknown)
  - Security threat monitoring
  - WIDS/WIPS integration
  - Containment actions

- **Guest Management** - Temporary wireless access control
  - Guest account creation
  - Voucher generation
  - Duration-based access control
  - Email validation and company tracking
  - Expiration monitoring

### 🛠️ Advanced Tools
- **RF Management** - Radio frequency optimization
  - Channel planning and optimization
  - Power level adjustments
  - Interference detection and mitigation

- **Device Upgrade** - Firmware and software management
  - Centralized firmware distribution
  - Scheduled maintenance windows
  - Rollback capabilities

- **Packet Capture** - Network traffic analysis
  - Live packet capture
  - Filter-based capture
  - PCAP download for Wireshark analysis

- **AFC Planning** - Automated Frequency Coordination (6 GHz)
  - 6 GHz spectrum planning
  - AFC compliance verification
  - Coverage optimization

- **API Test Tool** - Direct API endpoint testing
  - 200+ endpoint coverage across all API categories
  - Request/response inspection
  - Authentication testing
  - Custom parameter configuration

### 🤖 AI & Automation
- **Network Chatbot** - Intelligent network assistant
  - Natural language queries
  - Context-aware responses
  - Network troubleshooting assistance
  - Real-time data integration

### 📊 Historical Data & Analytics
- **Network Rewind** - Time-travel through network history
  - 90-day metric retention
  - Timeline slider navigation
  - Automatic data collection every 15 minutes
  - Client count and service metrics
  - Background worker service for 24/7 collection

- **Service Metrics** - Historical service performance
  - Client count trends
  - Service availability tracking
  - Performance degradation analysis

## 🏗️ Technology Stack

### Frontend
- **React 18.3** - Modern UI framework with concurrent features
- **TypeScript 5.x** - Type-safe development
- **Vite 6.4** - Lightning-fast build tool and HMR
- **Tailwind CSS** - Utility-first styling with custom design system
- **shadcn/ui** - Radix UI-based accessible components
- **Recharts & Chart.js** - Advanced data visualization
- **React Hook Form** - Performant form state management
- **Zod** - Schema validation
- **Sonner** - Beautiful toast notifications
- **Lucide Icons** - Consistent iconography

### Backend/API Integration
- **Express.js** - Node.js server for API proxying
- **Supabase** - PostgreSQL for historical metrics storage
- **Campus Controller API** - 200+ integrated endpoints
  - Platform Manager APIs (backup, license, flash, diagnostics)
  - AP Management APIs (firmware, adoption, configuration)
  - Client Management APIs (authentication, blocking, bandwidth)
  - Security APIs (rogue detection, WIDS/WIPS, threats)
  - Guest APIs (account creation, vouchers, portals)
  - QoS APIs (policies, bandwidth allocation, DSCP)
  - Location APIs (zones, presence, dwell time, traffic flow)
  - Application Manager APIs (containers, storage, images)

### Development & Quality
- **Vitest** - Fast unit testing framework
- **ESLint** - Code quality and consistency
- **Prettier** - Automated code formatting
- **TypeScript Strict Mode** - Maximum type safety

### Deployment
- **Railway** - Primary hosting platform
- **Docker** - Containerization support
- **Vercel** - Alternative deployment option

## 🚀 Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm or yarn
- Access to an Extreme Networks Campus Controller
- (Optional) Supabase account for Network Rewind feature

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/thomassophiea/edge-services-site.git
   cd edge-services-site
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Copy `.env.example` to `.env` and update:
   ```bash
   cp .env.example .env
   ```

   Required environment variables:
   ```env
   # Campus Controller Configuration
   CAMPUS_CONTROLLER_URL=https://your-controller.example.com
   VITE_DEV_CAMPUS_CONTROLLER_URL=https://your-controller.example.com:443

   # Optional: Auto-login credentials
   VITE_CAMPUS_CONTROLLER_USER=admin
   VITE_CAMPUS_CONTROLLER_PASSWORD=your_password

   # Optional: Supabase for Network Rewind (historical data)
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

   # Optional: Metrics collection (for Network Rewind)
   COLLECTION_INTERVAL_MINUTES=15
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

   Application available at `http://localhost:5173`

5. **Build for production**
   ```bash
   npm run build
   ```

6. **Preview production build**
   ```bash
   npm run preview
   ```

### Network Rewind Setup (Optional)

For historical metrics and time-travel features:

1. **Set up Supabase**
   - Create a Supabase project
   - Run the schema from `supabase-schema.sql`
   - Add Supabase credentials to `.env`

2. **Deploy metrics collector**
   ```bash
   # Runs in background on Railway/Docker
   node metrics-collector.js
   ```

See [NETWORK_REWIND_README.md](./NETWORK_REWIND_README.md) for detailed setup.

## 📁 Project Structure

```
edge-services-site/
├── src/
│   ├── components/              # React components
│   │   ├── ui/                 # shadcn/ui components (Button, Card, Dialog, etc.)
│   │   ├── widgets/            # Dashboard widgets
│   │   ├── wlans/              # WLAN management components
│   │   ├── DashboardEnhanced.tsx
│   │   ├── ServiceLevelsEnhanced.tsx
│   │   ├── AppInsights.tsx
│   │   ├── TrafficStatsConnectedClients.tsx
│   │   ├── AccessPoints.tsx
│   │   ├── SystemBackupManager.tsx    # NEW
│   │   ├── LicenseDashboard.tsx       # NEW
│   │   ├── APFirmwareManager.tsx      # NEW
│   │   ├── NetworkDiagnostics.tsx     # NEW
│   │   ├── EventAlarmDashboard.tsx    # NEW
│   │   ├── SecurityDashboard.tsx      # NEW
│   │   ├── GuestManagement.tsx        # NEW
│   │   ├── NetworkChatbot.tsx
│   │   ├── ApiTestTool.tsx
│   │   └── ... (60+ components)
│   ├── services/               # Business logic and API clients
│   │   ├── api.ts             # Main API client (200+ endpoints)
│   │   ├── logger.ts          # Logging service
│   │   ├── cache.ts           # Response caching
│   │   ├── sleDataCollection.ts  # SLE metrics collection
│   │   └── ... (10+ services)
│   ├── hooks/                 # Custom React hooks
│   │   ├── useGlobalFilters.ts   # Global filter state
│   │   ├── useDebounce.ts        # Debounced values
│   │   └── ...
│   ├── contexts/              # React context providers
│   ├── types/                 # TypeScript type definitions
│   ├── lib/                   # Utility functions
│   │   ├── themes.ts          # Theme management
│   │   ├── utils.ts           # Helper functions
│   │   └── ...
│   ├── styles/                # Global CSS
│   ├── test/                  # Test utilities
│   └── App.tsx                # Root component with routing
├── public/                    # Static assets
├── server.js                  # Express proxy server
├── metrics-collector.js       # Background metrics worker
├── supabase-schema.sql        # Database schema
├── vite.config.ts             # Vite configuration
├── vitest.config.ts           # Test configuration
├── tsconfig.json              # TypeScript configuration
├── tailwind.config.js         # Tailwind CSS configuration
├── .eslintrc.json             # ESLint rules
├── .prettierrc.json           # Prettier formatting
├── railway.toml               # Railway deployment config
├── Procfile                   # Multi-process deployment
└── package.json               # Dependencies and scripts
```

## 🎨 UI/UX Features

### Professional Design System
- **Gradient Headers** - Modern gradient text effects
- **Elevated Cards** - 2px borders with hover shadows
- **Color-Coded Components** - Intuitive status indicators
- **Smooth Animations** - 300-700ms transitions throughout
- **Staggered List Animations** - Progressive reveal effects
- **Icon Containers** - Colored backgrounds for visual hierarchy
- **Progress Bars** - Multi-stop gradient progress indicators
- **Hover Effects** - Interactive feedback on all elements

### Accessibility (WCAG 2.1 AA Compliant)
- Semantic HTML structure
- ARIA labels and roles on all interactive elements
- Keyboard navigation support
- Screen reader optimization
- Progress bar accessibility (role, aria-valuemin/max/now)
- Form validation with descriptive errors
- Color contrast compliance
- Focus indicators

### Responsive Design & Mobile Optimization
- **Mobile-first approach** - Optimized for smartphones and tablets
- **Device detection** - Smart device and touch capability detection
- **Adaptive layouts** - Card layouts on mobile, tables on desktop
- **Touch-friendly interface** - 44px minimum tap targets on touch devices
- **Responsive modals** - Sheets/drawers on mobile, dialogs on desktop
- **Breakpoint optimization** - Tailwind breakpoints (sm, md, lg, xl, 2xl)
- **Progressive enhancement** - Enhanced mobile UX without compromising desktop
- See [MOBILE_OPTIMIZATION_GUIDE.md](./MOBILE_OPTIMIZATION_GUIDE.md) for implementation details

## 🔌 API Integration

### Comprehensive Endpoint Coverage

The application integrates with **200+ Campus Controller API endpoints** across all categories:

#### Core APIs
- **Authentication** (`/oauth/token`) - OAuth 2.0 with refresh tokens
- **Access Points** (`/v1/aps/*`) - 15+ endpoints for AP management
- **Stations/Clients** (`/v1/stations/*`) - 10+ endpoints for client management
- **Sites** (`/v3/sites/*`) - 8+ endpoints for site topology
- **Services/Networks** (`/v1/services/*`) - 12+ endpoints for SSID management
- **Policies** (`/v1/policies/*`) - 6+ endpoints for policy configuration

#### Platform Manager APIs (NEW)
- **Backup & Configuration** - Backup creation, restore, download
- **License Management** - License info, usage, installation
- **Flash Memory** - File management and usage monitoring
- **Network Diagnostics** - Ping, traceroute, DNS lookup

#### Advanced APIs (NEW)
- **AP Firmware** - Software upgrades, schedules, adoption control
- **Enhanced Client Control** - Deauth, blocking, bandwidth limits, history
- **Events & Alarms** - Event retrieval, alarm management, acknowledgment
- **RF Analytics** - Interference, coverage, roaming analytics
- **Security** - Rogue AP detection, classification, WIDS/WIPS
- **Guest Management** - Account creation, voucher generation, portal customization
- **QoS Management** - Policy creation, statistics, bandwidth allocation
- **Application Manager** - Container management, app deployment
- **Location Analytics** - Zone creation, presence tracking, dwell time, traffic flow

### API Proxy Architecture

```
┌─────────────────┐          ┌──────────────────┐          ┌─────────────────────┐
│                 │          │                  │          │                     │
│  React Frontend │─────────▶│  Express Server  │─────────▶│ Campus Controller   │
│  (localhost)    │          │  (Port 3000)     │          │  (HTTPS API)        │
│                 │          │  /api/* proxy    │          │                     │
└─────────────────┘          └──────────────────┘          └─────────────────────┘
                                     │
                                     │
                                     ▼
                             ┌──────────────────┐
                             │                  │
                             │  Supabase DB     │
                             │  (Metrics Store) │
                             │                  │
                             └──────────────────┘
```

**Benefits:**
- CORS issue resolution
- Request/response logging
- Error handling
- Response caching
- Authentication token management

## 🚢 Deployment

### Railway (Recommended)

**Live Production URL:** [https://edge-services-site-production.up.railway.app](https://edge-services-site-production.up.railway.app)

1. **Connect GitHub repository**
   ```bash
   railway link
   ```

2. **Configure environment variables** in Railway dashboard

3. **Deploy**
   ```bash
   railway up
   ```

4. **Enable worker service** (for Network Rewind)
   - Add new service in Railway
   - Set start command: `node metrics-collector.js`
   - Share environment variables from web service

See [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) for detailed instructions.

### Docker

```bash
# Build image
docker build -t wireless-edge-services .

# Run container
docker run -p 3000:3000 \
  -e CAMPUS_CONTROLLER_URL=https://your-controller.com \
  -e VITE_SUPABASE_URL=your_supabase_url \
  wireless-edge-services
```

### Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel deploy
```

## 🧪 Development

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Code Quality

```bash
# Lint code
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code
npm run format

# Type check
npm run type-check
```

### Development Scripts

```bash
# Start dev server with HMR
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Analyze bundle size
npm run build -- --mode analyze

# Clear cache
rm -rf node_modules/.vite build dist
```

## 📊 Performance

### Optimization Strategies
- **Code Splitting** - Route-based lazy loading (60+ components)
- **Tree Shaking** - Unused code elimination
- **Asset Optimization** - Image compression and lazy loading
- **Response Caching** - API response caching with TTL
- **Memoization** - React.memo for expensive components
- **Virtualization** - Large lists with react-window
- **Bundle Analysis** - Vite rollup visualization

### Metrics
- **Initial Load** - < 2s on 3G
- **Time to Interactive** - < 3s
- **Bundle Size** - ~300KB gzipped (main)
- **Lighthouse Score** - 95+ performance

## 🔒 Security

### Authentication & Authorization
- **OAuth 2.0** - Secure token-based authentication
- **Token Refresh** - Automatic token renewal
- **Session Management** - Secure session handling
- **Role-Based Access** - Admin/user permission levels

### Data Protection
- **HTTPS Only** - Encrypted connections
- **CORS Protection** - Proxy-based security
- **Input Validation** - Comprehensive form validation
  - Filename validation (alphanumeric, hyphens, underscores, dots)
  - Email validation (RFC 5322 compliant regex)
  - IP address validation
  - Hostname validation
  - License key format validation
  - Duration range validation
- **XSS Prevention** - React's built-in escaping
- **Error Boundaries** - Crash protection with fallback UI

### Compliance
- **PCI DSS** - Payment card industry compliance reporting
- **WCAG 2.1 AA** - Accessibility standards
- **GDPR** - Data privacy considerations

## 📱 Browser Support

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | Latest | ✅ Fully Supported |
| Edge | Latest | ✅ Fully Supported |
| Firefox | Latest | ✅ Fully Supported |
| Safari | Latest | ✅ Fully Supported |
| Mobile Safari | iOS 14+ | ✅ Fully Supported |
| Chrome Mobile | Latest | ✅ Fully Supported |

## 🐛 Troubleshooting

### Common Issues

**Build Errors**
```bash
# Clear everything and reinstall
rm -rf node_modules package-lock.json node_modules/.vite build dist
npm install
npm run build
```

**API Connection Issues**
- Verify `CAMPUS_CONTROLLER_URL` in `.env`
- Check network connectivity to controller
- Validate credentials are correct
- Review proxy server logs (`server.js`)

**Network Rewind Not Working**
- Confirm Supabase credentials are set
- Check database schema is installed
- Verify metrics-collector is running
- Review worker service logs

**Performance Issues**
```bash
# Clear Vite cache
rm -rf node_modules/.vite
npm run dev
```

**TypeScript Errors**
```bash
# Rebuild TypeScript
npm run type-check
```

## 📚 Documentation

- [NETWORK_REWIND_README.md](./NETWORK_REWIND_README.md) - Historical data feature guide
- [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) - Railway deployment instructions
- [DEPLOYMENT.md](./DEPLOYMENT.md) - General deployment guide
- [API Test Tool Guide](./docs/api-test-tool.md) - API testing documentation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting (`npm test && npm run lint`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines
- Follow TypeScript strict mode
- Add tests for new features
- Update documentation
- Follow existing code style
- Use semantic commit messages

## 📄 License

Proprietary - Extreme Networks

All rights reserved. This software is proprietary to Extreme Networks and may not be copied, distributed, or modified without explicit permission.

## 🙏 Acknowledgments

- **Built for:** Extreme Networks Campus Controller integration
- **UI Components:** shadcn/ui and Radix UI
- **Icons:** Lucide Icons
- **Charts:** Recharts and Chart.js
- **Database:** Supabase PostgreSQL

## 📞 Support

For issues, questions, or feature requests:
- **GitHub Issues:** [Create an issue](https://github.com/thomassophiea/edge-services-site/issues)
- **Email:** thomas.sophiea@extremenetworks.com
- **Documentation:** See `/docs` folder for detailed guides

---

**Built with ❤️ by the Extreme Networks team**

**Live Demo:** [https://edge-services-site-production.up.railway.app](https://edge-services-site-production.up.railway.app)

---

*Wireless EDGE Services - Professional network management for the modern enterprise*
