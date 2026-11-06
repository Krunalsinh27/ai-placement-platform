import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Building2,
  Briefcase,
  Award,
  LogOut,
  X,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  CalendarCheck,
  GitBranch,
} from 'lucide-react';
import toast from 'react-hot-toast';

const RecruiterSidebar = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth();
  const company = user?.company;

  const links = [
    { name: 'Dashboard', path: '/recruiter/dashboard', icon: LayoutDashboard },
    { name: 'Job Requirements', path: '/recruiter/requirements', icon: Briefcase },
    { name: 'Drive Requests', path: '/recruiter/drive-requests', icon: CalendarCheck },
    { name: 'Drive Pipeline', path: '/recruiter/pipeline', icon: GitBranch },
    { name: 'Company Profile', path: '/recruiter/profile', icon: Building2 },
    { name: 'Public Placement Record', path: '/placements', icon: Award },
  ];

  const handleLogout = () => {
    logout();
    toast.success('Signed out successfully');
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Recruiter Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-slate-900 text-slate-100 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between h-20 px-5 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            {company?.logoUrl ? (
              <img
                src={company.logoUrl}
                alt={company?.name || 'Company'}
                className="w-10 h-10 rounded-xl object-contain bg-white p-1 border border-slate-700 shrink-0"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-bold shadow-md shadow-sky-500/20 shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-white truncate leading-tight">
                {company?.name || 'Recruiter Portal'}
              </span>
              <span className="text-[11px] text-sky-400 font-medium flex items-center gap-1 mt-0.5">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>Verified Partner</span>
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
          <div className="px-3 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Employer Management
          </div>

          {links.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.path}
                to={link.path}
                onClick={() => onClose && onClose()}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{link.name}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Recruiter User Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40">
          <div className="flex items-center justify-between">
            <div className="flex flex-col min-w-0 pr-2">
              <span className="text-xs font-semibold text-slate-200 truncate leading-tight">
                {user?.name}
              </span>
              <span className="text-[11px] text-slate-400 truncate leading-tight">
                {user?.email}
              </span>
              <span className="text-[10px] text-sky-400 mt-0.5 font-medium">
                Talent Partner
              </span>
            </div>
            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default RecruiterSidebar;

