#!/usr/bin/env node

/**
 * Network Metrics Background Collector
 *
 * Continuously collects service metrics from Campus Controller API
 * and stores them in Supabase for historical analysis.
 *
 * Usage:
 *   node metrics-collector.js
 *
 * Environment Variables (create a .env file):
 *   CAMPUS_CONTROLLER_URL=https://tsophiea.ddns.net:443/management
 *   CAMPUS_CONTROLLER_USER=your_username
 *   CAMPUS_CONTROLLER_PASSWORD=your_password
 *   VITE_SUPABASE_URL=https://sdcanlpqxfjcmjpeaesj.supabase.co
 *   VITE_SUPABASE_ANON_KEY=your_anon_key
 *   COLLECTION_INTERVAL_MINUTES=15
 */

import { createClient } from '@supabase/supabase-js';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file if it exists
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}

loadEnv();

// Configuration
const CONFIG = {
  campusController: {
    baseUrl: process.env.CAMPUS_CONTROLLER_URL || 'https://tsophiea.ddns.net:443/management',
    userId: process.env.CAMPUS_CONTROLLER_USER,
    password: process.env.CAMPUS_CONTROLLER_PASSWORD
  },
  supabase: {
    url: process.env.VITE_SUPABASE_URL,
    anonKey: process.env.VITE_SUPABASE_ANON_KEY
  },
  // Default to 30 minutes to stay within Railway free tier (500 hours/month)
  // Worker runs 24/7 = 720 hours/month, so we need to be efficient
  // 30-min interval provides good historical data while being cost-effective
  collectionIntervalMinutes: parseInt(process.env.COLLECTION_INTERVAL_MINUTES || '30', 10)
};

// Validate configuration
function validateConfig() {
  const errors = [];

  if (!CONFIG.campusController.userId) {
    errors.push('CAMPUS_CONTROLLER_USER is required');
  }
  if (!CONFIG.campusController.password) {
    errors.push('CAMPUS_CONTROLLER_PASSWORD is required');
  }
  if (!CONFIG.supabase.url) {
    errors.push('VITE_SUPABASE_URL is required');
  }
  if (!CONFIG.supabase.anonKey) {
    errors.push('VITE_SUPABASE_ANON_KEY is required');
  }

  if (errors.length > 0) {
    console.error('❌ Configuration errors:');
    errors.forEach(err => console.error(`   - ${err}`));
    console.error('\nCreate a .env file with the required variables. See .env.example for reference.');
    process.exit(1);
  }
}

// Initialize Supabase client
let supabase;
try {
  supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);
} catch (error) {
  console.error('❌ Failed to initialize Supabase client:', error.message);
  process.exit(1);
}

// API Service Class
class MetricsCollector {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
  }

  // Make HTTP/HTTPS request with timeout
  async makeRequest(url, options = {}, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const lib = isHttps ? https : http;

      const requestOptions = {
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: timeoutMs,
        // Allow self-signed certificates (for lab environments)
        rejectUnauthorized: false
      };

      const req = lib.request(url, requestOptions, (res) => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            json: async () => JSON.parse(data),
            text: async () => data
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  // Login to Campus Controller
  async login() {
    console.log('🔐 Authenticating with Campus Controller...');

    const authBody = JSON.stringify({
      grantType: 'password',
      userId: CONFIG.campusController.userId,
      password: CONFIG.campusController.password
    });

    try {
      const response = await this.makeRequest(
        `${CONFIG.campusController.baseUrl}/v1/oauth2/token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: authBody
        },
        10000
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Authentication failed (${response.status}): ${errorText}`);
      }

      const authData = await response.json();
      this.accessToken = authData.access_token;
      this.refreshToken = authData.refresh_token;

      console.log('✅ Authentication successful');
      return true;
    } catch (error) {
      console.error('❌ Authentication failed:', error.message);
      return false;
    }
  }

  // Make authenticated request
  async makeAuthenticatedRequest(endpoint, options = {}, timeoutMs = 10000) {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const url = `${CONFIG.campusController.baseUrl}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Accept': 'application/json',
      ...options.headers
    };

    return this.makeRequest(url, { ...options, headers }, timeoutMs);
  }

  // Fetch all services
  async fetchServices() {
    try {
      const response = await this.makeAuthenticatedRequest('/v1/services', {}, 15000);

      if (!response.ok) {
        throw new Error(`Failed to fetch services: ${response.status}`);
      }

      const data = await response.json();
      const services = Array.isArray(data) ? data : (data.services || data.data || []);

      return services;
    } catch (error) {
      console.error('❌ Failed to fetch services:', error.message);
      return [];
    }
  }

  // Fetch service report (metrics)
  async fetchServiceReport(serviceId) {
    try {
      const response = await this.makeAuthenticatedRequest(
        `/v1/services/${serviceId}/report`,
        {},
        15000
      );

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  // Fetch service stations (clients)
  async fetchServiceStations(serviceId) {
    try {
      const response = await this.makeAuthenticatedRequest(
        `/v1/services/${serviceId}/stations`,
        {},
        15000
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return Array.isArray(data) ? data : (data.stations || data.clients || []);
    } catch (error) {
      return [];
    }
  }

  // Save metrics to Supabase
  async saveMetrics(serviceId, serviceName, metrics) {
    try {
      const { error } = await supabase
        .from('service_metrics_snapshots')
        .insert({
          service_id: serviceId,
          service_name: serviceName,
          timestamp: new Date().toISOString(),
          metrics: metrics
        });

      if (error) {
        console.error(`   ❌ Failed to save metrics for ${serviceName}:`, error.message);
        return false;
      }

      return true;
    } catch (error) {
      console.error(`   ❌ Error saving metrics for ${serviceName}:`, error.message);
      return false;
    }
  }

  // Collect metrics for all services
  async collectAllMetrics() {
    console.log('\n📊 Starting metrics collection...');
    const timestamp = new Date().toISOString();
    console.log(`   Time: ${timestamp}`);

    // Fetch services
    const services = await this.fetchServices();

    if (services.length === 0) {
      console.log('   ⚠️  No services found');
      return;
    }

    console.log(`   Found ${services.length} services`);

    let successCount = 0;
    let failCount = 0;

    // Collect metrics for each service
    for (const service of services) {
      const serviceId = service.id;
      const serviceName = service.name || serviceId;

      try {
        // Fetch report and stations
        const [report, stations] = await Promise.all([
          this.fetchServiceReport(serviceId),
          this.fetchServiceStations(serviceId)
        ]);

        // Prepare metrics object
        const metrics = {
          clientCount: stations.length,
          ...(report?.metrics || {}),
          stations: stations.slice(0, 100).map(s => ({ // Store summary of top 100 clients
            macAddress: s.macAddress,
            rssi: s.rssi,
            snr: s.snr
          }))
        };

        // Save to Supabase
        const saved = await this.saveMetrics(serviceId, serviceName, metrics);

        if (saved) {
          console.log(`   ✅ ${serviceName}: ${stations.length} clients`);
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        console.error(`   ❌ Failed to collect metrics for ${serviceName}:`, error.message);
        failCount++;
      }
    }

    console.log(`\n✨ Collection complete: ${successCount} success, ${failCount} failed`);
  }
}

// Main execution
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        Network Metrics Background Collector               ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Validate configuration
  validateConfig();

  console.log('⚙️  Configuration:');
  console.log(`   Campus Controller: ${CONFIG.campusController.baseUrl}`);
  console.log(`   User: ${CONFIG.campusController.userId}`);
  console.log(`   Supabase: ${CONFIG.supabase.url}`);
  console.log(`   Collection Interval: ${CONFIG.collectionIntervalMinutes} minutes\n`);

  const collector = new MetricsCollector();

  // Initial authentication
  const authenticated = await collector.login();
  if (!authenticated) {
    console.error('❌ Failed to authenticate. Exiting.');
    process.exit(1);
  }

  // Test Supabase connection
  console.log('\n🔍 Testing Supabase connection...');
  try {
    const { error } = await supabase.from('service_metrics_snapshots').select('count').limit(1);
    if (error) throw error;
    console.log('✅ Supabase connection successful\n');
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    console.error('   Make sure you have run the database schema (supabase-schema-enhanced.sql)');
    process.exit(1);
  }

  // Run initial collection
  await collector.collectAllMetrics();

  // Schedule periodic collection
  const intervalMs = CONFIG.collectionIntervalMinutes * 60 * 1000;
  console.log(`\n⏰ Scheduled to run every ${CONFIG.collectionIntervalMinutes} minutes`);
  console.log('   Press Ctrl+C to stop\n');

  setInterval(async () => {
    try {
      await collector.collectAllMetrics();
    } catch (error) {
      console.error('❌ Collection error:', error.message);

      // Try to re-authenticate if token expired
      if (error.message.includes('token') || error.message.includes('auth')) {
        console.log('🔄 Attempting to re-authenticate...');
        await collector.login();
      }
    }
  }, intervalMs);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Shutting down gracefully...');
  process.exit(0);
});

// Start the collector
main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
