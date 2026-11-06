export interface MyProfile {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  roleName: string;
  status: string;
  memberSince: string;
  lastSignIn: string;
  avatarUrl: string | null;
}

export interface UpdateProfilePayload {
  firstName: string;
  lastName: string;
  phone: string;
}

export const NOTIFICATION_CHANNELS = ['in-app', 'email', 'sms'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface NotificationPreference {
  event: string;
  channels: Record<NotificationChannel, boolean>;
  /** Channels an administrator cannot switch off. */
  locked: NotificationChannel[];
}

export interface SecuritySettings {
  newDeviceAlerts: boolean;
  ipRestriction: boolean;
}

export interface SearchResult {
  id: string;
  type: 'School' | 'User' | 'Issue';
  title: string;
  meta: string;
  to: string;
}

export interface AppNotification {
  id: string;
  title: string;
  detail: string;
  when: string;
  unread: boolean;
  to: string;
}
