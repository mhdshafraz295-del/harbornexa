import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  CheckCircle2,
  Ban,
  FileSpreadsheet,
  Settings,
  LogOut,
  Menu,
  X,
  Anchor,
  Calendar,
  ChevronDown,
  User,
  Shield,
  QrCode,
  FileCheck,
  HelpCircle,
  CalendarClock,
} from 'lucide-react';

export const AdminLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const { admin, logoutUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef(null);

  // Close mobile drawer and dropdown menu on route change
  useEffect(() => {
    setIsSidebarOpen(false);
    setIsUserMenuOpen(false);
  }, [location.pathname]);

  // Handle click outside user dropdown menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle Escape key to close mobile drawer or user menu
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsSidebarOpen(false);
        setIsUserMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = async () => {
    await logoutUser();
    navigate('/login', { replace: true });
  };

  const navItems = [
    { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Fishers', path: '/admin/fishers', icon: Users },
    { name: 'QR Scanner', path: '/admin/qr-scanner', icon: QrCode },
    { name: 'Debt & Payments', path: '/admin/debt-payments', icon: CreditCard },
    { name: 'Installment Mgmt', path: '/admin/installments', icon: CalendarClock },
    { name: 'Clearance', path: '/admin/clearance', icon: CheckCircle2 },
    { name: 'Departure PDF Checker', path: '/admin/departure-pdf-checker', icon: FileCheck },
    { name: 'Block History', path: '/admin/block-history', icon: Ban },
    { name: 'Import / Export', path: '/admin/import-export', icon: FileSpreadsheet },
    { name: 'How to Use', path: '/admin/how-to-use', icon: HelpCircle },
    { name: 'Settings', path: '/admin/settings', icon: Settings },
  ];

  // Current formatted date string
  const currentDate = new Date().toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-[#111827] flex flex-col lg:flex-row font-sans">
      
      {/* Mobile Backdrop Overlay */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden transition-opacity duration-300"
          aria-hidden="true"
        />
      )}

      {/* Pure White Admin Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-[#E5E7EB] transform transition-transform duration-300 ease-in-out flex flex-col lg:translate-x-0 lg:static lg:z-auto ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Header & Clean Logo (Strict Rule: Zero border/box/plate/glow/shadow on logo) */}
        <div className="h-16 px-6 flex items-center justify-between border-b border-[#E5E7EB] shrink-0">
          <div className="flex items-center gap-3">
            <img
              src="/assets/images/logo.png"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/assests/images/logo.png';
              }}
              alt="Valachchenai Harbor Logo"
              className="w-8 h-8 object-contain"
            />
            <div>
              <h2 className="text-sm font-extrabold text-[#111827] tracking-wide leading-tight">
                Valachchenai
              </h2>
              <p className="text-[10px] font-bold text-[#D9A441] tracking-wider uppercase">
                Harbor Clearance
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-[#111827] hover:bg-slate-100 focus:outline-none transition-colors"
            aria-label="Close sidebar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-4 py-5 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 group border ${
                    isActive
                      ? 'bg-[#FFF7D6] text-[#111827] border-[#FFD978] shadow-2xs'
                      : 'text-[#374151] border-transparent hover:text-[#111827] hover:bg-[#FFFDF3]'
                  }`
                }
              >
                {({ isActive }) => (
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`w-4.5 h-4.5 shrink-0 ${
                        isActive ? 'text-[#111827]' : 'text-slate-400 group-hover:text-[#F5B942]'
                      }`}
                    />
                    <span>{item.name}</span>
                  </div>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Sidebar Footer User Info */}
        <div className="p-4 border-t border-[#E5E7EB] bg-[#F5F6F8]/60 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#FFD978] border border-[#F5B942] flex items-center justify-center text-[#111827] font-extrabold text-xs shrink-0 shadow-2xs">
                {admin?.name ? admin.name.charAt(0).toUpperCase() : 'A'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-[#111827] truncate">{admin?.name || 'Administrator'}</p>
                <p className="text-[10px] text-[#64748B] truncate">{admin?.email || 'admin@harbor.gov.lk'}</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors focus:outline-none cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Viewport */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        
        {/* Pure White Topbar */}
        <header className="h-16 bg-white border-b border-[#E5E7EB] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-[#111827] hover:bg-slate-100 focus:outline-none transition-colors"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="hidden sm:flex items-center justify-center p-1.5 rounded-lg bg-[#FFF7D6]">
                <Anchor className="w-4 h-4 text-[#F5B942]" />
              </div>
              <div>
                <h1 className="text-xs sm:text-sm font-extrabold text-[#111827] tracking-tight truncate">
                  Valachchenai Harbor
                </h1>
                <p className="text-[10px] font-medium text-[#64748B] hidden md:block">
                  Fisher Clearance Management System
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Current Date Badge */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F5F6F8] border border-[#E5E7EB] text-xs font-semibold text-[#64748B]">
              <Calendar className="w-3.5 h-3.5 text-[#F5B942]" />
              <span>{currentDate}</span>
            </div>

            {/* Live System Badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live System</span>
            </div>

            {/* Admin Profile Dropdown Trigger */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-xl hover:bg-slate-100 border border-transparent hover:border-[#E5E7EB] transition-all cursor-pointer focus:outline-none"
              >
                <div className="w-7 h-7 rounded-full bg-[#FFD978] border border-[#F5B942] flex items-center justify-center text-[#111827] font-extrabold text-xs">
                  {admin?.name ? admin.name.charAt(0).toUpperCase() : 'A'}
                </div>
                <span className="hidden sm:inline text-xs font-bold text-[#111827]">
                  {admin?.name ? admin.name.split(' ')[0] : 'Admin'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {/* Dropdown Menu */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-[#E5E7EB] rounded-2xl shadow-xl py-2 z-50 animate-fadeIn">
                  <div className="px-4 py-2.5 border-b border-[#E5E7EB] bg-[#F5F6F8]/50">
                    <p className="text-xs font-bold text-[#111827] truncate">{admin?.name || 'Administrator'}</p>
                    <p className="text-[10px] font-medium text-[#64748B] truncate">{admin?.email || 'admin@harbor.gov.lk'}</p>
                    <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FFF7D6] text-[10px] font-extrabold text-[#111827]">
                      <Shield className="w-3 h-3 text-[#F5B942]" />
                      <span>{admin?.role || 'ADMIN'}</span>
                    </div>
                  </div>

                  <div className="p-1">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Soft Gray Canvas Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 bg-[#F5F6F8] overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

    </div>
  );
};
