import axios, { AxiosError, type AxiosRequestConfig  } from 'axios';
import { useAuthStore } from '../stores/authStore';

interface FailedRequest {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}

let isRefreshing = false;
let failedQueue: FailedRequest[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else if (token) {
      resolve(token);
    }
  });
  failedQueue = [];
};

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Request interceptor — attach JWT token
apiClient.interceptors.request.use(
  (config: AxiosRequestConfig & { headers?: Record<string, string> }) => {
    const { token } = useAuthStore.getState();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor — handle 401 and refresh
apiClient.interceptors.response.use(
  (response) => {
    // The API wraps every response as { success, data }. Unwrap it here so
    // callers receive the actual payload; without this, services that do
    // `.map()` on `response.data` (dashboard trend/breakdown, products) crash
    // with "g.map is not a function" / iterate an envelope instead of an array.
    const body = response.data as { success?: unknown; data?: unknown } | null;
    if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
      response.data = body.data;
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = (error.config || {}) as AxiosRequestConfig & {
      _retry?: boolean;
      headers?: Record<string, string>;
    };

    if (!originalRequest) {
      return Promise.reject(error);
    }

    // If offline, queue the request for later
    if (!navigator.onLine) {
      return Promise.reject({
        offline: true,
        message: 'No internet connection. Request queued for sync.',
        config: originalRequest,
      });
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue this request until the refresh completes
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const { refreshToken, setTokens, logout } = useAuthStore.getState();

      if (!refreshToken) {
        isRefreshing = false;
        logout();
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'}/auth/refresh`,
          { refreshToken },
        );

        // The API wraps responses as { success, data: { accessToken, refreshToken } }.
        const body = response.data as {
          data?: { accessToken?: unknown; refreshToken?: unknown };
        };
        const data = body?.data ?? body;
        const newToken = typeof data.accessToken === 'string' ? data.accessToken : null;
        const newRefreshToken = typeof data.refreshToken === 'string' ? data.refreshToken : null;

        if (!newToken) {
          processQueue(new Error('Token refresh failed: missing access token'), null);
          logout();
          return Promise.reject(error);
        }

        setTokens(newToken, newRefreshToken ?? '');
        processQueue(null, newToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        logout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;