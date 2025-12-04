// OUI (Organizationally Unique Identifier) Lookup Service - Server Side
// Handles MAC address to vendor lookups via external API

interface VendorCache {
  [oui: string]: string;
}

// In-memory cache to avoid repeated API calls
const vendorCache: VendorCache = {};

/**
 * Extract OUI (first 3 octets) from MAC address
 */
function extractOUI(mac: string): string {
  const normalized = mac.replace(/[:\-\.]/g, '').toUpperCase();
  
  if (normalized.length >= 6) {
    const oui = normalized.substring(0, 6);
    return `${oui.substring(0, 2)}:${oui.substring(2, 4)}:${oui.substring(4, 6)}`;
  }
  
  return '';
}

/**
 * Lookup vendor name from MAC address using macvendors.com API
 */
export async function lookupVendor(mac: string): Promise<string> {
  if (!mac) return 'Unknown Vendor';
  
  const oui = extractOUI(mac);
  if (!oui) return 'Unknown Vendor';
  
  // Check cache first
  if (vendorCache[oui]) {
    console.log('[OUI Lookup] Cache hit for', oui, ':', vendorCache[oui]);
    return vendorCache[oui];
  }
  
  try {
    console.log('[OUI Lookup] Looking up vendor for MAC:', mac);
    
    // Use macvendors.com API
    const response = await fetch(`https://api.macvendors.com/${encodeURIComponent(mac)}`, {
      method: 'GET',
      headers: {
        'Accept': 'text/plain',
        'User-Agent': 'AURA-Platform-Dashboard/1.0'
      }
    });
    
    if (response.ok) {
      const vendor = await response.text();
      const trimmedVendor = vendor.trim();
      
      // Cache the result
      vendorCache[oui] = trimmedVendor;
      console.log('[OUI Lookup] ✓ Found vendor:', trimmedVendor);
      
      return trimmedVendor;
    }
    
    // 404 means vendor not found
    if (response.status === 404) {
      console.log('[OUI Lookup] Vendor not found for', mac);
      vendorCache[oui] = 'Unknown Vendor';
      return 'Unknown Vendor';
    }
    
    // Rate limited - wait and don't cache
    if (response.status === 429) {
      console.warn('[OUI Lookup] Rate limited, waiting...');
      return 'Rate Limited';
    }
    
    console.warn('[OUI Lookup] API error:', response.status, response.statusText);
    return 'Unknown Vendor';
    
  } catch (error) {
    console.error('[OUI Lookup] Failed to lookup vendor:', error);
    return 'Unknown Vendor';
  }
}

/**
 * Batch lookup vendors for multiple MAC addresses with rate limiting
 */
export async function batchLookupVendors(macs: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  console.log('[OUI Lookup] Batch lookup for', macs.length, 'MAC addresses');
  
  // Add delay between requests to respect rate limits (2 requests/second max)
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  for (let i = 0; i < macs.length; i++) {
    const mac = macs[i];
    const vendor = await lookupVendor(mac);
    results.set(mac, vendor);
    
    // If rate limited, wait longer
    if (vendor === 'Rate Limited') {
      console.log('[OUI Lookup] Waiting 60s due to rate limit...');
      await delay(60000);
      // Retry
      const retryVendor = await lookupVendor(mac);
      results.set(mac, retryVendor);
    }
    
    // Wait 550ms between requests (allows ~1.8 requests/second)
    if (i < macs.length - 1) {
      await delay(550);
    }
  }
  
  console.log('[OUI Lookup] ✓ Batch lookup complete:', results.size, 'results');
  return results;
}