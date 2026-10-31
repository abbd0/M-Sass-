/**
 * authStore — global auth state (Zustand).
 * Mirrors backend security model: JWT HS256 (issuer/audience verified) delivered
 * in a signed httpOnly cookie. The JS side only knows the decoded user profile;
 * the token itself is never readable from localStorage (XSS-safe).
 */
import { create } from 'zustand';
import type { Role } from '../libs/common';

export interface UserProfile {
  sub: string; // user id
  email: string;
  name: string;
  role: Role; // RBAC — enforced server-side via @Roles + JwtAuthGuard
}

interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  /** true while the httpOnly-cookie session is being re-validated on boot */
  checkingSession: boolean;
  login: (user: UserProfile) => void;
  logout: () => void;
  setCheckingSession: (v: boolean) => void;
  hasRole: (...roles: Role[]) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  checkingSession: true,
  login: (user) => set({ user, isAuthenticated: true, checkingSession: false }),
  logout: () => set({ user: null, isAuthenticated: false, checkingSession: false }),
  setCheckingSession: (v) => set({ checkingSession: v }),
  hasRole: (...roles) => {
    const u = get().user;
    return !!u && roles.includes(u.role);
  },
}));
