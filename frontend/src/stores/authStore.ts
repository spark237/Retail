import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'cashier' | 'warehouse' | 'auditor';
  branchId: string | null;
  tenantId: string;
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
    (set, get) => ({
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
              deviceId: get().deviceId,
            }),
          },
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Login failed');
        }

        const body = await response.json();
        const data = body?.data ?? body;
        set({
          token: data.accessToken ?? null,
          refreshToken: data.refreshToken ?? null,
          user: data.user ?? null,
          isAuthenticated: Boolean(data.accessToken && data.user),
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
        set({ user });
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
    },
  ),
);
