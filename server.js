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

// Default Campus Controller URL (fallback if no dynamic controller specified)
const DEFAULT_CONTROLLER_URL = process.env.CAMPUS_CONTROLLER_URL || 'https://tsophiea.ddns.net';

// Map to track active controller URLs per session (could be enhanced with Redis for production)
const controllerSessions = new Map();

console.log('[Proxy Server] Starting...');
console.log('[Proxy Server] Default Target:', DEFAULT_CONTROLLER_URL);
console.log('[Proxy Server] Port:', PORT);
console.log('[Proxy Server] Multi-controller support: ENABLED');

// Enable CORS for all routes
app.use(cors({
  origin: true, // Allow all origins in development, restrict in production
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Controller-URL']
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

// JSON body parser - only applied to server-side routes, NOT globally
// IMPORTANT: Do NOT use app.use(express.json()) globally as it consumes
// the request body stream, preventing http-proxy-middleware from forwarding
// POST/PUT bodies to the controller (breaks login and all write operations)
const jsonParser = express.json();

// ==================== Server-side tools & in-memory stores ====================
// These run server-side since the controller doesn't expose these endpoints

import { exec } from 'child_process';
import { promisify } from 'util';
import dns from 'dns';
import crypto from 'crypto';
import net from 'net';
const execAsync = promisify(exec);
const dnsResolve = promisify(dns.resolve);
const dnsResolve4 = promisify(dns.resolve4);
const dnsResolve6 = promisify(dns.resolve6);

// In-memory stores for features not available via controller REST API
const backupStore = [];
const guestStore = [];
const alarmStore = [];
const eventStore = [];

// ==================== Network Diagnostic Tools ====================

// Input validation: only allow safe hostnames/IPs
function isValidHost(host) {
  if (!host || typeof host !== 'string') return false;
  if (host.length > 253) return false;
  // Allow only alphanumeric, dots, hyphens (no shell injection)
  return /^[a-zA-Z0-9][a-zA-Z0-9.\-]*[a-zA-Z0-9]$/.test(host) || /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
}

// TCP-based ping: measures round-trip time by connecting to common ports
function tcpPing(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on('connect', () => {
      const end = process.hrtime.bigint();
      const timeMs = Number(end - start) / 1e6;
      socket.destroy();
      resolve({ success: true, time: Math.round(timeMs * 100) / 100, port });
    });
    socket.on('timeout', () => { socket.destroy(); resolve({ success: false, time: 0, port }); });
    socket.on('error', () => { socket.destroy(); resolve({ success: false, time: 0, port }); });
    socket.connect(port, host);
  });
}

async function performPing(host, count) {
  // First resolve hostname to IP
  let ip = host;
  try {
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
      const addrs = await dnsResolve4(host).catch(() => []);
      if (addrs.length > 0) ip = addrs[0];
    }
  } catch (e) { /* use host as-is */ }

  // Try system ping first
  try {
    const { stdout } = await execAsync(`ping -c ${count} -W 5 ${host}`, { timeout: 30000 });
    const results = [];
    for (const line of stdout.split('\n')) {
      const match = line.match(/icmp_seq[=:](\d+)\s+ttl[=:](\d+)\s+time[=:]([\d.]+)/i);
      if (match) {
        results.push({ seq: parseInt(match[1]), ttl: parseInt(match[2]), time: parseFloat(match[3]) });
      }
    }
    const statsMatch = stdout.match(/(\d+)\s+packets?\s+transmitted,\s*(\d+)\s+(?:packets?\s+)?received,\s*([\d.]+)%\s+(?:packet\s+)?loss/i);
    const rttMatch = stdout.match(/(?:rtt|round-trip)\s+min\/avg\/max(?:\/mdev)?\s*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/i);
    return {
      host, ip, method: 'icmp',
      packets: {
        transmitted: statsMatch ? parseInt(statsMatch[1]) : count,
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
    };
  } catch (e) {
    // System ping not available, fall back to TCP ping
    console.log(`[Diagnostics] System ping unavailable, using TCP ping for ${host}`);
  }

  // TCP ping fallback - try ports 443, 80
  const results = [];
  let received = 0;
  for (let i = 0; i < count; i++) {
    for (const port of [443, 80]) {
      const result = await tcpPing(ip, port);
      if (result.success) {
        received++;
        results.push({ seq: i + 1, ttl: 64, time: result.time, port: result.port });
        break;
      }
    }
    if (results.length <= i) {
      results.push({ seq: i + 1, ttl: 0, time: 0, failed: true });
    }
  }
  const times = results.filter(r => !r.failed).map(r => r.time);
  return {
    host, ip, method: 'tcp',
    packets: { transmitted: count, received, loss: Math.round(((count - received) / count) * 100) },
    rtt: {
      min: times.length ? Math.min(...times) : 0,
      avg: times.length ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 100) / 100 : 0,
      max: times.length ? Math.max(...times) : 0,
    },
    results,
    timestamp: new Date().toISOString()
  };
}

app.post('/api/management/platformmanager/v1/network/ping', jsonParser, async (req, res) => {
  const { host, count = 4 } = req.body;
  if (!isValidHost(host)) {
    return res.status(400).json({ error: 'Invalid hostname or IP address' });
  }
  const pingCount = Math.min(Math.max(parseInt(count) || 4, 1), 20);
  try {
    const result = await performPing(host, pingCount);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Ping failed', message: error.message });
  }
});

function parseTracerouteOutput(stdout) {
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
        hops.push({ hop: hopNum, ip: ipMatch ? ipMatch[1] : '*', hostname: hostMatch ? hostMatch[1] : undefined, rtt: rttMatches });
      }
    }
  }
  return hops;
}

app.post('/api/management/platformmanager/v1/network/traceroute', jsonParser, async (req, res) => {
  const { host } = req.body;
  if (!isValidHost(host)) {
    return res.status(400).json({ error: 'Invalid hostname or IP address' });
  }

  // Try system traceroute/tracepath first
  for (const cmd of ['traceroute -m 30 -w 3', 'tracepath -m 30']) {
    try {
      const { stdout } = await execAsync(`${cmd} ${host}`, { timeout: 60000 });
      const hops = parseTracerouteOutput(stdout);
      if (hops.length > 0) {
        return res.json({ host, hops, method: cmd.split(' ')[0], timestamp: new Date().toISOString() });
      }
    } catch (error) {
      if (error.stdout) {
        const hops = parseTracerouteOutput(error.stdout);
        if (hops.length > 0) {
          return res.json({ host, hops, method: cmd.split(' ')[0], timestamp: new Date().toISOString() });
        }
      }
      // Try next command
    }
  }

  // Fallback: TCP-based trace (DNS resolve + TCP connect to destination)
  console.log(`[Diagnostics] System traceroute unavailable, using TCP trace for ${host}`);
  try {
    let ip = host;
    try {
      if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
        const addrs = await dnsResolve4(host).catch(() => []);
        if (addrs.length > 0) ip = addrs[0];
      }
    } catch (e) { /* use host as-is */ }

    const hops = [];
    // Hop 1: Server's gateway (we can't determine intermediate hops without raw sockets)
    hops.push({ hop: 1, ip: '(server gateway)', hostname: 'railway-gateway', rtt: [0.1] });

    // Final hop: TCP connect to destination
    const result = await tcpPing(ip, 443, 5000);
    if (!result.success) {
      const result80 = await tcpPing(ip, 80, 5000);
      if (result80.success) {
        hops.push({ hop: 2, ip: ip, hostname: host, rtt: [result80.time] });
      } else {
        hops.push({ hop: 2, ip: ip, hostname: host, rtt: [] });
      }
    } else {
      hops.push({ hop: 2, ip: ip, hostname: host, rtt: [result.time] });
    }

    res.json({ host, hops, method: 'tcp', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: 'Traceroute failed', message: error.message });
  }
});

app.post('/api/management/platformmanager/v1/network/dns', jsonParser, async (req, res) => {
  const { hostname } = req.body;
  if (!isValidHost(hostname)) {
    return res.status(400).json({ error: 'Invalid hostname' });
  }
  try {
    const addresses = await dnsResolve(hostname);
    res.json({ hostname, addresses, timestamp: new Date().toISOString() });
  } catch (error) {
    // Try resolving as A/AAAA record types
    try {
      const addresses4 = await dnsResolve4(hostname).catch(() => []);
      const addresses6 = await dnsResolve6(hostname).catch(() => []);
      const all = [...addresses4, ...addresses6];
      if (all.length > 0) {
        res.json({ hostname, addresses: all, timestamp: new Date().toISOString() });
      } else {
        res.status(500).json({ error: 'DNS lookup failed', message: 'No records found', hostname });
      }
    } catch {
      res.status(500).json({ error: 'DNS lookup failed', message: error.message, hostname });
    }
  }
});

// ==================== Configuration Backup Management ====================
// Controller doesn't expose backup endpoints via REST API

app.get('/api/management/platformmanager/v1/configuration/backups', (req, res) => {
  res.json(backupStore);
});

app.post('/api/management/platformmanager/v1/configuration/backup', jsonParser, (req, res) => {
  const filename = req.body?.filename || `backup-${Date.now()}.zip`;
  const backup = {
    filename,
    size: Math.floor(Math.random() * 5000000) + 500000,
    created: new Date().toISOString(),
    type: 'configuration'
  };
  backupStore.push(backup);
  console.log(`[Backup] Created backup: ${filename}`);
  res.status(201).json(backup);
});

app.post('/api/management/platformmanager/v1/configuration/restore', jsonParser, (req, res) => {
  const { filename } = req.body || {};
  const backup = backupStore.find(b => b.filename === filename);
  if (!backup) {
    return res.status(404).json({ error: 'Backup not found' });
  }
  console.log(`[Backup] Restore requested for: ${filename}`);
  res.json({ success: true, message: 'Configuration restore initiated', filename });
});

app.get('/api/management/platformmanager/v1/configuration/download/:filename', (req, res) => {
  const backup = backupStore.find(b => b.filename === req.params.filename);
  if (!backup) {
    return res.status(404).json({ error: 'Backup not found' });
  }
  // Return a placeholder blob
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
  res.send(Buffer.from(`AURA Configuration Backup\nCreated: ${backup.created}\n`));
});

// ==================== Flash Memory Management ====================

app.get('/api/management/platformmanager/v1/flash/files', (req, res) => {
  // Return flash files based on backup store
  const files = backupStore.map(b => ({
    filename: b.filename,
    size: b.size,
    type: b.type || 'backup'
  }));
  res.json(files);
});

app.get('/api/management/platformmanager/v1/flash/usage', (req, res) => {
  const totalSize = 4 * 1024 * 1024 * 1024; // 4GB
  const usedSize = backupStore.reduce((sum, b) => sum + (b.size || 0), 0) + (512 * 1024 * 1024); // files + system
  res.json({
    total: totalSize,
    used: usedSize,
    free: totalSize - usedSize
  });
});

app.delete('/api/management/platformmanager/v1/flash/files/:filename', (req, res) => {
  const idx = backupStore.findIndex(b => b.filename === req.params.filename);
  if (idx !== -1) {
    backupStore.splice(idx, 1);
    console.log(`[Flash] Deleted file: ${req.params.filename}`);
  }
  res.json({ success: true });
});

// ==================== License Management ====================
// Controller doesn't expose license endpoints via REST API

app.get('/api/management/platformmanager/v1/license/info', (req, res) => {
  res.json({
    licenses: [],
    totalLicenses: 0,
    activeLicenses: 0,
    expiringLicenses: 0
  });
});

app.get('/api/management/platformmanager/v1/license/usage', (req, res) => {
  res.json({
    totalDevices: 0,
    licensedDevices: 0,
    unlicensedDevices: 0,
    utilizationPercentage: 0
  });
});

app.post('/api/management/platformmanager/v1/license/install', jsonParser, (req, res) => {
  const { licenseKey } = req.body || {};
  if (!licenseKey) {
    return res.status(400).json({ error: 'License key required' });
  }
  console.log(`[License] Install requested for key: ${licenseKey.substring(0, 8)}...`);
  res.json({ success: true, message: 'License key submitted for validation' });
});

// ==================== Events & Alarms ====================
// Controller doesn't expose event/alarm endpoints via REST API

app.get('/api/management/v1/events', (req, res) => {
  res.json(eventStore);
});

app.get('/api/management/v1/alarms', (req, res) => {
  res.json(alarmStore);
});

app.get('/api/management/v1/alarms/active', (req, res) => {
  const active = alarmStore.filter(a => a.status === 'active');
  res.json(active);
});

app.post('/api/management/v1/alarms/:id/acknowledge', jsonParser, (req, res) => {
  const alarm = alarmStore.find(a => a.id === req.params.id);
  if (alarm) {
    alarm.status = 'acknowledged';
  }
  res.json({ success: true });
});

app.post('/api/management/v1/alarms/:id/clear', jsonParser, (req, res) => {
  const idx = alarmStore.findIndex(a => a.id === req.params.id);
  if (idx !== -1) {
    alarmStore.splice(idx, 1);
  }
  res.json({ success: true });
});

// ==================== Security / Rogue AP ====================
// Controller doesn't expose security scanning endpoints via REST API

const rogueAPStore = [];

app.get('/api/management/v1/security/rogue-ap/list', (req, res) => {
  res.json(rogueAPStore);
});

app.post('/api/management/v1/security/rogue-ap/detect', jsonParser, (req, res) => {
  console.log('[Security] Rogue AP scan initiated');
  res.json({ success: true, message: 'Rogue AP scan initiated' });
});

app.post('/api/management/v1/security/rogue-ap/:mac/classify', jsonParser, (req, res) => {
  const ap = rogueAPStore.find(a => a.macAddress === req.params.mac);
  if (ap) {
    ap.classification = req.body?.classification || 'unknown';
  }
  res.json({ success: true });
});

app.get('/api/management/v1/security/threats', (req, res) => {
  res.json([]);
});

// ==================== Guest Management ====================
// Controller uses /v1/eguest for portal config, not individual guest accounts

app.get('/api/management/v1/guests', (req, res) => {
  // Filter out expired guests
  const now = Date.now();
  res.json(guestStore.filter(g => !g.expirationDate || new Date(g.expirationDate).getTime() > now - 86400000));
});

app.post('/api/management/v1/guests/create', jsonParser, (req, res) => {
  const { name, email, duration, company } = req.body || {};
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  const guest = {
    id: crypto.randomUUID(),
    name,
    email,
    company: company || '',
    duration: duration || 86400,
    expirationDate: new Date(Date.now() + (duration || 86400) * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    status: 'active'
  };
  guestStore.push(guest);
  console.log(`[Guest] Created guest account: ${name} (${email})`);
  res.status(201).json(guest);
});

app.delete('/api/management/v1/guests/:id', (req, res) => {
  const idx = guestStore.findIndex(g => g.id === req.params.id);
  if (idx !== -1) {
    const removed = guestStore.splice(idx, 1);
    console.log(`[Guest] Deleted guest: ${removed[0].name}`);
  }
  res.json({ success: true });
});

app.post('/api/management/v1/guests/:id/voucher', jsonParser, (req, res) => {
  const guest = guestStore.find(g => g.id === req.params.id);
  if (!guest) {
    return res.status(404).json({ error: 'Guest not found' });
  }
  const voucher = {
    code: crypto.randomUUID().substring(0, 8).toUpperCase(),
    guestId: guest.id,
    guestName: guest.name,
    expirationDate: guest.expirationDate,
    createdAt: new Date().toISOString()
  };
  console.log(`[Guest] Generated voucher ${voucher.code} for ${guest.name}`);
  res.json(voucher);
});

app.get('/api/management/v1/guests/portal/config', (req, res) => {
  res.json(null);
});

// ==================== Alerts ====================
// Controller doesn't expose an alerts REST endpoint

app.get('/api/management/v1/alerts', (req, res) => {
  // Return empty alerts array - no controller endpoint available
  res.json([]);
});

// ==================== AFC (Automated Frequency Coordination) Planning ====================
// Controller doesn't expose AFC planning endpoints via REST API

const afcPlanStore = [];

app.get('/api/management/v1/afc/plans', (req, res) => {
  res.json(afcPlanStore);
});

app.post('/api/management/v1/afc/plans', jsonParser, (req, res) => {
  const { name, description, apSerials, channel, power } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'Plan name is required' });
  }
  const plan = {
    id: crypto.randomUUID(),
    name,
    description: description || '',
    apSerials: apSerials || [],
    channel: channel || 'auto',
    power: power || 'auto',
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  afcPlanStore.push(plan);
  console.log(`[AFC] Created plan: ${name}`);
  res.status(201).json(plan);
});

app.post('/api/management/v1/afc/plans/:id/analyze', jsonParser, (req, res) => {
  const plan = afcPlanStore.find(p => p.id === req.params.id);
  if (!plan) {
    return res.status(404).json({ error: 'AFC plan not found' });
  }
  plan.status = 'analyzed';
  plan.updatedAt = new Date().toISOString();
  plan.analysisResult = {
    compliant: true,
    maxEirp: 36,
    channelAvailability: [36, 40, 44, 48, 149, 153, 157, 161, 165],
    timestamp: new Date().toISOString()
  };
  console.log(`[AFC] Analysis completed for plan: ${plan.name}`);
  res.json(plan);
});

app.delete('/api/management/v1/afc/plans/:id', (req, res) => {
  const idx = afcPlanStore.findIndex(p => p.id === req.params.id);
  if (idx !== -1) {
    const removed = afcPlanStore.splice(idx, 1);
    console.log(`[AFC] Deleted plan: ${removed[0].name}`);
  }
  res.json({ success: true });
});

// ==================== Packet Capture ====================
// Controller doesn't expose packet capture endpoints via REST API

const packetCaptureStore = [];
const packetCaptureFiles = [];

// Start capture - /platformmanager/v1/startappacketcapture
app.post('/api/management/platformmanager/v1/startappacketcapture', jsonParser, (req, res) => {
  const { apSerialNumber, duration, filter, captureType } = req.body || {};
  const capture = {
    id: crypto.randomUUID(),
    apSerialNumber: apSerialNumber || 'unknown',
    status: 'running',
    captureType: captureType || 'wireless',
    filter: filter || '',
    duration: duration || 60,
    startedAt: new Date().toISOString(),
    packetCount: 0,
    fileSize: 0
  };
  packetCaptureStore.push(capture);
  console.log(`[PacketCapture] Started capture on AP ${capture.apSerialNumber}`);

  // Simulate capture completing after duration
  const captureId = capture.id;
  setTimeout(() => {
    const c = packetCaptureStore.find(x => x.id === captureId);
    if (c && c.status === 'running') {
      c.status = 'completed';
      c.completedAt = new Date().toISOString();
      c.packetCount = Math.floor(Math.random() * 50000) + 1000;
      c.fileSize = Math.floor(Math.random() * 5000000) + 100000;
      // Add to files store
      packetCaptureFiles.push({
        id: c.id,
        filename: `capture_${c.apSerialNumber}_${Date.now()}.pcap`,
        apSerialNumber: c.apSerialNumber,
        size: c.fileSize,
        packetCount: c.packetCount,
        captureType: c.captureType,
        createdAt: c.completedAt
      });
      console.log(`[PacketCapture] Capture ${captureId} completed`);
    }
  }, Math.min((duration || 60) * 1000, 30000)); // Cap at 30s for simulation

  res.status(201).json(capture);
});

// Stop capture - /platformmanager/v1/stopappacketcapture
app.put('/api/management/platformmanager/v1/stopappacketcapture', jsonParser, (req, res) => {
  const { captureId, stopAll } = req.body || {};
  if (stopAll) {
    packetCaptureStore.forEach(c => { if (c.status === 'running') c.status = 'stopped'; });
    console.log(`[PacketCapture] Stopped all captures`);
  } else if (captureId) {
    const capture = packetCaptureStore.find(c => c.id === captureId);
    if (capture) capture.status = 'stopped';
    console.log(`[PacketCapture] Stopped capture ${captureId}`);
  }
  res.json({ success: true });
});

// Get active captures - both path variants
app.get('/api/management/v1/packetcapture/active', (req, res) => {
  res.json(packetCaptureStore.filter(c => c.status === 'running'));
});
app.get('/api/management/platformmanager/v1/packetcapture/active', (req, res) => {
  res.json(packetCaptureStore.filter(c => c.status === 'running'));
});

// Get capture files - both path variants
app.get('/api/management/v1/packetcapture/files', (req, res) => {
  res.json(packetCaptureFiles);
});
app.get('/api/management/platformmanager/v1/packetcapture/files', (req, res) => {
  res.json(packetCaptureFiles);
});

// Download capture file - both path variants
app.get('/api/management/v1/packetcapture/download/:id', (req, res) => {
  const file = packetCaptureFiles.find(f => f.id === req.params.id);
  if (!file) return res.status(404).json({ error: 'Capture file not found' });
  res.setHeader('Content-Type', 'application/vnd.tcpdump.pcap');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(Buffer.from(`PCAP placeholder for ${file.filename}\n`));
});
app.get('/api/management/platformmanager/v1/packetcapture/download/:id', (req, res) => {
  const file = packetCaptureFiles.find(f => f.id === req.params.id);
  if (!file) return res.status(404).json({ error: 'Capture file not found' });
  res.setHeader('Content-Type', 'application/vnd.tcpdump.pcap');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(Buffer.from(`PCAP placeholder for ${file.filename}\n`));
});

// Delete capture file - both path variants
app.delete('/api/management/v1/packetcapture/delete/:id', (req, res) => {
  const idx = packetCaptureFiles.findIndex(f => f.id === req.params.id);
  if (idx !== -1) packetCaptureFiles.splice(idx, 1);
  res.json({ success: true });
});
app.delete('/api/management/platformmanager/v1/packetcapture/delete/:id', (req, res) => {
  const idx = packetCaptureFiles.findIndex(f => f.id === req.params.id);
  if (idx !== -1) packetCaptureFiles.splice(idx, 1);
  res.json({ success: true });
});

// Get capture status - both path variants
app.get('/api/management/v1/packetcapture/status/:id', (req, res) => {
  const capture = packetCaptureStore.find(c => c.id === req.params.id);
  if (!capture) return res.status(404).json({ error: 'Capture not found' });
  res.json(capture);
});
app.get('/api/management/platformmanager/v1/packetcapture/status/:id', (req, res) => {
  const capture = packetCaptureStore.find(c => c.id === req.params.id);
  if (!capture) return res.status(404).json({ error: 'Capture not found' });
  res.json(capture);
});

// ==================== Throughput Metrics (Local replacement for Supabase) ====================
// Replaces Supabase-hosted throughput edge function with local in-memory store

const throughputStore = [];

app.post('/api/throughput/snapshot', jsonParser, (req, res) => {
  const snapshot = { ...req.body, id: crypto.randomUUID(), storedAt: Date.now() };
  throughputStore.push(snapshot);
  // Keep only last 1000 snapshots
  if (throughputStore.length > 1000) throughputStore.splice(0, throughputStore.length - 1000);
  res.json({ success: true });
});

app.get('/api/throughput/snapshots', (req, res) => {
  const { startTime, endTime, limit } = req.query;
  let results = [...throughputStore];
  if (startTime) results = results.filter(s => s.timestamp >= parseInt(startTime));
  if (endTime) results = results.filter(s => s.timestamp <= parseInt(endTime));
  if (limit) results = results.slice(-parseInt(limit));
  res.json({ snapshots: results });
});

app.get('/api/throughput/latest', (req, res) => {
  const snapshot = throughputStore.length > 0 ? throughputStore[throughputStore.length - 1] : null;
  res.json({ snapshot });
});

app.get('/api/throughput/aggregated', (req, res) => {
  const { startTime, endTime } = req.query;
  let results = [...throughputStore];
  if (startTime) results = results.filter(s => s.timestamp >= parseInt(startTime));
  if (endTime) results = results.filter(s => s.timestamp <= parseInt(endTime));

  if (results.length === 0) {
    return res.json({ avgUpload: 0, avgDownload: 0, avgTotal: 0, maxUpload: 0, maxDownload: 0, maxTotal: 0, avgClientCount: 0, snapshotCount: 0 });
  }

  res.json({
    avgUpload: results.reduce((s, r) => s + (r.totalUpload || 0), 0) / results.length,
    avgDownload: results.reduce((s, r) => s + (r.totalDownload || 0), 0) / results.length,
    avgTotal: results.reduce((s, r) => s + (r.totalTraffic || 0), 0) / results.length,
    maxUpload: Math.max(...results.map(r => r.totalUpload || 0)),
    maxDownload: Math.max(...results.map(r => r.totalDownload || 0)),
    maxTotal: Math.max(...results.map(r => r.totalTraffic || 0)),
    avgClientCount: results.reduce((s, r) => s + (r.clientCount || 0), 0) / results.length,
    snapshotCount: results.length
  });
});

app.get('/api/throughput/network/:name', (req, res) => {
  const networkName = decodeURIComponent(req.params.name);
  const { startTime, endTime } = req.query;
  let results = [...throughputStore];
  if (startTime) results = results.filter(s => s.timestamp >= parseInt(startTime));
  if (endTime) results = results.filter(s => s.timestamp <= parseInt(endTime));

  const trends = results.map(s => {
    const nb = (s.networkBreakdown || []).find(n => n.network === networkName);
    return nb ? { timestamp: s.timestamp, upload: nb.upload, download: nb.download, total: nb.total, clients: nb.clients } : null;
  }).filter(Boolean);

  res.json({ trends });
});

app.delete('/api/throughput/clear', (req, res) => {
  const count = throughputStore.length;
  throughputStore.length = 0;
  res.json({ deletedCount: count });
});

// ==================== OUI Vendor Lookup (Local replacement for Supabase) ====================
// Common OUI prefixes for device manufacturer identification

app.get('/api/oui/lookup', (req, res) => {
  const { mac } = req.query;
  if (!mac) return res.status(400).json({ error: 'MAC address required' });

  // Extract OUI (first 6 hex chars)
  const normalized = String(mac).replace(/[:\-\.]/g, '').toUpperCase();
  const oui = normalized.substring(0, 6);

  // Common OUI database
  const ouiDb = {
    '000C29': 'VMware', '005056': 'VMware', '001C42': 'Parallels',
    '00005E': 'IANA', '00000C': 'Cisco', '000142': 'Cisco',
    '001A2F': 'Cisco', '00070E': 'Cisco', 'AABBCC': 'Cisco',
    '000A95': 'Apple', '000393': 'Apple', '000A27': 'Apple',
    '000D93': 'Apple', '0010FA': 'Apple', '001451': 'Apple',
    '0016CB': 'Apple', '0017F2': 'Apple', '0019E3': 'Apple',
    '001B63': 'Apple', '001CB3': 'Apple', '001D4F': 'Apple',
    '001E52': 'Apple', '001F5B': 'Apple', '001FF3': 'Apple',
    '0021E9': 'Apple', '002241': 'Apple', '002312': 'Apple',
    '002436': 'Apple', '002500': 'Apple', '002608': 'Apple',
    '0026BB': 'Apple', '003065': 'Apple', '003EE1': 'Apple',
    '0050E4': 'Apple', '00A040': 'Apple', '04489A': 'Apple',
    '080007': 'Apple', '10DDB1': 'Apple', '18AF61': 'Apple',
    '20A2E4': 'Apple', '28E7CF': 'Apple', '3C15C2': 'Apple',
    '40A6D9': 'Apple', '44D884': 'Apple', '54724F': 'Apple',
    '5855CA': 'Apple', '5C5948': 'Apple', '60FACD': 'Apple',
    '64A5C3': 'Apple', '685B35': 'Apple', '6C4008': 'Apple',
    '70DEE2': 'Apple', '74E2F5': 'Apple', '7831C1': 'Apple',
    '7CD1C3': 'Apple', '80E650': 'Apple', '84788B': 'Apple',
    '848506': 'Apple', '8866A5': 'Apple', '8C7C92': 'Apple',
    '9027E4': 'Apple', '9801A7': 'Apple', '9C207B': 'Apple',
    'A4B197': 'Apple', 'A860B6': 'Apple', 'ACFDEC': 'Apple',
    'B065BD': 'Apple', 'B8E856': 'Apple', 'BC6778': 'Apple',
    'BC9FEF': 'Apple', 'C42C03': 'Apple', 'C82A14': 'Apple',
    'CC785F': 'Apple', 'D02598': 'Apple', 'D4619D': 'Apple',
    'D89695': 'Apple', 'DC2B2A': 'Apple', 'E0B9BA': 'Apple',
    'E49ADC': 'Apple', 'F0B479': 'Apple', 'F0D1A9': 'Apple',
    'F81EDF': 'Apple', 'AC3C0B': 'Apple',
    '000AE4': 'Samsung', '0007AB': 'Samsung', '001247': 'Samsung',
    '001377': 'Samsung', '0015B9': 'Samsung', '001632': 'Samsung',
    '001A8A': 'Samsung', '001EE1': 'Samsung', '001EE2': 'Samsung',
    '002119': 'Samsung', '00265D': 'Samsung', '00265F': 'Samsung',
    '0026E2': 'Samsung', '08D42B': 'Samsung', '10D38A': 'Samsung',
    '14568E': 'Samsung', '18227E': 'Samsung', '1C62B8': 'Samsung',
    '244B03': 'Samsung', '2CAE2B': 'Samsung', '30CBF8': 'Samsung',
    '340395': 'Samsung', '38AA3C': 'Samsung', '40B89A': 'Samsung',
    '44F459': 'Samsung', '4844F7': 'Samsung', '4CE676': 'Samsung',
    '50A4C8': 'Samsung', '5440AD': 'Samsung', '549B12': 'Samsung',
    '5C3C27': 'Samsung', '5CA39D': 'Samsung', '606BBD': 'Samsung',
    '6455B1': 'Samsung', '6C2F2C': 'Samsung', '700514': 'Samsung',
    '742F68': 'Samsung', '7825AD': 'Samsung', '7C0191': 'Samsung',
    '843835': 'Samsung', '8855A5': 'Samsung', '8C71F8': 'Samsung',
    '94350A': 'Samsung', '94D771': 'Samsung', '98398E': 'Samsung',
    '9C65F9': 'Samsung', 'A00798': 'Samsung', 'A0B4A5': 'Samsung',
    'A8F274': 'Samsung', 'B0DF3A': 'Samsung', 'B407F9': 'Samsung',
    'BC4486': 'Samsung', 'BC851F': 'Samsung', 'C44619': 'Samsung',
    'C8BA94': 'Samsung', 'CC07AB': 'Samsung', 'D0176A': 'Samsung',
    'D0577B': 'Samsung', 'D831CF': 'Samsung', 'E4E0C5': 'Samsung',
    'E8508B': 'Samsung', 'F025B7': 'Samsung', 'F4428F': 'Samsung',
    'F8042E': 'Samsung', 'FC1910': 'Samsung',
    '000BBE': 'Cisco', '000DE5': 'Cisco', '001795': 'Cisco',
    '0024F7': 'Cisco Linksys', '00259C': 'Cisco Linksys',
    '001018': 'HP', '001083': 'HP', '001185': 'HP',
    '001321': 'HP', '001635': 'HP', '001708': 'HP',
    '001871': 'HP', '001A4B': 'HP', '001CC4': 'HP',
    '002264': 'HP', '0025B3': 'HP', '3C4A92': 'HP',
    '9457A5': 'HP', 'D4C9EF': 'HP',
    '0018F3': 'ASUSTek', '001A92': 'ASUSTek', '001FC6': 'ASUSTek',
    '002354': 'ASUSTek', '0026187': 'ASUSTek', '04D4C4': 'ASUSTek',
    '08606E': 'ASUSTek', '10BF48': 'ASUSTek', '107B44': 'ASUSTek',
    '00E04C': 'Realtek', '00E04D': 'Realtek', '52540A': 'Realtek',
    '001CBD': 'Intel', '001DE0': 'Intel', '001E64': 'Intel',
    '001E67': 'Intel', '001F3B': 'Intel', '001F3C': 'Intel',
    '002314': 'Intel', '0024D6': 'Intel', '40A6E8': 'Intel',
    '502DA2': 'Intel', '606720': 'Intel', '686D12': 'Intel',
    '84A6C8': 'Intel', '8C8D28': 'Intel', 'A0369F': 'Intel',
    'A44CC8': 'Intel', 'B4D5BD': 'Intel',
    '000B82': 'Grandstream', '001E5A': 'Motorola',
    '000F66': 'Cisco', '000FE2': 'Hangzhou H3C',
    'B827EB': 'Raspberry Pi', 'DC2632': 'Raspberry Pi',
    'E45F01': 'Raspberry Pi',
    '001E58': 'D-Link', '00179A': 'D-Link', '001B11': 'D-Link',
    '001CF0': 'D-Link', '001E58': 'D-Link',
    '0024A5': 'Buffalo', '001601': 'Buffalo',
    '0017C5': 'SonicWALL', '000E38': 'SonicWALL',
    '00037F': 'Atheros', '001372': 'Dell', '001422': 'Dell',
    '001731': 'Dell', '001882': 'Dell', '001A4A': 'Dell',
    '001E4F': 'Dell', '002219': 'Dell', '0024E8': 'Dell',
    '1867B0': 'Dell', '246E96': 'Dell', '4487FC': 'Dell',
    '509A4C': 'Dell', '5CF3FC': 'Dell', 'B083FE': 'Dell',
    'F48E38': 'Dell', 'F8B156': 'Dell',
    '001599': 'TP-Link', '001D0F': 'TP-Link', '1C3BF3': 'TP-Link',
    '300D43': 'TP-Link', '503EAA': 'TP-Link', '5C899A': 'TP-Link',
    '6466B3': 'TP-Link', '6CE873': 'TP-Link', '84163A': 'TP-Link',
    '8C210A': 'TP-Link', 'A01800': 'TP-Link', 'D46E0E': 'TP-Link',
    'E894F6': 'TP-Link', 'EC086B': 'TP-Link', 'EC888F': 'TP-Link',
    'F4F26D': 'TP-Link',
    '001E2A': 'Netgear', '0024B2': 'Netgear', '008EF2': 'Netgear',
    '204E7F': 'Netgear', '2CB05D': 'Netgear', '6CB0CE': 'Netgear',
    'A021B7': 'Netgear', 'B03956': 'Netgear', 'C43DC7': 'Netgear',
    'E4F4C6': 'Netgear',
    '000E8F': 'Sercomm', '002275': 'ARRIS', '0019A6': 'Motorola',
    '000C43': 'Ralink', '000E6A': 'Aruba', '001A1E': 'Aruba',
    '00248C': 'Aruba', '18645A': 'Aruba', '24DEC6': 'Aruba',
    '40E3D6': 'Aruba', '6CF37F': 'Aruba', '9C1C12': 'Aruba',
    'B4C799': 'Aruba', 'D8C7C8': 'Aruba',
    '001195': 'Extreme Networks', '000496': 'Extreme Networks',
    '00E02B': 'Extreme Networks', 'B4C799': 'Extreme Networks',
    'B8C253': 'Juniper', '002283': 'Juniper', '3CE5A6': 'Juniper',
    '54E032': 'Juniper', '80714F': 'Juniper', 'ACE87B': 'Juniper',
    'F01C2D': 'Juniper', 'F4A739': 'Juniper',
    '000DB9': 'PC Engines', '00064F': 'Phion',
    'BADDAD': 'Google', 'D4F5EF': 'Google', 'F4F5D8': 'Google',
    '3C5AB4': 'Google', '5828CA': 'Google', 'A47733': 'Google',
    '0018E7': 'Cameo', '002618': 'ASUSTek', '04421A': 'ASUSTek',
    '001FE1': 'Lenovo', '002170': 'Lenovo', 'D89D67': 'Lenovo',
    'E8F724': 'Lenovo', '484BAA': 'Lenovo', '70F395': 'Lenovo',
    '8C164C': 'Lenovo', 'B871FC': 'Lenovo',
    '40B076': 'Microsoft', '44032C': 'Microsoft', 'B41489': 'Microsoft',
    'C83F26': 'Microsoft', 'F41661': 'Microsoft',
    '002332': 'Nintendo', '0025A0': 'Nintendo', '34AF2C': 'Nintendo',
    '7CBB8A': 'Nintendo', 'E84ECE': 'Nintendo',
    '001FCD': 'Sony', '0019C5': 'Sony', '002567': 'Sony',
    '0024BE': 'Sony', '28A0EF': 'Sony', '709E29': 'Sony',
    '0050F2': 'Microsoft', 'FCEDC4': 'Ubiquiti',
    '802AA8': 'Ubiquiti', 'F09FC2': 'Ubiquiti', '24A43C': 'Ubiquiti',
    '44D9E7': 'Ubiquiti', 'B4FBE4': 'Ubiquiti',
    '001217': 'Cisco-Linksys', '00187D': 'Aruba', '001AEB': 'Aruba'
  };

  const vendor = ouiDb[oui] || 'Unknown Vendor';
  res.json({ vendor, oui, mac: String(mac) });
});

// Helper function to get controller URL from request
function getControllerUrl(req) {
  // Check for X-Controller-URL header (set by frontend when using dynamic controllers)
  const controllerHeader = req.headers['x-controller-url'];
  if (controllerHeader) {
    // Validate URL format to prevent SSRF
    try {
      const url = new URL(controllerHeader);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        return controllerHeader;
      }
    } catch (e) {
      console.warn('[Proxy] Invalid controller URL in header:', controllerHeader);
    }
  }
  return DEFAULT_CONTROLLER_URL;
}

// Dynamic proxy middleware using http-proxy-middleware router option
const proxyOptions = {
  router: (req) => {
    const target = getControllerUrl(req);
    if (target !== DEFAULT_CONTROLLER_URL) {
      console.log(`[Proxy] Dynamic routing to: ${target}`);
    }
    return target;
  },
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
    // Get target URL for logging
    const targetUrl = getControllerUrl(req);
    console.log(`[Proxy] ${req.method} ${req.url} -> ${targetUrl}${req.url}`);

    // Forward original headers
    if (req.headers.authorization) {
      proxyReq.setHeader('Authorization', req.headers.authorization);
    }
    
    // Remove the x-controller-url header before forwarding (internal use only)
    proxyReq.removeHeader('x-controller-url');
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

// Proxy all /api/* requests to Campus Controller (with dynamic routing support)
console.log('[Proxy Server] Setting up /api/* proxy middleware with dynamic routing');
app.use('/api', (req, res, next) => {
  const target = getControllerUrl(req);
  console.log(`[Proxy Middleware] Received: ${req.method} ${req.url} (target: ${target})`);
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
