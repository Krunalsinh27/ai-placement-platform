import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import AspirantSidebar from './AspirantSidebar';
import { useAuth } from '../../context/AuthContext';
import { Menu, GraduationCap, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';

const AspirantLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    toast.success('Signed out successfully');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Aspirant Sidebar */}
      <AspirantSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between shadow-xs">
          {/* Mobile Menu & Brand */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 lg:hidden cursor-pointer"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">
                Prospective Student Portal
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                <span>•</span>
                <span>Verified Placement Insights</span>
              </span>
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Prospective Student Badge */}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
              <span>Prospective Student</span>
            </span>

            {/* Quick Profile Name */}
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-semibold text-slate-800">{user?.name || 'Prospective Student'}</span>
              <span className="text-[10px] text-slate-500">Applicant</span>
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

export default AspirantLayout;

