/**
 * Packet Capture Validation Utilities
 * Validates MAC addresses, IP addresses, and capture configuration
 */

/**
 * Validate MAC address format
 * Accepts formats: AA:BB:CC:DD:EE:FF, AA-BB-CC-DD-EE-FF, AABBCCDDEEFF
 */
export function validateMacAddress(mac: string): { valid: boolean; error?: string } {
  if (!mac || typeof mac !== 'string') {
    return { valid: false, error: 'MAC address is required' };
  }

  const trimmed = mac.trim();

  // Remove separators and normalize
  const normalized = trimmed.replace(/[:-]/g, '').toUpperCase();

  // Check if it's exactly 12 hex characters
  if (normalized.length !== 12) {
    return { valid: false, error: 'MAC address must be 12 hexadecimal characters' };
  }

  // Check if all characters are valid hex
  if (!/^[0-9A-F]{12}$/.test(normalized)) {
    return { valid: false, error: 'MAC address must contain only hexadecimal characters (0-9, A-F)' };
  }

  return { valid: true };
}

/**
 * Format MAC address to standard format (XX:XX:XX:XX:XX:XX)
 */
export function formatMacAddress(mac: string): string {
  const normalized = mac.replace(/[:-]/g, '').toUpperCase();
  return normalized.match(/.{1,2}/g)?.join(':') || mac;
}

/**
 * Validate IPv4 address format
 */
export function validateIPv4Address(ip: string): { valid: boolean; error?: string } {
  if (!ip || typeof ip !== 'string') {
    return { valid: false, error: 'IP address is required' };
  }

  const trimmed = ip.trim();

  // IPv4 regex pattern
  const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = trimmed.match(ipv4Pattern);

  if (!match) {
    return { valid: false, error: 'Invalid IPv4 address format (expected: X.X.X.X)' };
  }

  // Check each octet is 0-255
  const octets = [match[1], match[2], match[3], match[4]].map(Number);
  const invalidOctet = octets.find(octet => octet < 0 || octet > 255);

  if (invalidOctet !== undefined) {
    return { valid: false, error: 'Each IPv4 octet must be between 0 and 255' };
  }

  return { valid: true };
}

/**
 * Validate IPv6 address format (basic validation)
 */
export function validateIPv6Address(ip: string): { valid: boolean; error?: string } {
  if (!ip || typeof ip !== 'string') {
    return { valid: false, error: 'IP address is required' };
  }

  const trimmed = ip.trim();

  // Basic IPv6 pattern (full and compressed)
  const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

  if (!ipv6Pattern.test(trimmed)) {
    return { valid: false, error: 'Invalid IPv6 address format' };
  }

  // Check for too many segments
  const segments = trimmed.split(':');
  if (segments.length > 8) {
    return { valid: false, error: 'IPv6 address has too many segments' };
  }

  return { valid: true };
}

/**
 * Validate IP address (supports both IPv4 and IPv6)
 */
export function validateIPAddress(ip: string): { valid: boolean; error?: string } {
  // Try IPv4 first
  const ipv4Result = validateIPv4Address(ip);
  if (ipv4Result.valid) {
    return ipv4Result;
  }

  // Try IPv6
  const ipv6Result = validateIPv6Address(ip);
  if (ipv6Result.valid) {
    return ipv6Result;
  }

  return { valid: false, error: 'Invalid IP address format (must be valid IPv4 or IPv6)' };
}

/**
 * Validate capture duration (in minutes)
 */
export function validateCaptureDuration(duration: number): { valid: boolean; error?: string } {
  if (typeof duration !== 'number' || isNaN(duration)) {
    return { valid: false, error: 'Duration must be a number' };
  }

  if (duration < 1) {
    return { valid: false, error: 'Duration must be at least 1 minute' };
  }

  if (duration > 60) {
    return { valid: false, error: 'Duration cannot exceed 60 minutes' };
  }

  return { valid: true };
}

/**
 * Validate packet truncation size (in bytes)
 */
export function validateTruncationSize(size: number): { valid: boolean; error?: string } {
  if (typeof size !== 'number' || isNaN(size)) {
    return { valid: false, error: 'Truncation size must be a number' };
  }

  if (size < 0) {
    return { valid: false, error: 'Truncation size cannot be negative' };
  }

  if (size > 65535) {
    return { valid: false, error: 'Truncation size cannot exceed 65535 bytes' };
  }

  // Warning for small truncation sizes
  if (size > 0 && size < 64) {
    return { valid: true, error: 'Warning: Truncation size below 64 bytes may lose important packet data' };
  }

  return { valid: true };
}

/**
 * Validate SCP server configuration
 */
export function validateSCPConfig(config: {
  serverIp: string;
  username: string;
  password: string;
  path?: string;
}): { valid: boolean; error?: string } {
  if (!config.serverIp || !config.serverIp.trim()) {
    return { valid: false, error: 'SCP server IP address is required' };
  }

  const ipValidation = validateIPAddress(config.serverIp);
  if (!ipValidation.valid) {
    return { valid: false, error: `SCP server IP: ${ipValidation.error}` };
  }

  if (!config.username || !config.username.trim()) {
    return { valid: false, error: 'SCP username is required' };
  }

  if (!config.password || !config.password.trim()) {
    return { valid: false, error: 'SCP password is required' };
  }

  // Validate path if provided
  if (config.path && config.path.trim()) {
    // Check for invalid characters in path
    if (/[<>"|?*]/.test(config.path)) {
      return { valid: false, error: 'SCP path contains invalid characters' };
    }
  }

  return { valid: true };
}

/**
 * Validate complete capture configuration
 */
export function validateCaptureConfig(config: {
  captureLocation: 'appliance' | 'wired' | 'wireless';
  selectedAP?: string;
  accessPointsAvailable?: number;
  duration: number;
  truncatePackets: number;
  packetDestination: 'file' | 'scp';
  scpConfig?: {
    serverIp: string;
    username: string;
    password: string;
    path?: string;
  };
  filters: Array<{ type: 'mac' | 'ip'; value: string }>;
}): { valid: boolean; error?: string } {
  // Validate duration
  const durationResult = validateCaptureDuration(config.duration);
  if (!durationResult.valid) {
    return durationResult;
  }

  // Validate truncation
  const truncationResult = validateTruncationSize(config.truncatePackets);
  if (!truncationResult.valid) {
    return truncationResult;
  }

  // Validate wireless capture has AP
  if (config.captureLocation === 'wireless') {
    if (!config.accessPointsAvailable || config.accessPointsAvailable === 0) {
      return { valid: false, error: 'No access points available for wireless capture' };
    }
    if (!config.selectedAP || config.selectedAP === 'all') {
      // This is okay, we'll use first AP
    }
  }

  // Validate SCP configuration if needed
  if (config.packetDestination === 'scp') {
    if (!config.scpConfig) {
      return { valid: false, error: 'SCP configuration is required' };
    }
    const scpResult = validateSCPConfig(config.scpConfig);
    if (!scpResult.valid) {
      return scpResult;
    }
  }

  // Validate filters
  for (const filter of config.filters) {
    if (filter.type === 'mac') {
      const macResult = validateMacAddress(filter.value);
      if (!macResult.valid) {
        return { valid: false, error: `Invalid MAC filter: ${macResult.error}` };
      }
    } else if (filter.type === 'ip') {
      const ipResult = validateIPAddress(filter.value);
      if (!ipResult.valid) {
        return { valid: false, error: `Invalid IP filter: ${ipResult.error}` };
      }
    }
  }

  return { valid: true };
}

/**
 * Estimate capture file size (rough approximation)
 */
export function estimateCaptureFileSize(config: {
  duration: number; // minutes
  truncatePackets: number; // bytes, 0 = full packet
  estimatedPacketsPerSecond?: number; // optional estimate
}): { estimatedSizeMB: number; warning?: string } {
  // Default assumptions if not provided
  const packetsPerSecond = config.estimatedPacketsPerSecond || 100; // Conservative estimate
  const avgPacketSize = config.truncatePackets > 0 ? config.truncatePackets : 1500; // Standard MTU

  // Calculate
  const totalSeconds = config.duration * 60;
  const totalPackets = packetsPerSecond * totalSeconds;
  const totalBytes = totalPackets * (avgPacketSize + 24); // +24 for pcap headers per packet
  const estimatedSizeMB = Math.round(totalBytes / (1024 * 1024));

  let warning: string | undefined;
  if (estimatedSizeMB > 1000) {
    warning = 'Estimated file size exceeds 1GB. Consider reducing duration or adding filters.';
  } else if (estimatedSizeMB > 500) {
    warning = 'Estimated file size is large. Download may take significant time.';
  }

  return { estimatedSizeMB, warning };
}
