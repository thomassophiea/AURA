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

// Proxy configuration
const proxyOptions = {
  target: CAMPUS_CONTROLLER_URL,
  changeOrigin: true,
  secure: false, // Accept self-signed certificates
  followRedirects: true,
  logLevel: 'debug',

  onProxyReq: (proxyReq, req, res) => {
    // Log all proxied requests
    console.log(`[Proxy] ${req.method} ${req.url} -> ${CAMPUS_CONTROLLER_URL}${req.url}`);

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
app.use('/api', createProxyMiddleware(proxyOptions));

// Serve static files from the build directory
const buildPath = path.join(__dirname, 'dist');
console.log('[Proxy Server] Serving static files from:', buildPath);
app.use(express.static(buildPath));

// Handle React routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }

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
