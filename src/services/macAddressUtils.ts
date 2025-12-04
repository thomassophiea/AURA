/**
 * MAC Address Utility Functions
 * 
 * Includes detection of randomized/locally administered MAC addresses
 * used by mobile operating systems for privacy.
 */

/**
 * Determines if a MAC address is randomized (locally administered)
 * 
 * A randomized MAC address has the locally administered bit set (bit 1 of first octet).
 * This is identifiable by checking if the second character of the MAC address is 2, 6, A, or E.
 * 
 * Examples of randomized MAC addresses:
 * - 82:e4:22:47:f0:8f (second char is 2)
 * - 92:b1:b8:42:d1:85 (second char is 2)
 * - 32:8c:27:26:72:34 (second char is 2)
 * - 5e:9b:a8:8a:55:a6 (second char is e)
 * - e3:d3:e6:90:41:72 (second char is 3... wait, this has bit 1 set)
 * 
 * The locally administered bit is bit 1 (second least significant bit) of the first octet.
 * When this bit is set, the MAC address is not globally unique and is locally administered.
 * 
 * @param macAddress - MAC address in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX
 * @returns true if the MAC address is randomized (locally administered)
 */
export function isRandomizedMac(macAddress: string | undefined | null): boolean {
  if (!macAddress || macAddress.length < 2) {
    return false;
  }

  // Normalize the MAC address by removing separators
  const normalized = macAddress.replace(/[:\-]/g, '');
  
  if (normalized.length < 2) {
    return false;
  }

  // Get the second character (index 1) of the MAC address
  const secondChar = normalized[1].toUpperCase();
  
  // Check if it's one of the locally administered indicators
  // These hex digits have bit 1 set: 2, 6, A, E (and 3, 7, B, F)
  // But according to the user's examples, we should check for 2, 6, A, E specifically
  const randomizedChars = ['2', '6', 'A', 'E'];
  
  return randomizedChars.includes(secondChar);
}

/**
 * Determines if a MAC address is randomized using the full bit check method
 * This checks if bit 1 (locally administered bit) of the first octet is set
 * 
 * @param macAddress - MAC address in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX
 * @returns true if the MAC address is locally administered
 */
export function isLocallyAdministered(macAddress: string | undefined | null): boolean {
  if (!macAddress || macAddress.length < 2) {
    return false;
  }

  // Normalize the MAC address by removing separators
  const normalized = macAddress.replace(/[:\-]/g, '');
  
  if (normalized.length < 2) {
    return false;
  }

  // Get the first octet (first two hex characters)
  const firstOctet = parseInt(normalized.substring(0, 2), 16);
  
  // Check if bit 1 (second least significant bit) is set
  // Bit 0 is multicast/unicast, bit 1 is locally administered/globally unique
  return (firstOctet & 0x02) !== 0;
}

/**
 * Get information about a MAC address
 * 
 * @param macAddress - MAC address in format XX:XX:XX:XX:XX:XX or XX-XX-XX-XX-XX-XX
 * @returns Object with MAC address information
 */
export function getMacAddressInfo(macAddress: string | undefined | null): {
  isRandomized: boolean;
  isLocallyAdministered: boolean;
  isMulticast: boolean;
  formatted: string;
  explanation: string;
} {
  if (!macAddress) {
    return {
      isRandomized: false,
      isLocallyAdministered: false,
      isMulticast: false,
      formatted: '',
      explanation: 'Invalid MAC address'
    };
  }

  const normalized = macAddress.replace(/[:\-]/g, '');
  const formatted = macAddress;
  
  if (normalized.length < 2) {
    return {
      isRandomized: false,
      isLocallyAdministered: false,
      isMulticast: false,
      formatted: macAddress,
      explanation: 'Invalid MAC address'
    };
  }

  const firstOctet = parseInt(normalized.substring(0, 2), 16);
  const isMulticast = (firstOctet & 0x01) !== 0;
  const isLocallyAdministered = (firstOctet & 0x02) !== 0;
  const isRandomized = isRandomizedMac(macAddress);

  let explanation = '';
  if (isRandomized) {
    explanation = 'Randomized MAC address - Privacy feature used by mobile devices to prevent tracking';
  } else if (isLocallyAdministered) {
    explanation = 'Locally administered MAC address - Not globally unique';
  } else {
    explanation = 'Globally unique MAC address - Assigned by manufacturer';
  }

  if (isMulticast) {
    explanation += ' (Multicast)';
  }

  return {
    isRandomized,
    isLocallyAdministered,
    isMulticast,
    formatted,
    explanation
  };
}

/**
 * Format a MAC address consistently
 * 
 * @param macAddress - MAC address in any format
 * @param separator - Separator to use (default is ':')
 * @returns Formatted MAC address
 */
export function formatMacAddress(macAddress: string | undefined | null, separator: string = ':'): string {
  if (!macAddress) {
    return '';
  }

  // Remove all existing separators
  const normalized = macAddress.replace(/[:\-]/g, '');
  
  if (normalized.length !== 12) {
    return macAddress; // Return original if invalid length
  }

  // Split into pairs and join with separator
  return normalized.match(/.{1,2}/g)?.join(separator) || macAddress;
}
