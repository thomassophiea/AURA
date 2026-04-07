/**
 * NotificationService - Handles in-app and push notification alerts
 * Monitors for: AP offline events, SLE drops below threshold, client issues
 */

export interface NotificationPreferences {
  apOffline: boolean;
  sleDrops: boolean;
  highClientCount: boolean;
  sleThreshold: number;
  clientCountThreshold: number;
  enabled: boolean;
}

export interface AppNotification {
  id: string;
  type: 'ap_offline' | 'sle_drop' | 'high_clients' | 'info';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  data?: any;
}

type NotificationCallback = (notifications: AppNotification[]) => void;

const PREFERENCES_KEY = 'aura_notification_preferences';
const NOTIFICATIONS_KEY = 'aura_notifications';
const MAX_NOTIFICATIONS = 50;

const defaultPreferences: NotificationPreferences = {
  apOffline: true,
  sleDrops: true,
  highClientCount: false,
  sleThreshold: 70,
  clientCountThreshold: 100,
  enabled: true,
};

class NotificationService {
  private subscribers: Set<NotificationCallback> = new Set();
  private preferences: NotificationPreferences;
  private notifications: AppNotification[] = [];
  private seenAPOffline: Set<string> = new Set();
  private seenSLEDrops: Set<string> = new Set();

  constructor() {
    this.preferences = this.loadPreferences();
    this.notifications = this.loadNotifications();
  }

  private loadPreferences(): NotificationPreferences {
    try {
      const stored = localStorage.getItem(PREFERENCES_KEY);
      if (stored) {
        return { ...defaultPreferences, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error('Failed to load notification preferences:', e);
    }
    return { ...defaultPreferences };
  }

  private savePreferences(): void {
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(this.preferences));
    } catch (e) {
      console.error('Failed to save notification preferences:', e);
    }
  }

  private loadNotifications(): AppNotification[] {
    try {
      const stored = localStorage.getItem(NOTIFICATIONS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load notifications:', e);
    }
    return [];
  }

  private saveNotifications(): void {
    try {
      const toSave = this.notifications.slice(0, MAX_NOTIFICATIONS);
      localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.error('Failed to save notifications:', e);
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private addNotification(notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>): void {
    const newNotification: AppNotification = {
      ...notification,
      id: this.generateId(),
      timestamp: Date.now(),
      read: false,
    };

    this.notifications.unshift(newNotification);
    if (this.notifications.length > MAX_NOTIFICATIONS) {
      this.notifications = this.notifications.slice(0, MAX_NOTIFICATIONS);
    }

    this.saveNotifications();
    this.notifySubscribers();
  }

  private notifySubscribers(): void {
    this.subscribers.forEach(callback => {
      try {
        callback([...this.notifications]);
      } catch (e) {
        console.error('Notification subscriber error:', e);
      }
    });
  }

  getPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  updatePreferences(updates: Partial<NotificationPreferences>): void {
    this.preferences = { ...this.preferences, ...updates };
    this.savePreferences();
  }

  checkAPStatus(aps: any[]): AppNotification[] {
    if (!this.preferences.enabled || !this.preferences.apOffline) {
      return [];
    }

    const newNotifications: AppNotification[] = [];
    const currentOffline = new Set<string>();

    aps.forEach(ap => {
      const apId = ap.id || ap.mac || ap.name;
      const isOffline = ap.status === 'offline' || ap.status === 'down' || ap.connected === false;

      if (isOffline && apId) {
        currentOffline.add(apId);

        if (!this.seenAPOffline.has(apId)) {
          this.seenAPOffline.add(apId);
          const notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'> = {
            type: 'ap_offline',
            title: 'AP Offline',
            message: `Access Point "${ap.name || apId}" is offline`,
            data: { apId, apName: ap.name, siteName: ap.siteName },
          };
          this.addNotification(notification);
          newNotifications.push({
            ...notification,
            id: this.notifications[0]?.id || '',
            timestamp: Date.now(),
            read: false,
          });
        }
      }
    });

    this.seenAPOffline.forEach(apId => {
      if (!currentOffline.has(apId)) {
        this.seenAPOffline.delete(apId);
      }
    });

    return newNotifications;
  }

  checkSLEs(sles: any[]): AppNotification[] {
    if (!this.preferences.enabled || !this.preferences.sleDrops) {
      return [];
    }

    const newNotifications: AppNotification[] = [];
    const threshold = this.preferences.sleThreshold;

    sles.forEach(sle => {
      const sleId = sle.id || sle.metric || sle.name;
      const value = typeof sle.value === 'number' ? sle.value : parseFloat(sle.value);

      if (!isNaN(value) && value < threshold && sleId) {
        const notificationKey = `${sleId}-${Math.floor(value / 10)}`;

        if (!this.seenSLEDrops.has(notificationKey)) {
          this.seenSLEDrops.add(notificationKey);

          setTimeout(() => {
            this.seenSLEDrops.delete(notificationKey);
          }, 5 * 60 * 1000);

          const notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'> = {
            type: 'sle_drop',
            title: 'SLE Below Threshold',
            message: `${sle.name || sleId} dropped to ${value.toFixed(1)}% (threshold: ${threshold}%)`,
            data: { sleId, sleName: sle.name, value, threshold },
          };
          this.addNotification(notification);
          newNotifications.push({
            ...notification,
            id: this.notifications[0]?.id || '',
            timestamp: Date.now(),
            read: false,
          });
        }
      }
    });

    return newNotifications;
  }

  checkHighClientCount(clientCount: number, context?: string): AppNotification[] {
    if (!this.preferences.enabled || !this.preferences.highClientCount) {
      return [];
    }

    if (clientCount >= this.preferences.clientCountThreshold) {
      const notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'> = {
        type: 'high_clients',
        title: 'High Client Count',
        message: `${clientCount} clients connected${context ? ` at ${context}` : ''}`,
        data: { clientCount, context },
      };
      this.addNotification(notification);
      return [{
        ...notification,
        id: this.notifications[0]?.id || '',
        timestamp: Date.now(),
        read: false,
      }];
    }

    return [];
  }

  getUnreadNotifications(): AppNotification[] {
    return this.notifications.filter(n => !n.read);
  }

  getAllNotifications(): AppNotification[] {
    return [...this.notifications];
  }

  getUnreadCount(): number {
    return this.notifications.filter(n => !n.read).length;
  }

  markAsRead(notificationId: string): void {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
      this.saveNotifications();
      this.notifySubscribers();
    }
  }

  markAllAsRead(): void {
    this.notifications.forEach(n => (n.read = true));
    this.saveNotifications();
    this.notifySubscribers();
  }

  clearAll(): void {
    this.notifications = [];
    this.saveNotifications();
    this.notifySubscribers();
  }

  deleteNotification(notificationId: string): void {
    this.notifications = this.notifications.filter(n => n.id !== notificationId);
    this.saveNotifications();
    this.notifySubscribers();
  }

  subscribe(callback: NotificationCallback): () => void {
    this.subscribers.add(callback);
    callback([...this.notifications]);

    return () => {
      this.subscribers.delete(callback);
    };
  }

  addInfoNotification(title: string, message: string, data?: any): void {
    this.addNotification({
      type: 'info',
      title,
      message,
      data,
    });
  }
}

export const notificationService = new NotificationService();
