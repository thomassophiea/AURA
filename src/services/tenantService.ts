/**
 * Multi-Tenant Service
 * Manages organizations, controllers, and user access
 */

import { supabase } from './supabaseClient';

// Types
export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logo_url?: string;
  settings?: Record<string, any>;
  created_at?: string;
}

export interface Controller {
  id: string;
  org_id: string;
  name: string;
  description?: string;
  url: string;
  port?: number;
  is_active: boolean;
  is_default: boolean;
  last_connected_at?: string;
  connection_status: 'connected' | 'disconnected' | 'error' | 'unknown';
  settings?: Record<string, any>;
  created_at?: string;
}

export interface UserOrganization {
  id: string;
  user_id: string;
  org_id: string;
  role: 'owner' | 'admin' | 'operator' | 'viewer';
  is_active: boolean;
  organization?: Organization;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  settings?: Record<string, any>;
}

export interface ControllerCredentials {
  controller_id: string;
  credential_type: 'oauth2' | 'api_key' | 'basic';
  username?: string;
  password?: string;
}

// Local storage keys for offline/fallback support
const STORAGE_KEYS = {
  CONTROLLERS: 'api_controllers',
  CURRENT_CONTROLLER: 'api_current_controller',
  CURRENT_ORG: 'api_current_org',
  USER_PROFILE: 'api_user_profile'
};

// Default controller configuration
const DEFAULT_CONTROLLER: Controller = {
  id: 'default-controller',
  org_id: 'default',
  name: 'TGS-XIQC-VE6120',
  description: 'Default Platform ONE Controller',
  url: 'https://tsophiea.ddns.net',
  port: 443,
  is_active: true,
  is_default: true,
  connection_status: 'unknown',
  created_at: new Date().toISOString()
};

class TenantService {
  private currentController: Controller | null = null;
  private currentOrg: Organization | null = null;

  constructor() {
    this.loadFromStorage();
    this.ensureDefaultController();
  }

  // Ensure default controller exists
  private ensureDefaultController() {
    const controllers = this.getLocalControllers();
    const hasDefault = controllers.some(c => c.id === DEFAULT_CONTROLLER.id);
    
    if (!hasDefault) {
      this.saveControllerLocally(DEFAULT_CONTROLLER);
    }
    
    // If no current controller is set, use the default
    if (!this.currentController) {
      this.currentController = DEFAULT_CONTROLLER;
      this.saveToStorage();
    }
  }

  // Load saved state from localStorage
  private loadFromStorage() {
    try {
      const savedController = localStorage.getItem(STORAGE_KEYS.CURRENT_CONTROLLER);
      if (savedController) {
        this.currentController = JSON.parse(savedController);
      }

      const savedOrg = localStorage.getItem(STORAGE_KEYS.CURRENT_ORG);
      if (savedOrg) {
        this.currentOrg = JSON.parse(savedOrg);
      }
    } catch (error) {
      console.error('Failed to load tenant state from storage:', error);
    }
  }

  // Save state to localStorage
  private saveToStorage() {
    try {
      if (this.currentController) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_CONTROLLER, JSON.stringify(this.currentController));
      } else {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_CONTROLLER);
      }

      if (this.currentOrg) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_ORG, JSON.stringify(this.currentOrg));
      } else {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_ORG);
      }
    } catch (error) {
      console.error('Failed to save tenant state to storage:', error);
    }
  }

  // === Organizations ===

  async getOrganizations(): Promise<Organization[]> {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .order('name');

    if (error) {
      console.error('Failed to fetch organizations:', error);
      return [];
    }

    return data || [];
  }

  async getUserOrganizations(userId: string): Promise<UserOrganization[]> {
    const { data, error } = await supabase
      .from('user_organizations')
      .select(`
        *,
        organization:organizations(*)
      `)
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      console.error('Failed to fetch user organizations:', error);
      return [];
    }

    return data || [];
  }

  async createOrganization(name: string, slug: string, userId: string): Promise<Organization | null> {
    const { data, error } = await supabase
      .rpc('create_organization_with_owner', {
        org_name: name,
        org_slug: slug,
        owner_id: userId
      });

    if (error) {
      console.error('Failed to create organization:', error);
      throw new Error(error.message);
    }

    // Fetch the created org
    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', data)
      .single();

    return org;
  }

  async updateOrganization(orgId: string, updates: Partial<Organization>): Promise<void> {
    const { error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', orgId);

    if (error) {
      throw new Error(error.message);
    }
  }

  setCurrentOrganization(org: Organization | null) {
    this.currentOrg = org;
    this.saveToStorage();
  }

  getCurrentOrganization(): Organization | null {
    return this.currentOrg;
  }

  // === Controllers ===

  async getControllers(orgId?: string): Promise<Controller[]> {
    // First get local controllers (instant)
    const localControllers = this.getLocalControllers();
    
    // If we have local controllers, return them immediately
    // This provides instant loading - no network delay
    if (localControllers.length > 0) {
      // Optionally try to sync from Supabase in background (non-blocking)
      this.syncControllersFromSupabase(orgId).catch(() => {});
      return localControllers;
    }
    
    // No local controllers - try Supabase with short timeout
    try {
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('timeout')), 2000)
      );
      
      let query = supabase.from('controllers').select('*');
      if (orgId) {
        query = query.eq('org_id', orgId);
      }
      
      const result = await Promise.race([
        query.order('name'),
        timeoutPromise
      ]);

      const { data, error } = result as { data: Controller[] | null; error: any };
      if (!error && data && data.length > 0) {
        // Save to local storage for next time
        data.forEach(c => this.saveControllerLocally(c));
        return data;
      }
    } catch (error) {
      console.warn('Supabase not available or timed out, using defaults');
    }

    // Fallback - ensure default controller exists and return it
    this.ensureDefaultController();
    return this.getLocalControllers();
  }
  
  // Background sync without blocking UI
  private async syncControllersFromSupabase(orgId?: string): Promise<void> {
    try {
      let query = supabase.from('controllers').select('*');
      if (orgId) {
        query = query.eq('org_id', orgId);
      }
      
      const { data, error } = await query.order('name');
      if (!error && data) {
        data.forEach(c => this.saveControllerLocally(c));
      }
    } catch {
      // Silently fail - local data is good enough
    }
  }

  async getController(controllerId: string): Promise<Controller | null> {
    const { data, error } = await supabase
      .from('controllers')
      .select('*')
      .eq('id', controllerId)
      .single();

    if (error) {
      // Fallback to local storage
      const controllers = this.getLocalControllers();
      return controllers.find(c => c.id === controllerId) || null;
    }

    return data;
  }

  async createController(controller: Omit<Controller, 'id' | 'created_at' | 'connection_status'>): Promise<Controller> {
    // Generate a local ID for fallback
    const localId = crypto.randomUUID();

    try {
      const { data, error } = await supabase
        .from('controllers')
        .insert({
          ...controller,
          connection_status: 'unknown'
        })
        .select()
        .single();

      if (error) throw error;
      
      // Also save locally
      this.saveControllerLocally(data);
      
      return data;
    } catch (error) {
      // Fallback: save locally only
      const localController: Controller = {
        ...controller,
        id: localId,
        connection_status: 'unknown',
        created_at: new Date().toISOString()
      };
      
      this.saveControllerLocally(localController);
      return localController;
    }
  }

  async updateController(controllerId: string, updates: Partial<Controller>): Promise<void> {
    try {
      const { error } = await supabase
        .from('controllers')
        .update(updates)
        .eq('id', controllerId);

      if (error) throw error;
    } catch (error) {
      // Update locally
      const controllers = this.getLocalControllers();
      const index = controllers.findIndex(c => c.id === controllerId);
      if (index >= 0) {
        controllers[index] = { ...controllers[index], ...updates };
        localStorage.setItem(STORAGE_KEYS.CONTROLLERS, JSON.stringify(controllers));
      }
    }

    // Update current controller if it's the one being updated
    if (this.currentController?.id === controllerId) {
      this.currentController = { ...this.currentController, ...updates };
      this.saveToStorage();
    }
  }

  async deleteController(controllerId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('controllers')
        .delete()
        .eq('id', controllerId);

      if (error) throw error;
    } catch (error) {
      console.warn('Failed to delete from Supabase, removing locally');
    }

    // Always remove locally
    const controllers = this.getLocalControllers();
    const filtered = controllers.filter(c => c.id !== controllerId);
    localStorage.setItem(STORAGE_KEYS.CONTROLLERS, JSON.stringify(filtered));

    // Clear current if deleted
    if (this.currentController?.id === controllerId) {
      this.currentController = null;
      this.saveToStorage();
    }
  }

  // Local controller management
  private getLocalControllers(): Controller[] {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CONTROLLERS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  private saveControllerLocally(controller: Controller) {
    const controllers = this.getLocalControllers();
    const index = controllers.findIndex(c => c.id === controller.id);
    if (index >= 0) {
      controllers[index] = controller;
    } else {
      controllers.push(controller);
    }
    localStorage.setItem(STORAGE_KEYS.CONTROLLERS, JSON.stringify(controllers));
  }

  // Current controller management
  setCurrentController(controller: Controller | null) {
    this.currentController = controller;
    this.saveToStorage();
    
    // Dispatch event for other components to react
    window.dispatchEvent(new CustomEvent('controllerChanged', { 
      detail: controller 
    }));
  }

  getCurrentController(): Controller | null {
    return this.currentController;
  }

  getControllerUrl(): string | null {
    if (!this.currentController) return null;
    
    const url = this.currentController.url;
    const port = this.currentController.port || 443;
    
    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return `https://${url}:${port}`;
    }
    
    return url.includes(':') ? url : `${url}:${port}`;
  }

  // === Controller Credentials ===

  async saveControllerCredentials(
    controllerId: string, 
    credentials: Omit<ControllerCredentials, 'controller_id'>
  ): Promise<void> {
    // For security, we store credentials in Supabase with encryption
    // In a production app, use Supabase Vault or similar
    const { error } = await supabase
      .from('controller_credentials')
      .upsert({
        controller_id: controllerId,
        ...credentials,
        // Note: In production, encrypt the password before storing
        encrypted_password: credentials.password
      });

    if (error) {
      // Fallback: store in localStorage (less secure, for development)
      const key = `controller_creds_${controllerId}`;
      localStorage.setItem(key, JSON.stringify(credentials));
    }
  }

  async getControllerCredentials(controllerId: string): Promise<ControllerCredentials | null> {
    try {
      const { data, error } = await supabase
        .from('controller_credentials')
        .select('*')
        .eq('controller_id', controllerId)
        .single();

      if (error) throw error;

      return {
        controller_id: data.controller_id,
        credential_type: data.credential_type,
        username: data.username,
        password: data.encrypted_password // In production, decrypt
      };
    } catch {
      // Fallback to localStorage
      const key = `controller_creds_${controllerId}`;
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : null;
    }
  }

  // === Connection Testing ===

  async testControllerConnection(controller: Controller): Promise<{
    success: boolean;
    message: string;
    latency?: number;
  }> {
    const startTime = Date.now();
    
    try {
      const url = controller.url.startsWith('http') 
        ? controller.url 
        : `https://${controller.url}`;
      
      // Try to reach the controller's API
      const response = await fetch(`${url}/management/v1/aps`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000)
      });

      const latency = Date.now() - startTime;

      // Update controller status
      await this.updateController(controller.id, {
        connection_status: response.ok ? 'connected' : 'error',
        last_connected_at: new Date().toISOString()
      });

      return {
        success: response.ok || response.status === 401, // 401 means reachable but needs auth
        message: response.ok ? 'Connected' : `HTTP ${response.status}`,
        latency
      };
    } catch (error) {
      await this.updateController(controller.id, {
        connection_status: 'disconnected'
      });

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }

  // === Audit Logging ===

  async logAction(
    action: string,
    resourceType?: string,
    resourceId?: string,
    details?: Record<string, any>
  ): Promise<void> {
    try {
      await supabase.from('tenant_audit_log').insert({
        org_id: this.currentOrg?.id,
        controller_id: this.currentController?.id,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        details
      });
    } catch (error) {
      console.error('Failed to log action:', error);
    }
  }

  // === Quick Add Controller (without Supabase) ===

  addQuickController(name: string, url: string): Controller {
    const controller: Controller = {
      id: crypto.randomUUID(),
      org_id: this.currentOrg?.id || 'local',
      name,
      url,
      is_active: true,
      is_default: false,
      connection_status: 'unknown',
      created_at: new Date().toISOString()
    };

    this.saveControllerLocally(controller);
    return controller;
  }

  // === Clear All Data ===

  clearAll() {
    this.currentController = null;
    this.currentOrg = null;
    localStorage.removeItem(STORAGE_KEYS.CURRENT_CONTROLLER);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_ORG);
    localStorage.removeItem(STORAGE_KEYS.CONTROLLERS);
  }
}

// Export singleton instance
export const tenantService = new TenantService();

// Export default controller for reference
export { DEFAULT_CONTROLLER };
