import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Menu, LogOut, Shield, User as UserIcon } from 'lucide-react';
import NotificationDropdown from './NotificationDropdown';
import toast from 'react-hot-toast';

const Navbar = ({ onOpenSidebar }) => {
  const { user, isAdmin, logout } = useAuth();

  const handleLogout = () => {
    logout();
    toast.success('Signed out successfully');
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between shadow-xs">
      {/* Mobile Menu Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 lg:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="hidden sm:block">
          <h1 className="text-sm font-semibold text-slate-700">
            College Placement Record Management System
          </h1>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Notification Bell */}
        <NotificationDropdown />

        {/* Role badge */}
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${isAdmin
              ? 'bg-purple-100 text-purple-700 border border-purple-200'
              : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
            }`}
        >
          {isAdmin ? <Shield className="w-3.5 h-3.5" /> : <UserIcon className="w-3.5 h-3.5" />}
          {isAdmin ? (user?.role === 'tpo' ? 'TPO' : 'Admin') : 'Student'}
          {user?.college?.code && (
            <span className="font-mono text-[10px] bg-white/70 px-1 rounded text-purple-800">
              {user.college.code}
            </span>
          )}
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
};

export default Navbar;

