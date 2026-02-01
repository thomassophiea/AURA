/**
 * Chatbase Identity Service
 * Handles user identification with Chatbase AI assistant
 */

import { projectId, publicAnonKey } from '../utils/supabase/info';

const SERVER_URL = `https://${projectId}.supabase.co/functions/v1/make-server-efba0687`;

interface ChatbaseTokenResponse {
  token?: string;
  error?: string;
}

/**
 * Get a Chatbase identity token for the current user
 * @returns JWT token for Chatbase identification
 */
export async function getChatbaseToken(): Promise<string | null> {
  try {
    // Get user info from localStorage
    const userEmail = localStorage.getItem('user_email');
    const adminRole = localStorage.getItem('admin_role');

    if (!userEmail) {
      console.log('[Chatbase] No user email found, skipping identification');
      return null;
    }

    // Generate a user ID from email (hash for privacy)
    const userId = await hashString(userEmail);

    const response = await fetch(`${SERVER_URL}/chatbase/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`
      },
      body: JSON.stringify({
        user_id: userId,
        email: userEmail,
        role: adminRole || undefined
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[Chatbase] Failed to get token:', errorData.error);
      return null;
    }

    const data: ChatbaseTokenResponse = await response.json();
    return data.token || null;
  } catch (error) {
    console.error('[Chatbase] Error getting token:', error);
    return null;
  }
}

/**
 * Identify the current user with Chatbase
 * Call this after the Chatbase script has loaded
 */
export async function identifyUserWithChatbase(): Promise<boolean> {
  try {
    const token = await getChatbaseToken();

    if (!token) {
      console.log('[Chatbase] No token available, user will be anonymous');
      return false;
    }

    const win = window as any;
    if (win.chatbase) {
      win.chatbase('identify', { token });
      console.log('[Chatbase] User identified successfully');
      return true;
    } else {
      console.warn('[Chatbase] Chatbase not loaded yet');
      return false;
    }
  } catch (error) {
    console.error('[Chatbase] Error identifying user:', error);
    return false;
  }
}

/**
 * Hash a string using SHA-256 (for generating user IDs from emails)
 */
async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
