/**
 * AWS Lambda Function: Network Metrics Collector
 *
 * Collects service metrics from Campus Controller API and stores in Supabase.
 * Designed to run on AWS Lambda with EventBridge scheduled trigger (every 15 minutes).
 *
 * Environment Variables Required:
 *   - CAMPUS_CONTROLLER_URL: Campus Controller API base URL
 *   - CAMPUS_CONTROLLER_USER: Username for authentication
 *   - CAMPUS_CONTROLLER_PASSWORD: Password for authentication
 *   - SUPABASE_URL: Supabase project URL
 *   - SUPABASE_ANON_KEY: Supabase anonymous/public key
 */

import https from 'https';
import http from 'http';

// Parse environment variables
const CONFIG = {
  campusController: {
    baseUrl: process.env.CAMPUS_CONTROLLER_URL || 'https://tsophiea.ddns.net:443/management',
    userId: process.env.CAMPUS_CONTROLLER_USER,
    password: process.env.CAMPUS_CONTROLLER_PASSWORD
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY
  }
};

/**
 * Make HTTP/HTTPS request with timeout
 */
async function makeRequest(url, options = {}, timeoutMs = 10000) {
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

/**
 * Authenticate with Campus Controller
 */
async function authenticate() {
  console.log('🔐 Authenticating with Campus Controller...');

  const authBody = JSON.stringify({
    grantType: 'password',
    userId: CONFIG.campusController.userId,
    password: CONFIG.campusController.password
  });

  const response = await makeRequest(
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
  console.log('✅ Authentication successful');

  return authData.access_token;
}

/**
 * Make authenticated request to Campus Controller
 */
async function makeAuthenticatedRequest(accessToken, endpoint, options = {}, timeoutMs = 10000) {
  const url = `${CONFIG.campusController.baseUrl}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json',
    ...options.headers
  };

  return makeRequest(url, { ...options, headers }, timeoutMs);
}

/**
 * Fetch all services from Campus Controller
 */
async function fetchServices(accessToken) {
  const response = await makeAuthenticatedRequest(accessToken, '/v1/services', {}, 15000);

  if (!response.ok) {
    throw new Error(`Failed to fetch services: ${response.status}`);
  }

  const data = await response.json();
  const services = Array.isArray(data) ? data : (data.services || data.data || []);

  return services;
}

/**
 * Fetch service report (metrics)
 */
async function fetchServiceReport(accessToken, serviceId) {
  try {
    const response = await makeAuthenticatedRequest(
      accessToken,
      `/v1/services/${serviceId}/report`,
      {},
      15000
    );

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn(`⚠️  Failed to fetch report for ${serviceId}:`, error.message);
    return null;
  }
}

/**
 * Fetch service stations (clients)
 */
async function fetchServiceStations(accessToken, serviceId) {
  try {
    const response = await makeAuthenticatedRequest(
      accessToken,
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
    console.warn(`⚠️  Failed to fetch stations for ${serviceId}:`, error.message);
    return [];
  }
}

/**
 * Save metrics to Supabase
 */
async function saveMetricsToSupabase(serviceId, serviceName, metrics) {
  const payload = {
    service_id: serviceId,
    service_name: serviceName,
    timestamp: new Date().toISOString(),
    metrics: metrics
  };

  const response = await makeRequest(
    `${CONFIG.supabase.url}/rest/v1/service_metrics`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': CONFIG.supabase.anonKey,
        'Authorization': `Bearer ${CONFIG.supabase.anonKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    },
    10000
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to save metrics: ${response.status} - ${errorText}`);
  }

  return true;
}

/**
 * Main Lambda handler
 */
export const handler = async (event, context) => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     AWS Lambda: Network Metrics Collector                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`Request ID: ${context.requestId}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // Validate configuration
  const missingVars = [];
  if (!CONFIG.campusController.userId) missingVars.push('CAMPUS_CONTROLLER_USER');
  if (!CONFIG.campusController.password) missingVars.push('CAMPUS_CONTROLLER_PASSWORD');
  if (!CONFIG.supabase.url) missingVars.push('SUPABASE_URL');
  if (!CONFIG.supabase.anonKey) missingVars.push('SUPABASE_ANON_KEY');

  if (missingVars.length > 0) {
    const error = `Missing environment variables: ${missingVars.join(', ')}`;
    console.error('❌', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error })
    };
  }

  let accessToken;
  let servicesCollected = 0;
  let servicesFailed = 0;
  const errors = [];

  try {
    // Authenticate
    accessToken = await authenticate();

    // Fetch services
    console.log('📊 Fetching services...');
    const services = await fetchServices(accessToken);

    if (services.length === 0) {
      console.log('⚠️  No services found');
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'No services found',
          servicesCollected: 0,
          servicesFailed: 0
        })
      };
    }

    console.log(`Found ${services.length} services\n`);

    // Collect metrics for each service
    for (const service of services) {
      const serviceId = service.id;
      const serviceName = service.name || serviceId;

      try {
        console.log(`📡 Collecting: ${serviceName}`);

        // Fetch report and stations in parallel
        const [report, stations] = await Promise.all([
          fetchServiceReport(accessToken, serviceId),
          fetchServiceStations(accessToken, serviceId)
        ]);

        // Prepare metrics object
        const metrics = {
          clientCount: stations.length,
          ...(report?.metrics || {}),
          stations: stations.slice(0, 100).map(s => ({
            macAddress: s.macAddress,
            rssi: s.rssi,
            snr: s.snr
          }))
        };

        // Save to Supabase
        await saveMetricsToSupabase(serviceId, serviceName, metrics);

        console.log(`   ✅ ${serviceName}: ${stations.length} clients`);
        servicesCollected++;

      } catch (error) {
        console.error(`   ❌ ${serviceName}: ${error.message}`);
        errors.push({ service: serviceName, error: error.message });
        servicesFailed++;
      }
    }

    console.log(`\n✨ Collection complete: ${servicesCollected} success, ${servicesFailed} failed`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Metrics collection complete',
        timestamp: new Date().toISOString(),
        servicesCollected,
        servicesFailed,
        errors: errors.length > 0 ? errors : undefined
      })
    };

  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    console.error(error.stack);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        servicesCollected,
        servicesFailed
      })
    };
  }
};
