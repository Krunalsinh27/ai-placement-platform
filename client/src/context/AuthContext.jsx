import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { setAccessToken } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  const [student, setStudent] = useState(() => {
    const saved = localStorage.getItem('student');
    return saved ? JSON.parse(saved) : null;
  });

  // Access token is held in-memory ONLY - never in localStorage/sessionStorage
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);

  const handleLocalLogout = useCallback(() => {
    setAccessToken(null);
    setToken(null);
    setUser(null);
    setStudent(null);
    setNetworkError(false);
    setIsWakingUp(false);
    localStorage.removeItem('user');
    localStorage.removeItem('student');
  }, []);

  // Synchronize auth state on mount via httpOnly refresh cookie
  useEffect(() => {
    let isMounted = true;

    // Cross-tab logout listener via BroadcastChannel
    const channel =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel('placement_auth_channel')
        : null;

    if (channel) {
      channel.onmessage = (event) => {
        if (event.data?.type === 'LOGOUT') {
          handleLocalLogout();
        }
      };
    }

    // Fallback cross-tab listener via storage event
    const handleStorageEvent = (event) => {
      if (event.key === 'auth_logout_timestamp') {
        handleLocalLogout();
      }
    };
    window.addEventListener('storage', handleStorageEvent);

    const initAuth = async () => {
      const startTime = Date.now();
      const MAX_INIT_WINDOW_MS = 75000; // Keep retrying for ~75 seconds on free-tier cold starts
      let refreshSuccess = false;
      let lastErr = null;
      let attempt = 0;

      while (Date.now() - startTime < MAX_INIT_WINDOW_MS) {
        try {
          const res = await api.post('/auth/refresh');
          if (res.data?.success && res.data?.token) {
            const newToken = res.data.token;
            setAccessToken(newToken);
            if (isMounted) {
              setToken(newToken);
              setNetworkError(false);
              setIsWakingUp(false);
            }

            const meRes = await api.get('/auth/me');
            if (isMounted && meRes.data?.success) {
              setUser(meRes.data.user);
              setStudent(meRes.data.student || null);
              localStorage.setItem('user', JSON.stringify(meRes.data.user));
              if (meRes.data.student) {
                localStorage.setItem('student', JSON.stringify(meRes.data.student));
              } else {
                localStorage.removeItem('student');
              }
            }
            refreshSuccess = true;
            break;
          }
        } catch (err) {
          lastErr = err;
          // 401 or 403 means genuinely expired / unauthenticated -> do not retry
          if (err.response?.status === 401 || err.response?.status === 403) {
            break;
          }
          // Server cold start, network error, or 502/503/504: show waking up state and backoff
          if (isMounted) {
            setIsWakingUp(true);
          }
          const remainingTime = MAX_INIT_WINDOW_MS - (Date.now() - startTime);
          if (remainingTime > 2000) {
            const backoffMs = Math.min(5000, Math.min(remainingTime, 2000 + attempt * 1000));
            await new Promise((r) => setTimeout(r, backoffMs));
            attempt++;
          } else {
            break;
          }
        }
      }

      if (isMounted) {
        setIsWakingUp(false);
      }

      if (!refreshSuccess) {
        if (lastErr?.response?.status === 401 || lastErr?.response?.status === 403 || !lastErr) {
          handleLocalLogout();
        } else {
          // Network or server timeout: retain existing user state so user is not logged out during cold start
          if (isMounted) setNetworkError(true);
        }
      }

      if (isMounted) setLoading(false);
    };

    initAuth();

    return () => {
      isMounted = false;
      if (channel) channel.close();
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [handleLocalLogout]);

  // Login handler
  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    if (res.data.success) {
      const { token: newToken, user: newUser, student: newStudent } = res.data;
      setAccessToken(newToken);
      setToken(newToken);
      setUser(newUser);
      setStudent(newStudent);

      // Persist only non-sensitive user metadata - NO token in storage
      localStorage.setItem('user', JSON.stringify(newUser));
      if (newStudent) {
        localStorage.setItem('student', JSON.stringify(newStudent));
      } else {
        localStorage.removeItem('student');
      }
      return res.data;
    }
  };

  // Register handler (for students)
  const register = async (formData) => {
    const res = await api.post('/auth/register', formData);
    return res.data;
  };

  // Register handler (for TPOs)
  const registerTPO = async (formData) => {
    const res = await api.post('/auth/register/tpo', formData);
    return res.data;
  };

  // Register handler (for Register New College & First TPO)
  const registerCollege = async (formData) => {
    const res = await api.post('/auth/register-college', formData);
    return res.data;
  };

  // Register handler (for Recruiters)
  const registerRecruiter = async (formData) => {
    const res = await api.post('/auth/register-recruiter', formData);
    return res.data;
  };

  // Register handler (for Analyst / Observer)
  const registerAnalyst = async (formData) => {
    const res = await api.post('/auth/register-analyst', formData);
    return res.data;
  };

  // Register handler (for Prospective Student / Aspirant)
  const registerAspirant = async (formData) => {
    const res = await api.post('/auth/register-aspirant', formData);
    return res.data;
  };

  // Logout handler
  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (_) {}
    handleLocalLogout();

    // Broadcast logout event across tabs
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('placement_auth_channel');
        channel.postMessage({ type: 'LOGOUT' });
        channel.close();
      }
    } catch (_) {}
    localStorage.setItem('auth_logout_timestamp', Date.now().toString());
  };

  // Update student profile locally
  const updateStudent = (updatedStudent) => {
    setStudent(updatedStudent);
    localStorage.setItem('student', JSON.stringify(updatedStudent));
  };

  // Update user info locally
  const updateUser = (updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  const isAdminRole = user?.role === 'admin' || user?.role === 'tpo' || user?.role === 'superadmin';

  return (
    <AuthContext.Provider
      value={{
        user,
        student,
        token,
        loading,
        networkError,
        isWakingUp,
        login,
        register,
        registerTPO,
        registerCollege,
        registerRecruiter,
        registerAnalyst,
        registerAspirant,
        logout,
        updateStudent,
        updateUser,
        isAuthenticated: !!token && !!user,
        isAdmin: isAdminRole,
        isTPO: user?.role === 'tpo',
        isSuperAdmin: user?.role === 'superadmin',
        isRecruiter: user?.role === 'recruiter',
        isAspirant: user?.role === 'aspirant',
        isStudent: user?.role === 'student',
        isAnalyst: user?.role === 'analyst',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
