import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'admin' | 'manager' | 'cashier' | 'warehouse' | 'auditor' | 'supervisor';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  /** Singular role derived from the API's `roles` array. `null` when unknown. */
  role: UserRole | null;
  /** Raw roles array as returned by the API. */
  roles: UserRole[];
  branchId: string | null;
  tenantId: string;
}

/**
 * Normalize the API user shape ({ id, firstName, lastName, roles: [...] })
 * into the AuthUser the rest of the app consumes (singular `role`, `name`).
 * Idempotent: passing an already-normalized AuthUser returns the same values.
 */
export function normalizeUser(raw: unknown): AuthUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  const roles = Array.isArray(u.roles)
    ? (u.roles.filter((r): r is UserRole => typeof r === 'string') as UserRole[])
    : [];
  const firstName = typeof u.firstName === 'string' ? u.firstName : '';
  const lastName = typeof u.lastName === 'string' ? u.lastName : '';
  const rawName = typeof u.name === 'string' ? u.name : '';
  const branches = Array.isArray(u.branches)
    ? (u.branches as Array<{ id?: unknown }>)
    : [];
  return {
    id: u.id != null ? String(u.id) : '',
    email: typeof u.email === 'string' ? u.email : '',
    name:
      rawName ||
      [firstName, lastName].filter(Boolean).join(' ').trim() ||
      (typeof u.email === 'string' ? u.email : ''),
    role: (typeof u.role === 'string' ? (u.role as UserRole) : null) ?? roles[0] ?? null,
    roles,
    branchId:
      typeof u.branchId === 'string'
        ? u.branchId
        : branches[0]?.id != null
          ? String(branches[0].id)
          : null,
    tenantId: u.tenantId != null ? String(u.tenantId) : '',
  };
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  deviceId: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setTokens: (token: string, refreshToken: string) => void;
  setUser: (user: AuthUser) => void;
  setDeviceId: (deviceId: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      deviceId: null,
      isAuthenticated: false,

      login: async (email: string, password: string) => {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'}/auth/login`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              password,
              deviceId: useAuthStore.getState().deviceId,
            }),
          },
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Login failed');
        }

        const body = await response.json();
        const data = body?.data ?? body;
        const user = normalizeUser(data.user);
        set({
          token: typeof data.accessToken === 'string' ? data.accessToken : null,
          refreshToken: typeof data.refreshToken === 'string' ? data.refreshToken : null,
          user,
          isAuthenticated: Boolean(data.accessToken && user),
        });
      },

      logout: () => {
        set({
          token: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        });
      },

      setTokens: (token: string, refreshToken: string) => {
        set({ token, refreshToken });
      },

      setUser: (user: AuthUser) => {
        set({ user: normalizeUser(user) });
      },

      setDeviceId: (deviceId: string) => {
        set({ deviceId });
      },
    }),
    {
      name: 'retailguard-auth',
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
        deviceId: state.deviceId,
        isAuthenticated: state.isAuthenticated,
      }),
      // Rehydration may deliver a user persisted before normalization existed
      // (raw API shape with `roles` and no singular `role`). Normalize on load.
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AuthState> | undefined;
        const storedUser = persisted?.user ?? null;
        return {
          ...currentState,
          ...persisted,
          user: storedUser ? normalizeUser(storedUser) : currentState.user,
        };
      },
    },
  ),
);