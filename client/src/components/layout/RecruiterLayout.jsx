import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import RecruiterSidebar from './RecruiterSidebar';
import NotificationDropdown from './NotificationDropdown';
import { useAuth } from '../../context/AuthContext';
import { Menu, LogOut, Building2, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

const RecruiterLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const company = user?.company;

  const handleLogout = () => {
    logout();
    toast.success('Signed out successfully');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Recruiter specific sidebar */}
      <RecruiterSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content wrapper */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between shadow-xs">
          {/* Mobile Menu Button & Brand */}
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
                Corporate Hiring Portal
              </span>
              {company?.name && (
                <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                  <span>•</span>
                  <span>{company.name}</span>
                </span>
              )}
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Notification Bell */}
            <NotificationDropdown />

            {/* Verified Employer Badge */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Verified Employer</span>
            </span>

            {/* User Info */}
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-semibold text-slate-800 leading-tight">
                {user?.name}
              </span>
              <span className="text-[11px] text-slate-500 leading-tight">
                {user?.email}
              </span>
            </div>

            {/* Logout button */}
            <button
              onClick={handleLogout}
              title="Sign Out"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>

        {/* Page content area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default RecruiterLayout;

