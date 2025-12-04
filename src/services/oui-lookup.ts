// OUI (Organizationally Unique Identifier) Lookup Service
// Maps MAC addresses to device manufacturers via backend server

import { projectId, publicAnonKey } from '../utils/supabase/info';

const SERVER_URL = `https://${projectId}.supabase.co/functions/v1/make-server-efba0687`;

interface VendorCache {
  [oui: string]: string;
}

// In-memory cache to avoid repeated API calls
const vendorCache: VendorCache = {};

/**
 * Extract OUI (first 3 octets) from MAC address
 * @param mac MAC address in various formats (XX:XX:XX:XX:XX:XX, XX-XX-XX-XX-XX-XX, XXXXXXXXXXXX)
 * @returns Normalized OUI string (e.g., "00:1A:2B")
 */
function extractOUI(mac: string): string {
  // Remove common separators and convert to uppercase
  const normalized = mac.replace(/[:\-\.]/g, '').toUpperCase();
  
  // Extract first 6 characters (3 octets)
  if (normalized.length >= 6) {
    const oui = normalized.substring(0, 6);
    // Format as XX:XX:XX for consistency
    return `${oui.substring(0, 2)}:${oui.substring(2, 4)}:${oui.substring(4, 6)}`;
  }
  
  return '';
}

/**
 * Lookup vendor name from MAC address via backend server
 * @param mac MAC address
 * @returns Vendor name or 'Unknown Vendor'
 */
async function lookupVendorAPI(mac: string): Promise<string> {
  try {
    const url = `${SERVER_URL}/oui/lookup?mac=${encodeURIComponent(mac)}`;
    console.log('[OUI Lookup] Fetching from:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      }
    });
    
    console.log('[OUI Lookup] Response status:', response.status, response.statusText);
    
    if (response.ok) {
      const data = await response.json();
      console.log('[OUI Lookup] Response data:', data);
      return data.vendor || 'Unknown Vendor';
    }
    
    // Try to get error details
    const errorText = await response.text().catch(() => 'Unable to read error');
    console.warn('[OUI Lookup] API error:', response.status, response.statusText, errorText);
    return 'Unknown Vendor';
  } catch (error) {
    console.error('[OUI Lookup] Failed to lookup vendor:', error);
    return 'Unknown Vendor';
  }
}

/**
 * Get vendor name from MAC address with caching
 * @param mac MAC address
 * @returns Vendor name or 'Unknown Vendor'
 */
export async function getVendor(mac: string): Promise<string> {
  if (!mac) return 'Unknown Vendor';
  
  const oui = extractOUI(mac);
  if (!oui) return 'Unknown Vendor';
  
  // Check cache first
  if (vendorCache[oui]) {
    return vendorCache[oui];
  }
  
  // Lookup via backend API
  const vendor = await lookupVendorAPI(mac);
  
  // Cache the result
  vendorCache[oui] = vendor;
  return vendor;
}

/**
 * Get vendor icon/emoji based on manufacturer name
 * @param vendor Vendor name
 * @returns Emoji representing the vendor/device type
 */
export function getVendorIcon(vendor: string): string {
  const vendorLower = vendor.toLowerCase();
  
  // Map common vendors to icons
  if (vendorLower.includes('apple')) return '🍎';
  if (vendorLower.includes('samsung')) return '📱';
  if (vendorLower.includes('dell')) return '💻';
  if (vendorLower.includes('hp') || vendorLower.includes('hewlett')) return '🖥️';
  if (vendorLower.includes('lenovo')) return '💻';
  if (vendorLower.includes('microsoft')) return '🪟';
  if (vendorLower.includes('cisco')) return '🌐';
  if (vendorLower.includes('intel')) return '🔷';
  if (vendorLower.includes('google')) return '🔍';
  if (vendorLower.includes('amazon')) return '📦';
  if (vendorLower.includes('sony')) return '🎮';
  if (vendorLower.includes('lg')) return '📺';
  if (vendorLower.includes('asus')) return '💻';
  if (vendorLower.includes('tp-link') || vendorLower.includes('tplink')) return '📡';
  if (vendorLower.includes('netgear')) return '📡';
  if (vendorLower.includes('ubiquiti')) return '📡';
  if (vendorLower.includes('raspberry')) return '🫐';
  if (vendorLower.includes('espressif')) return '🔧';
  if (vendorLower.includes('xiaomi')) return '📱';
  if (vendorLower.includes('huawei')) return '📱';
  if (vendorLower.includes('motorola')) return '📱';
  if (vendorLower.includes('nintendo')) return '🎮';
  
  // Default icon for unknown
  return '📟';
}

/**
 * Batch lookup vendors for multiple MAC addresses
 * Uses rate limiting to avoid API throttling
 * @param macs Array of MAC addresses
 * @returns Map of MAC address to vendor name
 */
export async function batchLookupVendors(macs: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  // Add delay between requests to respect rate limits (macvendors.com allows 2 requests/second)
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  for (let i = 0; i < macs.length; i++) {
    const mac = macs[i];
    const vendor = await getVendor(mac);
    results.set(mac, vendor);
    
    // Wait 550ms between requests (allows ~1.8 requests/second, safely under the 2/sec limit)
    if (i < macs.length - 1) {
      await delay(550);
    }
  }
  
  return results;
}

/**
 * Get short vendor name (first word or abbreviation)
 * @param vendor Full vendor name
 * @returns Shortened vendor name
 */
export function getShortVendor(vendor: string): string {
  if (vendor === 'Unknown Vendor') return 'Unknown';
  
  // Common abbreviations and overrides
  const abbreviations: { [key: string]: string } = {
    'Apple, Inc.': 'Apple',
    'Samsung Electronics Co.,Ltd': 'Samsung',
    'Hewlett Packard': 'HP',
    'Cisco Systems, Inc': 'Cisco',
    'Intel Corporate': 'Intel',
    'Microsoft Corporation': 'Microsoft',
    'Google, Inc.': 'Google',
    'Amazon Technologies Inc.': 'Amazon',
    'TP-Link Corporation Limited': 'TP-Link',
    'NETGEAR': 'Netgear',
    'Ubiquiti Networks Inc.': 'Ubiquiti',
    'Raspberry Pi Trading Ltd': 'Raspberry Pi',
    'Espressif Inc.': 'Espressif'
  };
  
  // Check for exact match
  if (abbreviations[vendor]) {
    return abbreviations[vendor];
  }
  
  // Otherwise, take the first word or up to first comma
  const shortened = vendor.split(/[,\(]/)[0].trim();
  return shortened.split(' ')[0];
}