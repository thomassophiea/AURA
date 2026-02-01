import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as throughputTracker from './throughput_tracker.tsx';
import * as ouiLookup from './oui_lookup.tsx';

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-efba0687/health", (c) => {
  const envCheck = {
    supabaseUrl: !!Deno.env.get("SUPABASE_URL"),
    serviceRoleKey: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    dbUrl: !!Deno.env.get("SUPABASE_DB_URL")
  };
  
  return c.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    environment: envCheck
  });
});

// Database health check endpoint
app.get("/make-server-efba0687/db-health", async (c) => {
  try {
    // Lazy load kv module only when database is actually needed
    const kv = await import("./kv_store.tsx");
    
    // Test basic database connectivity with a simple operation
    const testKey = "health-check";
    const testValue = { timestamp: new Date().toISOString() };
    
    await kv.set(testKey, testValue);
    const retrieved = await kv.get(testKey);
    await kv.del(testKey);
    
    return c.json({ 
      status: "ok", 
      database: "connected",
      timestamp: new Date().toISOString(),
      test: retrieved 
    });
  } catch (error) {
    console.error('Database health check failed:', error);
    return c.json({ 
      status: "error", 
      database: "disconnected",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }, 500);
  }
});

// ==================== Key-Value Store Endpoints ====================

// Set a key-value pair
app.post("/make-server-efba0687/kv/set", async (c) => {
  try {
    const kv = await import("./kv_store.tsx");
    const { key, value } = await c.req.json();
    
    if (!key) {
      return c.json({ error: "Key is required" }, 400);
    }
    
    await kv.set(key, value);
    return c.json({ success: true, key });
  } catch (error) {
    console.error('KV set failed:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : "Failed to set value"
    }, 500);
  }
});

// Get a value by key
app.get("/make-server-efba0687/kv/get", async (c) => {
  try {
    const kv = await import("./kv_store.tsx");
    const key = c.req.query("key");
    
    if (!key) {
      return c.json({ error: "Key parameter is required" }, 400);
    }
    
    const value = await kv.get(key);
    return c.json({ key, value });
  } catch (error) {
    console.error('KV get failed:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : "Failed to get value"
    }, 500);
  }
});

// Delete a key
app.delete("/make-server-efba0687/kv/delete", async (c) => {
  try {
    const kv = await import("./kv_store.tsx");
    const { key } = await c.req.json();
    
    if (!key) {
      return c.json({ error: "Key is required" }, 400);
    }
    
    await kv.del(key);
    return c.json({ success: true, key });
  } catch (error) {
    console.error('KV delete failed:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : "Failed to delete value"
    }, 500);
  }
});

// Get values by prefix
app.get("/make-server-efba0687/kv/prefix", async (c) => {
  try {
    const kv = await import("./kv_store.tsx");
    const prefix = c.req.query("prefix");
    
    if (!prefix) {
      return c.json({ error: "Prefix parameter is required" }, 400);
    }
    
    const values = await kv.getByPrefix(prefix);
    return c.json({ prefix, values });
  } catch (error) {
    console.error('KV getByPrefix failed:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : "Failed to get values by prefix"
    }, 500);
  }
});

// Multiple set operation
app.post("/make-server-efba0687/kv/mset", async (c) => {
  try {
    const kv = await import("./kv_store.tsx");
    const { keys, values } = await c.req.json();
    
    if (!keys || !values || keys.length !== values.length) {
      return c.json({ error: "Keys and values arrays are required and must be the same length" }, 400);
    }
    
    await kv.mset(keys, values);
    return c.json({ success: true, count: keys.length });
  } catch (error) {
    console.error('KV mset failed:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : "Failed to set multiple values"
    }, 500);
  }
});

// Multiple get operation
app.post("/make-server-efba0687/kv/mget", async (c) => {
  try {
    const kv = await import("./kv_store.tsx");
    const { keys } = await c.req.json();
    
    if (!keys || !Array.isArray(keys)) {
      return c.json({ error: "Keys array is required" }, 400);
    }
    
    const values = await kv.mget(keys);
    return c.json({ keys, values });
  } catch (error) {
    console.error('KV mget failed:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : "Failed to get multiple values"
    }, 500);
  }
});

// ==================== Throughput Tracking Endpoints ====================

// Store a throughput snapshot
app.post("/make-server-efba0687/throughput/snapshot", async (c) => {
  try {
    const snapshot = await c.req.json();
    
    if (!snapshot.timestamp || typeof snapshot.totalUpload !== 'number' || typeof snapshot.totalDownload !== 'number') {
      return c.json({ error: "Invalid snapshot data. Required fields: timestamp, totalUpload, totalDownload" }, 400);
    }
    
    await throughputTracker.storeThroughputSnapshot(snapshot);
    return c.json({ success: true, timestamp: snapshot.timestamp });
  } catch (error) {
    console.error('Failed to store throughput snapshot:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : "Failed to store throughput snapshot"
    }, 500);
  }
});

// Get throughput snapshots within a time range
app.get("/make-server-efba0687/throughput/snapshots", async (c) => {
  try {
    const startTime = c.req.query("startTime") ? parseInt(c.req.query("startTime")!) : undefined;
    const endTime = c.req.query("endTime") ? parseInt(c.req.query("endTime")!) : undefined;
    const limit = c.req.query("limit") ? parseInt(c.req.query("limit")!) : undefined;
    
    const snapshots = await throughputTracker.getThroughputSnapshots(startTime, endTime, limit);
    return c.json({ snapshots, count: snapshots.length });
  } catch (error) {
    console.error('Failed to get throughput snapshots:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : "Failed to get throughput snapshots"
    }, 500);
  }
});

// Get the latest throughput snapshot
app.get("/make-server-efba0687/throughput/latest", async (c) => {
  try {
    const snapshot = await throughputTracker.getLatestThroughputSnapshot();
    return c.json({ snapshot });
  } catch (error) {
    console.error('Failed to get latest throughput snapshot:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : "Failed to get latest throughput snapshot"
    }, 500);
  }
});

// Get aggregated throughput statistics
app.get("/make-server-efba0687/throughput/aggregated", async (c) => {
  try {
    const startTime = c.req.query("startTime");
    const endTime = c.req.query("endTime");
    
    if (!startTime || !endTime) {
      return c.json({ error: "startTime and endTime query parameters are required" }, 400);
    }
    
    const stats = await throughputTracker.getAggregatedThroughput(
      parseInt(startTime),
      parseInt(endTime)
    );
    return c.json(stats);
  } catch (error) {
    console.error('Failed to get aggregated throughput:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : "Failed to get aggregated throughput"
    }, 500);
  }
});

// Get network-specific throughput trends
app.get("/make-server-efba0687/throughput/network/:networkName", async (c) => {
  try {
    const networkName = c.req.param("networkName");
    const startTime = c.req.query("startTime") ? parseInt(c.req.query("startTime")!) : undefined;
    const endTime = c.req.query("endTime") ? parseInt(c.req.query("endTime")!) : undefined;
    
    const trends = await throughputTracker.getNetworkThroughputTrends(networkName, startTime, endTime);
    return c.json({ network: networkName, trends, count: trends.length });
  } catch (error) {
    console.error('Failed to get network throughput trends:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : "Failed to get network throughput trends"
    }, 500);
  }
});

// Clear all throughput data (admin only)
app.delete("/make-server-efba0687/throughput/clear", async (c) => {
  try {
    const deletedCount = await throughputTracker.clearAllThroughputData();
    return c.json({ success: true, deletedCount });
  } catch (error) {
    console.error('Failed to clear throughput data:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : "Failed to clear throughput data"
    }, 500);
  }
});

// ==================== OUI Lookup Endpoints ====================

// Lookup vendor for a single MAC address
app.get("/make-server-efba0687/oui/lookup", async (c) => {
  try {
    const mac = c.req.query("mac");
    
    if (!mac) {
      return c.json({ error: "MAC address parameter is required" }, 400);
    }
    
    const vendor = await ouiLookup.lookupVendor(mac);
    return c.json({ mac, vendor });
  } catch (error) {
    console.error('Failed to lookup vendor:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : "Failed to lookup vendor"
    }, 500);
  }
});

// Batch lookup vendors for multiple MAC addresses
app.post("/make-server-efba0687/oui/batch", async (c) => {
  try {
    const { macs } = await c.req.json();
    
    if (!macs || !Array.isArray(macs)) {
      return c.json({ error: "MACs array is required" }, 400);
    }
    
    if (macs.length > 50) {
      return c.json({ error: "Maximum 50 MAC addresses per batch request" }, 400);
    }
    
    const results = await ouiLookup.batchLookupVendors(macs);
    
    // Convert Map to object for JSON response
    const vendorMap: { [mac: string]: string } = {};
    results.forEach((vendor, mac) => {
      vendorMap[mac] = vendor;
    });
    
    return c.json({ vendors: vendorMap, count: results.size });
  } catch (error) {
    console.error('Failed to batch lookup vendors:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : "Failed to batch lookup vendors"
    }, 500);
  }
});

// ==================== Chatbase Identity Token Endpoint ====================

// Generate a JWT token for Chatbase user identification
app.post("/make-server-efba0687/chatbase/token", async (c) => {
  try {
    const secret = Deno.env.get("CHATBASE_IDENTITY_SECRET");

    if (!secret) {
      console.error('CHATBASE_IDENTITY_SECRET not configured');
      return c.json({ error: "Chatbase identity not configured" }, 500);
    }

    const { user_id, email, name, role } = await c.req.json();

    if (!user_id) {
      return c.json({ error: "user_id is required" }, 400);
    }

    // Create JWT payload
    const payload = {
      user_id,
      email: email || undefined,
      name: name || undefined,
      role: role || undefined,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiry
    };

    // Sign JWT using Web Crypto API
    const encoder = new TextEncoder();
    const header = { alg: "HS256", typ: "JWT" };

    const base64UrlEncode = (data: Uint8Array | string): string => {
      const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
      const base64 = btoa(str);
      return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };

    const headerB64 = base64UrlEncode(JSON.stringify(header));
    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    const unsignedToken = `${headerB64}.${payloadB64}`;

    // Import key and sign
    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      encoder.encode(unsignedToken)
    );

    const signatureB64 = base64UrlEncode(new Uint8Array(signature));
    const token = `${unsignedToken}.${signatureB64}`;

    return c.json({ token });
  } catch (error) {
    console.error('Failed to generate Chatbase token:', error);
    return c.json({
      error: error instanceof Error ? error.message : "Failed to generate token"
    }, 500);
  }
});

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Export the app for use by the proxy
export default app;

Deno.serve(app.fetch);