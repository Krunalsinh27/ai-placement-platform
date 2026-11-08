import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

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

  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);

  // Synchronize auth state on mount
  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        try {
          const res = await api.get('/auth/me');
          if (res.data.success) {
            setUser(res.data.user);
            setStudent(res.data.student);
            localStorage.setItem('user', JSON.stringify(res.data.user));
            if (res.data.student) {
              localStorage.setItem('student', JSON.stringify(res.data.student));
            }
          }
        } catch (error) {
          console.error('Session verification failed:', error);
          logout();
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  // Login handler
  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    if (res.data.success) {
      const { token: newToken, user: newUser, student: newStudent } = res.data;
      setToken(newToken);
      setUser(newUser);
      setStudent(newStudent);

      localStorage.setItem('token', newToken);
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
    setToken(null);
    setUser(null);
    setStudent(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('student');
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
