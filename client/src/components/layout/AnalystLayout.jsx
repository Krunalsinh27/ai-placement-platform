import React, { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import AnalystSidebar from './AnalystSidebar';
import { useAuth } from '../../context/AuthContext';
import { Menu, BarChart3, ShieldCheck, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';

const AnalystLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();

  // Superadmin opening /analyst/* is redirected to /superadmin/analytics/overview
  if (user?.role === 'superadmin') {
    return <Navigate to="/superadmin/analytics/overview" replace />;
  }

  const handleLogout = () => {
    logout();
    toast.success('Signed out successfully');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Analyst Sidebar */}
      <AnalystSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between shadow-xs">
          {/* Mobile Menu & Brand */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 lg:hidden"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">
                Cross-College Analytics Portal
              </span>
              {user?.organisation && (
                <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                  <span>•</span>
                  <span>{user.organisation}</span>
                </span>
              )}
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Observer Badge */}
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>Analyst / Observer</span>
            </span>

            {/* Quick Profile Name */}
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-semibold text-slate-800">{user?.name}</span>
              <span className="text-[10px] text-slate-500">
                {user?.designation || 'Observer'}
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Page View Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AnalystLayout;

