import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

let inMemoryToken = null;

export const setAccessToken = (token) => {
  inMemoryToken = token || null;
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

export const getAccessToken = () => inMemoryToken;

/**
 * Checks whether an HTTP method is idempotent and safe for automatic retry.
 * Only GET, HEAD, and OPTIONS are idempotent. POST, PUT, PATCH, DELETE are NEVER retried.
 */
export const isIdempotentMethod = (method) => {
  if (!method || typeof method !== 'string') return true; // Default Axios method is GET
  const m = method.toLowerCase();
  return m === 'get' || m === 'head' || m === 'options';
};

/**
 * Checks whether an endpoint requires an extended timeout (e.g. 90s)
 * for heavy operations: AI resume parse/analysis, PDF/Excel/CSV exports, and file uploads.
 */
export const isSlowEndpoint = (config = {}) => {
  const url = (config.url || '').toLowerCase();
  const method = (config.method || 'get').toLowerCase();
  const isFormData = typeof FormData !== 'undefined' && config.data instanceof FormData;
  const isBlob = config.responseType === 'blob';
  const isMultipart =
    config.headers?.['Content-Type']?.includes?.('multipart/form-data') ||
    config.headers?.['content-type']?.includes?.('multipart/form-data');

  return (
    url.includes('/resume/parse') ||
    url.includes('/resume/analyze') ||
    url.includes('/ai/') ||
    url.includes('/assistant') ||
    url.includes('/export') ||
    url.includes('/reports') ||
    url.includes('/upload') ||
    (url.includes('/resume') && method === 'post') ||
    isFormData ||
    isBlob ||
    isMultipart
  );
};

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 15000, // 15s default timeout for standard endpoints
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

// Request interceptor: attach in-memory JWT access token and configure appropriate timeout
api.interceptors.request.use(
  (config) => {
    if (inMemoryToken) {
      config.headers.Authorization = `Bearer ${inMemoryToken}`;
    }
    config.headers['X-Requested-With'] = 'XMLHttpRequest';

    // Extend timeout to 90s for AI parsing/analysis, document exports, and file uploads
    if (!config.timeout || config.timeout === 15000) {
      if (isSlowEndpoint(config)) {
        config.timeout = 90000;
      } else {
        config.timeout = 15000;
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: auto-refresh on 401 using httpOnly cookie and replay ONCE for all HTTP methods
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject, config }) => {
    if (error) {
      reject(error);
    } else {
      // Safe to replay ONCE after token refresh for all HTTP methods
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
      resolve(api(config));
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Do not intercept refresh, login, or verification endpoints
    if (
      !originalRequest ||
      originalRequest.url?.includes('/auth/refresh') ||
      originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/verify-email')
    ) {
      return Promise.reject(error);
    }

    // 1. Handle 401 Unauthorized (Token Expiration)
    // Protected endpoint rejected request at auth middleware before executing any handler.
    // Safe to replay ONCE for ALL methods (POST, PUT, PATCH, DELETE too) after token refresh.
    if (error.response?.status === 401) {
      if (originalRequest._retry) {
        // Never replay a request more than once
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject, config: originalRequest });
        });
      }

      isRefreshing = true;

      const refreshStartTime = Date.now();
      const MAX_REFRESH_WINDOW_MS = 75000; // Keep retrying for ~75 seconds during server cold starts
      let lastRefreshErr = null;
      let attempt = 0;

      while (Date.now() - refreshStartTime < MAX_REFRESH_WINDOW_MS) {
        try {
          const res = await axios.post(
            `${API_BASE_URL}/auth/refresh`,
            {},
            {
              withCredentials: true,
              timeout: 15000,
              headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
              },
            }
          );

          const newToken = res.data?.token;
          if (newToken) {
            setAccessToken(newToken);
            isRefreshing = false;
            processQueue(null, newToken);

            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          }
        } catch (refreshError) {
          lastRefreshErr = refreshError;
          // Unauthenticated or forbidden (401/403): do NOT retry; user must log in
          if (refreshError.response?.status === 401 || refreshError.response?.status === 403) {
            break;
          }
          // Server cold start (network error, timeout, 502, 503, 504): wait with backoff (2s, 3s, 4s, up to 5s)
          const remainingTime = MAX_REFRESH_WINDOW_MS - (Date.now() - refreshStartTime);
          if (remainingTime > 2000) {
            const backoffMs = Math.min(5000, Math.min(remainingTime, 2000 + attempt * 1000));
            await new Promise((r) => setTimeout(r, backoffMs));
            attempt++;
          } else {
            break;
          }
        }
      }

      isRefreshing = false;
      processQueue(lastRefreshErr, null);

      // Only force logout on confirmed 401/403 unauthenticated response, not transient network errors
      if (lastRefreshErr?.response?.status === 401 || lastRefreshErr?.response?.status === 403) {
        setAccessToken(null);
        if (typeof window !== 'undefined' && window.location) {
          const currentPath = window.location.pathname || '';
          if (currentPath !== '/login' && currentPath !== '/register') {
            if (typeof localStorage !== 'undefined') {
              localStorage.removeItem('user');
              localStorage.removeItem('student');
            }
            window.location.href = '/login';
          }
        }
      }

      return Promise.reject(lastRefreshErr || error);
    }

    // 2. Handle Transient Network Errors, Timeouts, or 502/503/504
    const isTransientColdStartError =
      !error.response ||
      error.code === 'ECONNABORTED' ||
      [502, 503, 504].includes(error.response?.status);

    if (isTransientColdStartError) {
      // NEVER automatically retry non-idempotent requests (POST, PUT, PATCH, DELETE)
      if (!isIdempotentMethod(originalRequest?.method)) {
        return Promise.reject(error);
      }

      // Idempotent GET/HEAD/OPTIONS may be retried with backoff once
      if (
        !originalRequest?._retryColdStart &&
        !originalRequest?.url?.includes('/auth/refresh')
      ) {
        originalRequest._retryColdStart = true;
        // Wait initial 2s backoff then retry idempotent GET once
        await new Promise((r) => setTimeout(r, 2000));
        return api(originalRequest);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
