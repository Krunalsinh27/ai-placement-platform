import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Building2,
  Users,
  Briefcase,
  TrendingUp,
  LogOut,
  X,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  PieChart,
  School,
  ArrowRightLeft,
  Award,
  LineChart,
  UserCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';

const SuperadminSidebar = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth();
  const location = useLocation();

  // Keep analytics sub-menu expanded if currently on an analytics page
  const isAnalyticsActive = location.pathname.startsWith('/superadmin/analytics');
  const [analyticsOpen, setAnalyticsOpen] = useState(true);

  const handleLogout = () => {
    logout();
    toast.success('Signed out successfully');
  };

  const primaryNavLinks = [
    {
      name: 'Platform Overview',
      path: '/superadmin/dashboard',
      icon: LayoutDashboard,
    },
    {
      name: 'Pending Analysts',
      path: '/superadmin/analysts',
      icon: Users,
    },
    {
      name: 'Pending Accounts',
      path: '/superadmin/pending-accounts',
      icon: UserCheck,
    },
    {
      name: 'Manage Colleges',
      path: '/superadmin/colleges',
      icon: Building2,
    },
    {
      name: 'Manage Companies',
      path: '/superadmin/companies',
      icon: Briefcase,
    },
  ];

  const analyticsSubLinks = [
    {
      name: 'Overview',
      path: '/superadmin/analytics/overview',
      icon: PieChart,
    },
    {
      name: 'All Colleges',
      path: '/superadmin/analytics/colleges',
      icon: School,
    },
    {
      name: 'Compare',
      path: '/superadmin/analytics/compare',
      icon: ArrowRightLeft,
    },
    {
      name: 'Top Recruiters',
      path: '/superadmin/analytics/recruiters',
      icon: Award,
    },
    {
      name: 'Trends',
      path: '/superadmin/analytics/trends',
      icon: LineChart,
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
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-slate-950 text-slate-300 flex flex-col transition-transform duration-200 ease-in-out border-r border-slate-800 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800 bg-black/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center text-white shadow-md shadow-rose-600/30">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <span className="text-sm font-bold text-white tracking-wide block">
                SUPERADMIN
              </span>
              <span className="text-[10px] text-rose-400 font-semibold block">
                Platform Administrator
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
            Platform Management
          </div>

          {primaryNavLinks.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.path}
                to={link.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/40'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{link.name}</span>
              </NavLink>
            );
          })}

          {/* Cross-College Analytics Section with Sub-links */}
          <div className="pt-3">
            <button
              onClick={() => setAnalyticsOpen(!analyticsOpen)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                isAnalyticsActive
                  ? 'text-rose-400 bg-slate-900/80'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <TrendingUp className="w-4 h-4 text-rose-500" />
                <span className="font-bold">Cross-College Analytics</span>
              </div>
              {analyticsOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              )}
            </button>

            {analyticsOpen && (
              <div className="ml-4 pl-3 border-l border-slate-800 mt-1 space-y-1">
                {analyticsSubLinks.map((sub) => {
                  const SubIcon = sub.icon;
                  return (
                    <NavLink
                      key={sub.path}
                      to={sub.path}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all ${
                          isActive
                            ? 'bg-rose-600/20 text-rose-400 font-semibold border-l-2 border-rose-500'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                        }`
                      }
                    >
                      <SubIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>{sub.name}</span>
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* User Card & Logout */}
        <div className="p-3 border-t border-slate-800 bg-black/50">
          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-rose-600/30 text-rose-400 flex items-center justify-center font-bold text-xs">
                SA
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">{user?.name || 'Superadmin'}</p>
                <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default SuperadminSidebar;
