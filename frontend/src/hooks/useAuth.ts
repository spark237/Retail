import { useCallback, useMemo } from 'react';
import { useAuthStore, type AuthUser } from '../stores/authStore';
import apiClient from '../api/client';

interface UseAuthReturn {
  login: (email: string, password: string, deviceId?: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  user: AuthUser | null;
  token: string | null;
}

export function useAuth(): UseAuthReturn {
  const {
    token,
    user,
    isAuthenticated,
    login: storeLogin,
    logout: storeLogout,
    setDeviceId,
  } = useAuthStore();

  const login = useCallback(
    async (email: string, password: string, deviceId?: string) => {
      if (deviceId) {
        setDeviceId(deviceId);
      }

      // Try offline login first — check if credentials are cached
      // For now, use the standard flow
      await storeLogin(email, password);
    },
    [storeLogin, setDeviceId],
  );

  const logout = useCallback(() => {
    // Try to notify server (fire and forget)
    if (navigator.onLine) {
      apiClient.post('/auth/logout').catch(() => {
        // Ignore errors during logout
      });
    }
    storeLogout();
  }, [storeLogout]);

  return useMemo(
    () => ({ login, logout, isAuthenticated, user, token }),
    [login, logout, isAuthenticated, user, token],
  );
}