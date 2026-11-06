import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * ProtectedRoute: guards routes based on authentication and role
 * @param {Array} allowedRoles - e.g. ['admin'], ['student'] or ['admin', 'student']
 */
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-600 text-sm font-medium">Loading session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    // If unauthorized for this specific role, redirect to their home dashboard
    let redirectPath = '/student/dashboard';
    if (user?.role === 'superadmin') {
      redirectPath = '/superadmin/dashboard';
    } else if (user?.role === 'aspirant') {
      redirectPath = '/aspirant/explore';
    } else if (['admin', 'tpo'].includes(user?.role)) {
      redirectPath = '/admin/dashboard';
    } else if (user?.role === 'recruiter') {
      redirectPath = '/recruiter/dashboard';
    } else if (user?.role === 'analyst') {
      redirectPath = '/analyst/dashboard';
    }
    return <Navigate to={redirectPath} replace />;
  }

  return children;
};

export default ProtectedRoute;

