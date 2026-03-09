export type UserRole = 'admin' | 'om_specialist' | 'volunteer' | 'student';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  campusIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminUser extends User {
  role: 'admin' | 'om_specialist' | 'volunteer';
}

export interface StudentUser extends User {
  role: 'student';
  preferredHapticIntensity: number; // 0.0–1.0
  preferredSpeechRate: number;       // 0.5–2.0
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix seconds
  user: User;
}
