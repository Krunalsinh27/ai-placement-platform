import { setAccessToken, getAccessToken, setAuthFailureHandler } from '../services/api';

const resetHandlers = new Set();
let isSecurityInitialized = false;

// Register auth failure handler to purge session data immediately on 401
try {
  setAuthFailureHandler(() => {
    clearSessionData({ broadcast: false });
  });
} catch (_) {}

/**
 * Check whether a pathname belongs to a protected role route.
 * Public routes (login, register, public college placement record, etc.) are excluded.
 */
export const isProtectedPath = (pathname = '') => {
  if (!pathname || typeof pathname !== 'string') return false;
  const p = pathname.toLowerCase();
  return (
    p.startsWith('/student') ||
    p.startsWith('/admin') ||
    p.startsWith('/recruiter') ||
    p.startsWith('/tpo') ||
    p.startsWith('/superadmin') ||
    p.startsWith('/analyst') ||
    p.startsWith('/aspirant')
  );
};

/**
 * Check whether the client currently holds an active user session.
 */
export const checkHasValidSession = () => {
  const token = getAccessToken();
  let user = null;
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('user');
      user = raw ? JSON.parse(raw) : null;
    }
  } catch (_) {}
  return Boolean(token && user);
};

/**
 * Register a callback to reset component or context state when session is cleared.
 * Returns an unregister function.
 */
export const registerSessionResetHandler = (handler) => {
  if (typeof handler === 'function') {
    resetHandlers.add(handler);
  }
  return () => {
    resetHandlers.delete(handler);
  };
};

/**
 * Generates a storage key scoped strictly to a specific user id.
 * Returns null if userId is absent or invalid to prevent guest data leaking.
 */
export const getScopedStorageKey = (prefix, userId) => {
  if (!prefix || !userId) return null;
  const cleanId = typeof userId === 'object' ? userId?._id || userId?.id : String(userId);
  if (!cleanId || cleanId === 'undefined' || cleanId === 'null') return null;
  return `${prefix}_${cleanId}`;
};

/**
 * Saves item to storage scoped strictly to a specific user ID, verifying ownership.
 */
export const saveScopedData = (prefix, userId, data, storage = null) => {
  const store = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  const key = getScopedStorageKey(prefix, userId);
  if (!key || !store) return false;

  try {
    const payload = {
      userId: typeof userId === 'object' ? userId?._id || userId?.id : String(userId),
      data,
      savedAt: Date.now(),
    };
    store.setItem(key, JSON.stringify(payload));
    return true;
  } catch (err) {
    console.warn(`[SessionManager] Could not save scoped data for key ${key}:`, err);
    return false;
  }
};

/**
 * Loads scoped item from storage, strictly validating that the stored userId matches current user.
 * If user differs or format is invalid, purges the item immediately and returns null.
 */
export const loadScopedData = (prefix, userId, storage = null) => {
  const store = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  const key = getScopedStorageKey(prefix, userId);
  if (!key || !store) return null;

  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const expectedId = typeof userId === 'object' ? userId?._id || userId?.id : String(userId);

    if (!parsed || parsed.userId !== expectedId) {
      store.removeItem(key);
      return null;
    }
    return parsed.data !== undefined ? parsed.data : parsed;
  } catch (_) {
    try {
      store.removeItem(key);
    } catch (_) {}
    return null;
  }
};

/**
 * Clears scoped data for a specific user ID or removes all keys matching prefix.
 */
export const clearScopedData = (prefix, userId = null, storage = null) => {
  const store = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  if (!store) return;

  try {
    if (userId) {
      const key = getScopedStorageKey(prefix, userId);
      if (key) store.removeItem(key);
    } else {
      for (let i = store.length - 1; i >= 0; i--) {
        const k = store.key(i);
        if (k && k.startsWith(`${prefix}_`)) {
          store.removeItem(k);
        }
      }
    }
  } catch (_) {}
};

/**
 * Global session purger: Clears all client-side authentication, per-user state,
 * localStorage, sessionStorage, in-memory tokens, service worker caches,
 * and resets all active React contexts and component states.
 */
export const clearSessionData = (options = {}) => {
  const { broadcast = true } = options;

  // 1. Clear in-memory token from Axios API headers
  try {
    setAccessToken(null);
  } catch (_) {}

  // 2. Clear all user data from localStorage
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('user');
      localStorage.removeItem('student');
      localStorage.removeItem('auth_logout_timestamp');

      // Purge any lingering user-scoped keys in localStorage
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith('resume_') ||
            key.startsWith('assistant_') ||
            key.startsWith('cache_') ||
            key.startsWith('placement_user_'))
        ) {
          localStorage.removeItem(key);
        }
      }
    }
  } catch (_) {}

  // 3. Purge all sessionStorage items entirely
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
  } catch (_) {}

  // 4. Purge browser CacheStorage if available
  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      window.caches
        .keys()
        .then((cacheNames) => Promise.all(cacheNames.map((name) => window.caches.delete(name))))
        .catch(() => {});
    }
  } catch (_) {}

  // 5. Invoke all registered React context/component reset handlers
  resetHandlers.forEach((handler) => {
    try {
      handler();
    } catch (err) {
      console.warn('[SessionManager] Error executing reset handler:', err);
    }
  });

  // 6. Dispatch custom session clear event on window for loose listeners
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('placement:session_cleared'));
    }
  } catch (_) {}

  // 7. Cross-tab synchronization via BroadcastChannel and localStorage storage event
  if (broadcast) {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('placement_auth_channel');
        channel.postMessage({ type: 'LOGOUT', timestamp: Date.now() });
        channel.close();
      }
    } catch (_) {}

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('auth_logout_timestamp', Date.now().toString());
      }
    } catch (_) {}
  }
};

/**
 * Initializes browser security handlers:
 * 1. pageshow handler: Detects back/forward cache (bfcache) restoration.
 *    If restored without an active session on a protected route, purges data and redirects to /login.
 * 2. Cross-tab logout listener: BroadcastChannel and storage events.
 */
export const initSessionSecurity = () => {
  if (typeof window === 'undefined' || isSecurityInitialized) return;
  isSecurityInitialized = true;

  // 1. Back/Forward Cache (bfcache) protection via pageshow
  window.addEventListener('pageshow', (event) => {
    const pathname = window.location.pathname || '';
    const isProtected = isProtectedPath(pathname);
    const hasSession = checkHasValidSession();

    // If restored from bfcache or navigating back to a protected view without session:
    if ((event.persisted || !hasSession) && isProtected) {
      clearSessionData({ broadcast: false });
      window.location.replace('/login');
    }
  });

  // 2. Cross-tab logout listener via BroadcastChannel
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('placement_auth_channel');
      channel.onmessage = (event) => {
        if (event.data?.type === 'LOGOUT') {
          clearSessionData({ broadcast: false });
          const pathname = window.location.pathname || '';
          if (isProtectedPath(pathname)) {
            window.location.replace('/login');
          }
        }
      };
    }
  } catch (_) {}

  // 3. Fallback cross-tab listener via storage event
  window.addEventListener('storage', (event) => {
    if (event.key === 'auth_logout_timestamp') {
      clearSessionData({ broadcast: false });
      const pathname = window.location.pathname || '';
      if (isProtectedPath(pathname)) {
        window.location.replace('/login');
      }
    }
  });
};

export const _resetSecurityInitializedForTesting = () => {
  isSecurityInitialized = false;
};

export default {
  clearSessionData,
  initSessionSecurity,
  _resetSecurityInitializedForTesting,
  registerSessionResetHandler,
  getScopedStorageKey,
  saveScopedData,
  loadScopedData,
  clearScopedData,
  isProtectedPath,
  checkHasValidSession,
};
