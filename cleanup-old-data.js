#!/usr/bin/env node

/**
 * Database Cleanup Script
 * Removes historical data older than configured retention periods
 *
 * This script should be run periodically (e.g., daily via cron)
 * to maintain database size within limits and comply with retention policies.
 *
 * Usage:
 *   node cleanup-old-data.js
 *
 * Schedule with cron (run daily at 2 AM):
 *   0 2 * * * cd /path/to/edge-services-site && node cleanup-old-data.js >> logs/cleanup.log 2>&1
 *
 * Or use Railway cron (add to railway.toml):
 *   [[crons]]
 *   schedule = "0 2 * * *"
 *   command = "node cleanup-old-data.js"
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
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
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ufqjnesldbacyltbsvys.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmcWpuZXNsZGJhY3lsdGJzdnlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3MjA4MTUsImV4cCI6MjA3NjI5NjgxNX0.9lZXSp3mRNb9h4Q0aO5wKouZ5yp8FVjotJunFF_bu4g';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Get retention configuration from database
 */
async function getRetentionConfig() {
  try {
    const { data, error } = await supabase
      .from('retention_config')
      .select('*')
      .eq('enabled', true);

    if (error) {
      console.error('❌ Failed to fetch retention config:', error.message);
      // Return default config if table doesn't exist yet
      return [
        { table_name: 'service_metrics_snapshots', retention_days: 7, enabled: true },
        { table_name: 'network_snapshots', retention_days: 7, enabled: true },
        { table_name: 'ap_events', retention_days: 30, enabled: true },
        { table_name: 'client_events', retention_days: 7, enabled: true },
        { table_name: 'config_changes', retention_days: 90, enabled: true }
      ];
    }

    return data || [];
  } catch (error) {
    console.error('❌ Error fetching retention config:', error.message);
    return [];
  }
}

/**
 * Clean up old data for a specific table
 */
async function cleanupTable(tableName, retentionDays) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffISO = cutoffDate.toISOString();

    console.log(`📋 Cleaning ${tableName}...`);
    console.log(`   Retention: ${retentionDays} days`);
    console.log(`   Cutoff date: ${cutoffISO}`);

    const { error, count } = await supabase
      .from(tableName)
      .delete({ count: 'exact' })
      .lt('timestamp', cutoffISO);

    if (error) {
      console.error(`   ❌ Failed to clean ${tableName}:`, error.message);
      return { table: tableName, deleted: 0, error: error.message };
    }

    console.log(`   ✅ Deleted ${count || 0} old records`);
    return { table: tableName, deleted: count || 0, error: null };
  } catch (error) {
    console.error(`   ❌ Error cleaning ${tableName}:`, error.message);
    return { table: tableName, deleted: 0, error: error.message };
  }
}

/**
 * Update last cleanup timestamp in retention_config
 */
async function updateLastCleanup(tableName) {
  try {
    await supabase
      .from('retention_config')
      .update({
        last_cleanup: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('table_name', tableName);
  } catch (error) {
    console.error(`   ⚠️  Failed to update last_cleanup for ${tableName}`);
  }
}

/**
 * Get database size statistics
 */
async function getDatabaseStats() {
  try {
    const tables = [
      'service_metrics_snapshots',
      'network_snapshots',
      'ap_events',
      'client_events',
      'config_changes'
    ];

    const stats = {};

    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (!error) {
        stats[table] = count || 0;
      }
    }

    return stats;
  } catch (error) {
    console.error('⚠️  Failed to fetch database stats:', error.message);
    return {};
  }
}

/**
 * Main cleanup execution
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        Database Cleanup - Historical Data Retention       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const timestamp = new Date().toISOString();
  console.log(`⏰ Started at: ${timestamp}\n`);

  // Get current database stats
  console.log('📊 Current database statistics:');
  const statsBefore = await getDatabaseStats();
  Object.entries(statsBefore).forEach(([table, count]) => {
    console.log(`   ${table}: ${count.toLocaleString()} records`);
  });
  console.log('');

  // Get retention configuration
  console.log('⚙️  Loading retention configuration...');
  const retentionConfig = await getRetentionConfig();

  if (retentionConfig.length === 0) {
    console.log('⚠️  No retention configuration found. Exiting.');
    process.exit(0);
  }

  console.log(`✅ Found ${retentionConfig.length} tables to clean\n`);

  // Clean up each table
  const results = [];
  for (const config of retentionConfig) {
    const result = await cleanupTable(config.table_name, config.retention_days);
    results.push(result);

    // Update last cleanup timestamp
    if (!result.error) {
      await updateLastCleanup(config.table_name);
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📈 Cleanup Summary:');
  console.log('═'.repeat(60));

  let totalDeleted = 0;
  let successCount = 0;
  let failCount = 0;

  results.forEach(result => {
    if (result.error) {
      console.log(`❌ ${result.table}: Failed (${result.error})`);
      failCount++;
    } else {
      console.log(`✅ ${result.table}: ${result.deleted.toLocaleString()} records deleted`);
      totalDeleted += result.deleted;
      successCount++;
    }
  });

  console.log('═'.repeat(60));
  console.log(`Total deleted: ${totalDeleted.toLocaleString()} records`);
  console.log(`Success: ${successCount}/${results.length} tables`);
  console.log(`Failed: ${failCount}/${results.length} tables`);
  console.log('═'.repeat(60));

  // Get updated database stats
  console.log('\n📊 Updated database statistics:');
  const statsAfter = await getDatabaseStats();
  Object.entries(statsAfter).forEach(([table, count]) => {
    const before = statsBefore[table] || 0;
    const diff = before - count;
    const sign = diff > 0 ? '-' : '+';
    console.log(`   ${table}: ${count.toLocaleString()} records (${sign}${Math.abs(diff).toLocaleString()})`);
  });

  const endTime = new Date().toISOString();
  console.log(`\n⏰ Completed at: ${endTime}`);
  console.log('✨ Cleanup finished successfully!\n');
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});

// Run cleanup
main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
