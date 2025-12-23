#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://ufqjnesldbacyltbsvys.supabase.co';
const SERVICE_KEY = 'sbp_056d64f58fee47ffaf1e61b59d910371cfa6d936';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
});

console.log('🚀 Deploying database schema...\n');

// Test basic connection
const { error: testError } = await supabase.from('_test').select('*').limit(1);
console.log('✅ Connected to Supabase\n');

// Read schema
const schema = fs.readFileSync('supabase-schema-enhanced.sql', 'utf-8');

// Execute via SQL query (requires proper permissions)
// Note: Supabase client doesn't expose direct SQL execution
// We'll use the REST API instead

const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
  method: 'POST',
  headers: {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ sql: schema })
});

if (!response.ok) {
  console.error('❌ Failed to execute SQL');
  console.error('Status:', response.status);
  console.error(await response.text());
  console.log('\n📋 Please run the SQL manually:');
  console.log('1. Go to: https://supabase.com/dashboard/project/ufqjnesldbacyltbsvys/sql');
  console.log('2. Copy supabase-schema-enhanced.sql');
  console.log('3. Paste and Run');
  process.exit(1);
}

console.log('✅ Schema deployed successfully!');
