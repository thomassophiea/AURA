/**
 * XIQ Cloud Service
 *
 * Handles authentication and API access to ExtremeCloud IQ (XIQ).
 * Each Site Group maintains its own XIQ credentials and token independently.
 *
 * Purpose: future migration workflow — pull site/device/WLAN config from XIQ
 * and import it into the on-prem controller managed by AURA.
 *
 * Auth flow:
 *   POST <region-url>/login
 *   body: { username: <email>, password: <password> }
 *   response: { access_token, token_type, expires_in }
 *   All subsequent calls: Authorization: Bearer <access_token>
 */

export const XIQ_REGIONS = {
  global: 'https://api.extremecloudiq.com',
  eu: 'https://api-eu.extremecloudiq.com',
  apac: 'https://api-apac.extremecloudiq.com',
  ca: 'https://cal-api.extremecloudiq.com',
} as const;

export type XIQRegion = keyof typeof XIQ_REGIONS;

export const XIQ_REGION_LABELS: Record<XIQRegion, string> = {
  global: 'Global',
  eu: 'Europe (EU)',
  apac: 'Asia Pacific (APAC)',
  ca: 'California (CA)',
};

export const XIQ_REGION_ORDER: XIQRegion[] = ['global', 'eu', 'apac', 'ca'];

interface XIQAuthResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

export interface XIQStoredToken {
  access_token: string;
  region: XIQRegion;
  /** Absolute expiry timestamp in ms — compare against Date.now() */
  expiry: number;
}

export interface XIQSavedCredentials {
  email: string;
  password: string;
  region: XIQRegion;
}

class XIQService {
  private readonly TOKEN_PREFIX = 'xiq_token_';
  private readonly CREDS_PREFIX = 'xiq_creds_';

  // ── Auth ────────────────────────────────────────────────────────────────────

  async login(
    email: string,
    password: string,
    region: XIQRegion,
    siteGroupId: string
  ): Promise<XIQStoredToken> {
    // Route through the Express proxy to avoid browser CORS restrictions
    const response = await fetch('/xiq/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ username: email.trim(), password, region }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      let message = `XIQ login failed (${response.status})`;
      try {
        const body = await response.json();
        if (body.error || body.message) {
          message = body.error || body.message;
        }
      } catch {
        // ignore parse failure
      }
      throw new Error(message);
    }

    const data: XIQAuthResponse = await response.json();

    // XIQ tokens expire in 1 hour by default; use expires_in when provided
    const ttlMs = ((data.expires_in ?? 3600) - 60) * 1000; // 1-min early expiry buffer
    const token: XIQStoredToken = {
      access_token: data.access_token,
      region,
      expiry: Date.now() + ttlMs,
    };

    this.saveToken(siteGroupId, token);
    return token;
  }

  // ── Token storage ────────────────────────────────────────────────────────────

  private saveToken(siteGroupId: string, token: XIQStoredToken): void {
    try {
      localStorage.setItem(`${this.TOKEN_PREFIX}${siteGroupId}`, JSON.stringify(token));
    } catch {
      // ignore quota errors
    }
  }

  getToken(siteGroupId: string): XIQStoredToken | null {
    try {
      const raw = localStorage.getItem(`${this.TOKEN_PREFIX}${siteGroupId}`);
      if (!raw) return null;
      const token = JSON.parse(raw) as XIQStoredToken;
      // Return null if expired
      if (Date.now() >= token.expiry) {
        localStorage.removeItem(`${this.TOKEN_PREFIX}${siteGroupId}`);
        return null;
      }
      return token;
    } catch {
      return null;
    }
  }

  isAuthenticated(siteGroupId: string): boolean {
    return this.getToken(siteGroupId) !== null;
  }

  clearToken(siteGroupId: string): void {
    localStorage.removeItem(`${this.TOKEN_PREFIX}${siteGroupId}`);
  }

  // ── Credential storage ───────────────────────────────────────────────────────
  // Stored base64-obfuscated in localStorage — suitable for a local admin tool.

  saveCredentials(siteGroupId: string, email: string, password: string, region: XIQRegion): void {
    try {
      const payload = JSON.stringify({ email, password, region });
      localStorage.setItem(`${this.CREDS_PREFIX}${siteGroupId}`, btoa(payload));
    } catch {
      // ignore
    }
  }

  getCredentials(siteGroupId: string): XIQSavedCredentials | null {
    try {
      const raw = localStorage.getItem(`${this.CREDS_PREFIX}${siteGroupId}`);
      if (!raw) return null;
      return JSON.parse(atob(raw)) as XIQSavedCredentials;
    } catch {
      return null;
    }
  }

  clearCredentials(siteGroupId: string): void {
    localStorage.removeItem(`${this.CREDS_PREFIX}${siteGroupId}`);
    this.clearToken(siteGroupId);
  }

  // ── API requests ─────────────────────────────────────────────────────────────

  async makeRequest(
    siteGroupId: string,
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const token = this.getToken(siteGroupId);
    if (!token) {
      throw new Error('Not authenticated with XIQ for this site group');
    }
    const baseUrl = XIQ_REGIONS[token.region];
    return fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(options.headers ?? {}),
      },
    });
  }
}

export const xiqService = new XIQService();
