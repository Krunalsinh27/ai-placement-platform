import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Building2,
  GitCompare,
  Briefcase,
  TrendingUp,
  FileSpreadsheet,
  LogOut,
  X,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';

const AnalystSidebar = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    toast.success('Signed out successfully');
  };

  const navLinks = [
    {
      name: 'Overview Dashboard',
      path: '/analyst/dashboard',
      icon: LayoutDashboard,
    },
    {
      name: 'All Colleges',
      path: '/analyst/colleges',
      icon: Building2,
    },
    {
      name: 'Compare Colleges',
      path: '/analyst/compare',
      icon: GitCompare,
    },
    {
      name: 'Top Recruiters',
      path: '/analyst/recruiters',
      icon: Briefcase,
    },
    {
      name: 'Trends & Distribution',
      path: '/analyst/trends',
      icon: TrendingUp,
    },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-200 ease-in-out border-r border-slate-800 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <span className="text-sm font-bold text-white tracking-wide block">
                ANALYTICS HUB
              </span>
              <span className="text-[10px] text-indigo-400 font-medium block">
                Cross-College Observer
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Analytics & Insights
          </div>
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.path}
                to={link.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/40'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{link.name}</span>
              </NavLink>
            );
          })}
        </div>

        {/* User Card & Logout */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/50">
          <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50 mb-2">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-full bg-indigo-600/30 text-indigo-400 flex items-center justify-center font-bold text-xs">
                {user?.name?.[0] || 'A'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">{user?.name}</p>
                <p className="text-[10px] text-slate-400 truncate">
                  {user?.organisation || user?.email}
                </p>
              </div>
            </div>
            {user?.designation && (
              <p className="text-[10px] text-indigo-300 font-medium truncate mt-1">
                {user.designation}
              </p>
            )}
            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>Observer / Read-Only</span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default AnalystSidebar;

