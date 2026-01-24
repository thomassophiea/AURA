# EDGE (Edge Data Gateway Engine) v500

A comprehensive wireless network management and monitoring dashboard that integrates with Extreme Networks' Campus Controller. Built with React, TypeScript, and modern web technologies for real-time network visibility and management.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-blue.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.4-purple.svg)](https://vitejs.dev/)

## Overview

EDGE v500 is an enterprise-grade network management platform providing:

- 🎯 **Real-time Network Monitoring** - Live metrics for access points, clients, and network health
- 📊 **Advanced Analytics** - Application insights, traffic analytics, and performance trends
- ⚙️ **Configuration Management** - Site, network, policy, and device configuration
- 🛠️ **Troubleshooting Tools** - Packet capture, RF management, and API testing
- 🤖 **AI Network Assistant** - Context-aware chatbot for network insights
- 🎨 **Modern UI/UX** - Dark/light theme support with responsive design

## Technology Stack

### Frontend
- **React 18.3** - Modern UI framework with hooks
- **TypeScript** - Type-safe development
- **Vite 6.4** - Lightning-fast build tool
- **Tailwind CSS** - Utility-first styling
- **Radix UI** - Headless accessible components
- **Recharts & Chart.js** - Data visualization
- **React Hook Form** - Form state management
- **Sonner** - Toast notifications

### Backend/API
- **Express.js** - Node.js server for proxying
- **Supabase** - PostgreSQL for historical data
- **Campus Controller API** - 92+ integrated endpoints

### Development
- **Vitest** - Unit testing framework
- **ESLint** - Code linting
- **Prettier** - Code formatting

## Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm or yarn
- Access to an Extreme Networks Campus Controller

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd edge-services-site
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Copy `.env.example` to `.env` and update with your configuration:
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

   # Optional: Supabase for historical data
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

   The application will be available at `http://localhost:5173`

5. **Build for production**
   ```bash
   npm run build
   ```

6. **Preview production build**
   ```bash
   npm run preview
   ```

## Project Structure

```
edge-services-site/
├── src/
│   ├── components/         # React components
│   │   ├── ui/            # Reusable UI components (Radix)
│   │   ├── widgets/       # Dashboard widgets
│   │   └── *.tsx          # Feature components
│   ├── services/          # API and business logic
│   │   ├── api.ts         # Main API client (92+ endpoints)
│   │   ├── logger.ts      # Logging service
│   │   ├── cache.ts       # Response caching
│   │   └── *.ts           # Other services
│   ├── hooks/             # Custom React hooks
│   ├── contexts/          # React context providers
│   ├── types/             # TypeScript type definitions
│   ├── lib/               # Utility functions
│   ├── styles/            # Global CSS
│   ├── test/              # Test setup and utilities
│   └── App.tsx            # Root component
├── server.js              # Express proxy server
├── metrics-collector.js   # Background metrics worker
├── vite.config.ts         # Vite configuration
├── vitest.config.ts       # Vitest test configuration
├── tsconfig.json          # TypeScript configuration
├── .eslintrc.json         # ESLint rules
└── .prettierrc.json       # Prettier formatting rules
```

## Key Features

### Dashboard & Monitoring
- **Service Levels** - Real-time network health metrics and KPIs
- **App Insights** - Application-level traffic analytics
- **Connected Clients** - Device management and monitoring
- **Access Points** - Wireless AP inventory and status
- **Report Widgets** - Customizable analytics dashboard

### Configuration
- **Sites** - Multi-site network management
- **Networks** - SSID/WLAN configuration
- **Policies** - QoS and security policies
- **AAA Policies** - Authentication and authorization
- **Adoption Rules** - Automatic device provisioning
- **Guest Access** - Guest network setup

### Tools
- **RF Management** - Radio frequency optimization
- **Device Upgrade** - Firmware management
- **Packet Capture** - Network troubleshooting
- **AFC Planning** - Automated frequency coordination
- **API Test Tool** - Direct API endpoint testing

### Administration
- **System Configuration** - Network settings and interfaces
- **User Management** - Admin users and roles
- **Applications** - OAuth integration management
- **Licensing** - License status and entitlements

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Code Quality

```bash
# Run ESLint
npm run lint

# Fix linting issues
npm run lint:fix

# Format code with Prettier
npm run format

# Type check
npm run type-check
```

### Architecture Patterns

- **Component Organization** - Feature-based component structure
- **State Management** - React hooks and context for global state
- **API Integration** - Centralized API service with caching
- **Error Handling** - Error boundaries for graceful failure
- **Performance** - Code splitting, lazy loading, memoization
- **Type Safety** - Strict TypeScript configuration

## API Integration

The application integrates with 92+ Campus Controller API endpoints:

- Authentication (OAuth 2.0)
- Access Points (`/v1/aps`)
- Stations/Clients (`/v1/stations`)
- Sites (`/v3/sites`)
- Services/Networks (`/v1/services`)
- Policies (`/v1/policies`)
- Events (`/v1/events`)
- RF Management (`/v3/rfmgmt`)
- Device Management (`/v1/devices`)

### API Proxy

In production, the Express server proxies requests to avoid CORS issues:
```
Frontend → Express Server (/api/*) → Campus Controller
```

In development, direct connections can be made using `VITE_DEV_CAMPUS_CONTROLLER_URL`.

## Deployment

### Railway

The project includes Railway configuration (`railway.toml`):
```bash
railway up
```

### Vercel

Deploy with Vercel configuration (`vercel.json`):
```bash
vercel deploy
```

### Docker

```bash
docker build -t edge-v500 .
docker run -p 3000:3000 edge-v500
```

## Performance Optimization

- **Code Splitting** - Route-based lazy loading
- **Asset Optimization** - Minification and compression
- **Caching** - Service worker for static assets
- **Bundle Analysis** - Vite rollup analyzer
- **React Optimization** - Memoization and virtualization

## Security

- **OAuth 2.0** - Secure authentication
- **HTTPS** - Encrypted connections
- **CORS Protection** - Proxy-based security
- **Input Validation** - Form validation and sanitization
- **Error Boundaries** - Graceful error handling

## Accessibility

The application follows WCAG 2.1 guidelines:
- Semantic HTML
- ARIA labels and roles
- Keyboard navigation
- Screen reader support
- Color contrast compliance

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Troubleshooting

### Common Issues

**Build Errors**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

**API Connection Issues**
- Verify `CAMPUS_CONTROLLER_URL` is correct
- Check network connectivity
- Ensure credentials are valid

**Development Server Issues**
```bash
# Clear Vite cache
rm -rf node_modules/.vite
npm run dev
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Run tests and linting
4. Submit a pull request

## License

Proprietary - Extreme Networks

## Support

For issues or questions, please contact the development team.

## Acknowledgments

- Original design: [Figma - AURA v500](https://www.figma.com/design/PON5nGOoAuCSZGt3PoWPPf/AURA--Autonomous-Unified-Radio-Agent--v500--w-3rd-party-)
- Built for Extreme Networks Campus Controller integration
