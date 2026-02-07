// Version: Kroger Alignment & Logo Fix - Dec 29 2025 v8 - 20:15
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Campus Controller URL
const CAMPUS_CONTROLLER_URL = process.env.CAMPUS_CONTROLLER_URL || 'https://tsophiea.ddns.net';

console.log('[Proxy Server] Starting...');
console.log('[Proxy Server] Target:', CAMPUS_CONTROLLER_URL);
console.log('[Proxy Server] Port:', PORT);

// Enable CORS for all routes
app.use(cors({
  origin: true, // Allow all origins in development, restrict in production
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Version check endpoint - proves which commit is deployed
app.get('/api/version', async (req, res) => {
  try {
    // Try to read version.json from build directory
    const versionPath = path.join(__dirname, 'build', 'version.json');
    const fs = await import('fs');
    const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
    res.json(versionData);
  } catch (error) {
    // Fallback if version.json doesn't exist
    res.json({
      version: 'unknown',
      commit: 'unknown',
      error: 'version.json not found in build',
      errorDetails: error.message,
      buildPath: path.join(__dirname, 'build'),
      timestamp: new Date().toISOString()
    });
  }
});

// Parse JSON body for diagnostic endpoints
app.use(express.json());

// ==================== Network Diagnostic Tools ====================
// These run server-side since the controller doesn't expose ping/traceroute/dns endpoints

import { exec } from 'child_process';
import { promisify } from 'util';
import dns from 'dns';
const execAsync = promisify(exec);
const dnsResolve = promisify(dns.resolve);

// Input validation: only allow safe hostnames/IPs
function isValidHost(host) {
  if (!host || typeof host !== 'string') return false;
  if (host.length > 253) return false;
  // Allow only alphanumeric, dots, hyphens (no shell injection)
  return /^[a-zA-Z0-9][a-zA-Z0-9.\-]*[a-zA-Z0-9]$/.test(host) || /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
}

app.post('/api/management/platformmanager/v1/network/ping', async (req, res) => {
  const { host, count = 4 } = req.body;
  if (!isValidHost(host)) {
    return res.status(400).json({ error: 'Invalid hostname or IP address' });
  }
  const pingCount = Math.min(Math.max(parseInt(count) || 4, 1), 20);
  try {
    const { stdout } = await execAsync(`ping -c ${pingCount} -W 5 ${host}`, { timeout: 30000 });
    const lines = stdout.split('\n');
    const results = [];
    for (const line of lines) {
      const match = line.match(/icmp_seq[=:](\d+)\s+ttl[=:](\d+)\s+time[=:]([\d.]+)/i);
      if (match) {
        results.push({ seq: parseInt(match[1]), ttl: parseInt(match[2]), time: parseFloat(match[3]) });
      }
    }
    const statsMatch = stdout.match(/(\d+)\s+packets?\s+transmitted,\s*(\d+)\s+(?:packets?\s+)?received,\s*([\d.]+)%\s+(?:packet\s+)?loss/i);
    const rttMatch = stdout.match(/(?:rtt|round-trip)\s+min\/avg\/max(?:\/mdev)?\s*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/i);
    res.json({
      host,
      packets: {
        transmitted: statsMatch ? parseInt(statsMatch[1]) : pingCount,
        received: statsMatch ? parseInt(statsMatch[2]) : results.length,
        loss: statsMatch ? parseFloat(statsMatch[3]) : (results.length === 0 ? 100 : 0),
      },
      rtt: {
        min: rttMatch ? parseFloat(rttMatch[1]) : (results.length ? Math.min(...results.map(r => r.time)) : 0),
        avg: rttMatch ? parseFloat(rttMatch[2]) : (results.length ? results.reduce((s, r) => s + r.time, 0) / results.length : 0),
        max: rttMatch ? parseFloat(rttMatch[3]) : (results.length ? Math.max(...results.map(r => r.time)) : 0),
      },
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Ping returns exit code 1 when host unreachable but still produces output
    if (error.stdout) {
      const statsMatch = error.stdout.match(/(\d+)\s+packets?\s+transmitted,\s*(\d+)\s+(?:packets?\s+)?received,\s*([\d.]+)%/i);
      return res.json({
        host,
        packets: { transmitted: statsMatch ? parseInt(statsMatch[1]) : pingCount, received: statsMatch ? parseInt(statsMatch[2]) : 0, loss: statsMatch ? parseFloat(statsMatch[3]) : 100 },
        rtt: { min: 0, avg: 0, max: 0 },
        results: [],
        timestamp: new Date().toISOString()
      });
    }
    res.status(500).json({ error: 'Ping failed', message: error.message });
  }
});

app.post('/api/management/platformmanager/v1/network/traceroute', async (req, res) => {
  const { host } = req.body;
  if (!isValidHost(host)) {
    return res.status(400).json({ error: 'Invalid hostname or IP address' });
  }
  try {
    const { stdout } = await execAsync(`traceroute -m 30 -w 3 ${host}`, { timeout: 60000 });
    const hops = [];
    for (const line of stdout.split('\n')) {
      const match = line.match(/^\s*(\d+)\s+(.+)/);
      if (match) {
        const hopNum = parseInt(match[1]);
        const rest = match[2];
        const ipMatch = rest.match(/\(?([\d.]+)\)?/);
        const hostMatch = rest.match(/^([a-zA-Z0-9.\-]+)\s/);
        const rttMatches = [...rest.matchAll(/([\d.]+)\s*ms/g)].map(m => parseFloat(m[1]));
        if (rest.includes('* * *')) {
          hops.push({ hop: hopNum, ip: '*', hostname: '*', rtt: [] });
        } else {
          hops.push({
            hop: hopNum,
            ip: ipMatch ? ipMatch[1] : '*',
            hostname: hostMatch ? hostMatch[1] : undefined,
            rtt: rttMatches
          });
        }
      }
    }
    res.json({ host, hops, timestamp: new Date().toISOString() });
  } catch (error) {
    if (error.stdout) {
      const hops = [];
      for (const line of error.stdout.split('\n')) {
        const match = line.match(/^\s*(\d+)\s+(.+)/);
        if (match) {
          const hopNum = parseInt(match[1]);
          const rest = match[2];
          const ipMatch = rest.match(/\(?([\d.]+)\)?/);
          const rttMatches = [...rest.matchAll(/([\d.]+)\s*ms/g)].map(m => parseFloat(m[1]));
          hops.push({ hop: hopNum, ip: ipMatch ? ipMatch[1] : '*', rtt: rttMatches });
        }
      }
      return res.json({ host, hops, timestamp: new Date().toISOString() });
    }
    res.status(500).json({ error: 'Traceroute failed', message: error.message });
  }
});

app.post('/api/management/platformmanager/v1/network/dns', async (req, res) => {
  const { hostname } = req.body;
  if (!isValidHost(hostname)) {
    return res.status(400).json({ error: 'Invalid hostname' });
  }
  try {
    const addresses = await dnsResolve(hostname);
    res.json({ hostname, addresses, timestamp: new Date().toISOString() });
  } catch (error) {
    // Try resolving as CNAME or other record types
    try {
      const addresses4 = await promisify(dns.resolve4)(hostname).catch(() => []);
      const addresses6 = await promisify(dns.resolve6)(hostname).catch(() => []);
      res.json({ hostname, addresses: [...addresses4, ...addresses6], timestamp: new Date().toISOString() });
    } catch {
      res.status(500).json({ error: 'DNS lookup failed', message: error.message, hostname });
    }
  }
});

// Proxy configuration
const proxyOptions = {
  target: CAMPUS_CONTROLLER_URL,
  changeOrigin: true,
  secure: false, // Accept self-signed certificates
  followRedirects: true,
  logLevel: 'debug',
  timeout: 60000, // 60 second timeout for incoming requests
  proxyTimeout: 60000, // 60 second timeout for outgoing proxy requests
  pathRewrite: (path, req) => {
    // Special case: /platformmanager endpoints should not have /management prefix
    // /management/platformmanager/v2/... -> /platformmanager/v2/...
    if (path.includes('/platformmanager/')) {
      const rewritten = path.replace(/^\/management\/platformmanager/, '/platformmanager');
      console.log(`[Proxy] Path rewrite (platformmanager): ${path} -> ${rewritten}`);
      return rewritten;
    }
    // All other paths keep /management prefix
    // /management/v1/services -> /management/v1/services
    console.log(`[Proxy] Path preserved: ${path}`);
    return path;
  },

  onProxyReq: (proxyReq, req, res) => {
    // Log all proxied requests
    const targetUrl = `${CAMPUS_CONTROLLER_URL}${req.url}`;
    console.log(`[Proxy] ${req.method} ${req.url} -> ${targetUrl}`);

    // Forward original headers
    if (req.headers.authorization) {
      proxyReq.setHeader('Authorization', req.headers.authorization);
    }
  },

  onProxyRes: (proxyRes, req, res) => {
    // Log response status
    console.log(`[Proxy] ${req.method} ${req.url} <- ${proxyRes.statusCode}`);

    // Add CORS headers to response
    proxyRes.headers['Access-Control-Allow-Origin'] = req.headers.origin || '*';
    proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
  },

  onError: (err, req, res) => {
    console.error(`[Proxy Error] ${req.method} ${req.url}:`, err.message);
    res.status(500).json({
      error: 'Proxy Error',
      message: err.message,
      path: req.url
    });
  }
};

// Proxy all /api/* requests to Campus Controller
console.log('[Proxy Server] Setting up /api/* proxy middleware');
app.use('/api', (req, res, next) => {
  console.log(`[Proxy Middleware] Received: ${req.method} ${req.url}`);
  next();
}, createProxyMiddleware(proxyOptions));

// Serve static files from the build directory with cache control
const buildPath = path.join(__dirname, 'build');
console.log('[Proxy Server] Serving static files from:', buildPath);

// Cache control middleware
app.use(express.static(buildPath, {
  setHeaders: (res, filePath) => {
    // Never cache HTML files (including index.html)
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    // Cache JS/CSS files for 1 year (they have hashed names)
    else if (filePath.match(/\.(js|css)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    // Cache images/fonts for 1 week
    else if (filePath.match(/\.(jpg|jpeg|png|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  }
}));

// Handle React routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }

  // Never cache index.html
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(buildPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Proxy Server] Running on port ${PORT}`);
  console.log(`[Proxy Server] Proxying /api/* to ${CAMPUS_CONTROLLER_URL}`);
  console.log(`[Proxy Server] Health check available at http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Proxy Server] SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Proxy Server] SIGINT received, shutting down gracefully');
  process.exit(0);
});
