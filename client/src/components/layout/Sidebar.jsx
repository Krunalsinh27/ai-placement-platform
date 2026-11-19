import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isAdminDrivesActive, isStudentApplicationsActive } from '../../utils/navigationHelper';
import api from '../../services/api';
import { countOpenNowTests } from '../../utils/testWindowHelper';
import {
  LayoutDashboard,
  Building2,
  Briefcase,
  Users,
  FileCheck2,
  Award,
  BarChart3,
  UserCheck,
  X,
  GraduationCap,
  CalendarCheck,
  Mail,
  FileSpreadsheet,
  Sparkles,
  FileText,
  Bot,
} from 'lucide-react';

const Sidebar = ({ isOpen, onClose }) => {
  const { user, isAdmin } = useAuth();
  const location = useLocation();
  const [openTestsCount, setOpenTestsCount] = useState(0);

  // Poll for open platform tests count every 60s while tab is visible
  useEffect(() => {
    if (isAdmin || user?.role !== 'student') return;

    let isMounted = true;

    const fetchOpenTests = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const fetchTime = Date.now();
        const res = await api.get('/students/my-tests');
        if (isMounted && res.data?.success && Array.isArray(res.data.tests)) {
          const count = countOpenNowTests(res.data.tests, {
            serverNow: res.data.serverNow,
            receivedAt: fetchTime,
          });
          setOpenTestsCount(count);
        }
      } catch {
        // Silently catch polling errors
      }
    };

    fetchOpenTests();

    const intervalId = setInterval(fetchOpenTests, 60000);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        fetchOpenTests();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [isAdmin, user]);

  const isLinkActive = (path, defaultActive) => {
    if (path === '/admin/drives') {
      return isAdminDrivesActive(location.pathname);
    }
    if (path === '/student/applications') {
      return isStudentApplicationsActive(location.pathname);
    }
    if (path === '/student/tests') {
      return location.pathname.startsWith('/student/tests');
    }
    return defaultActive;
  };

  const adminLinks = [
    { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Drives', path: '/admin/drives', icon: Briefcase },
    { name: 'Drive Requests', path: '/admin/drive-requests', icon: CalendarCheck },
    { name: 'Companies', path: '/admin/companies', icon: Building2 },
    { name: 'Students', path: '/admin/students', icon: Users },
    { name: 'Applications', path: '/admin/applications', icon: FileCheck2 },
    { name: 'Placements', path: '/admin/placements', icon: Award },
    { name: 'Placement Report', path: '/admin/reports', icon: FileSpreadsheet },
    { name: 'Analytics', path: '/admin/analytics', icon: BarChart3 },
    { name: 'Ask AI', path: '/admin/assistant', icon: Sparkles },
    { name: 'Email Logs', path: '/admin/email-logs', icon: Mail },
  ];

  const studentLinks = [
    { name: 'Dashboard', path: '/student/dashboard', icon: LayoutDashboard },
    { name: 'Eligible Drives', path: '/student/drives', icon: Briefcase },
    { name: 'My Applications', path: '/student/applications', icon: FileCheck2 },
    { name: 'My Tests', path: '/student/tests', icon: FileText, badge: openTestsCount },
    { name: 'Mock Interview', path: '/student/mock-interview', icon: Bot },
    { name: 'Ask AI', path: '/student/assistant', icon: Sparkles },
    { name: 'Resume AI', path: '/student/resume-ai', icon: Sparkles },
    { name: 'Resume Builder', path: '/student/resume-builder', icon: FileText },
    { name: 'My Placements', path: '/student/placements', icon: Award },
    { name: 'My Profile', path: '/student/profile', icon: UserCheck },
  ];

  const links = isAdmin ? adminLinks : studentLinks;

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-slate-900 text-slate-100 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-white block leading-tight">
                PlacementPortal
              </span>
              <span className="text-[10px] tracking-wider uppercase text-slate-400 font-semibold">
                {isAdmin ? 'TPO Admin' : 'Student Hub'}
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
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.path}
                to={link.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isLinkActive(link.path, isActive)
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{link.name}</span>
                </div>
                {link.badge > 0 && (
                  <span
                    data-testid="sidebar-open-tests-badge"
                    className="px-2 py-0.5 text-[10px] font-black rounded-full bg-emerald-500 text-white shadow-xs shrink-0"
                  >
                    {link.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User Card at bottom of sidebar */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-800/60">
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 font-bold flex items-center justify-center text-xs">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
              <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;

