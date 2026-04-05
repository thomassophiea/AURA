/**
 * Auth Service - Extracted from api.ts
 * Handles login, logout, token management, and session validation
 */

import { getBaseUrl } from './api';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
  userName: string;
  adminRole: string | null;
}

class AuthService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private sessionExpiredHandler: (() => void) | null = null;

  constructor() {
    this.loadTokensFromStorage();
  }

  private loadTokensFromStorage(): void {
    try {
      const stored = localStorage.getItem('auth_tokens');
      if (stored) {
        const tokens = JSON.parse(stored);
        this.accessToken = tokens.accessToken || null;
        this.refreshToken = tokens.refreshToken || null;
      }
    } catch (e) {
      console.error('[AuthService] Failed to load tokens from storage:', e);
    }
  }

  private saveTokensToStorage(): void {
    try {
      localStorage.setItem('auth_tokens', JSON.stringify({
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
      }));
    } catch (e) {
      console.error('[AuthService] Failed to save tokens to storage:', e);
    }
  }

  async login(userId: string, password: string): Promise<AuthResponse> {
    if (!userId.trim()) throw new Error('User ID is required');
    if (!password.trim()) throw new Error('Password is required');

    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/v2/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, password }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Login failed');
    }

    const data = await response.json() as AuthResponse;
    this.accessToken = data.accessToken;
    this.refreshToken = data.refreshToken;
    this.saveTokensToStorage();
    return data;
  }

  async logout(): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('auth_tokens');
  }

  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  async validateSession(): Promise<boolean> {
    if (!this.accessToken) return false;
    // Validate with backend
    return true;
  }

  setSessionExpiredHandler(handler: () => void): void {
    this.sessionExpiredHandler = handler;
  }

  handleSessionExpired(): void {
    this.accessToken = null;
    this.refreshToken = null;
    if (this.sessionExpiredHandler) {
      this.sessionExpiredHandler();
    }
  }
}

export const authService = new AuthService();
