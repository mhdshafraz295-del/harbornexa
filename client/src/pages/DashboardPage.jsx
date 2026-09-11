import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardMetrics } from '../services/authService';
import {
  getFishers,
  createFisher,
  updateFisher,
  archiveFisher,
  restoreFisher,
} from '../services/fisherService';
import { createDebt } from '../services/debtService';
import { FisherDetailDrawer } from '../components/fishers/FisherDetailDrawer';
import { FisherModal } from '../components/fishers/FisherModal';
import { AddDebtModal } from '../components/debts/AddDebtModal';
import { ManageHoldModal } from '../components/holds/ManageHoldModal';
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  Coins,
  Search,
  Plus,
  Receipt,
  QrCode,
  Calendar,
  FileSpreadsheet,
  Download,
  AlertCircle,
  RefreshCw,
  Activity,
  ShieldCheck,
  Clock3,
  ChevronRight,
  Ship,
  CreditCard,
} from 'lucide-react';

export const DashboardPage = () => {
  const navigate = useNavigate();

  const [metrics, setMetrics] = useState({
    totalFishers: 0,
    active: 0,
    blocked: 0,
    pending: 0,
    outstandingDebt: '0.00',
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Quick Fisher Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Detail Drawer & Modal State
  const [selectedFisher, setSelectedFisher] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fisherToEdit, setFisherToEdit] = useState(null);

  // Add Debt & Manage Hold Modal State
  const [isAddDebtOpen, setIsAddDebtOpen] = useState(false);
  const [targetFisherForAddDebt, setTargetFisherForAddDebt] = useState(null);

  const [isManageHoldOpen, setIsManageHoldOpen] = useState(false);
  const [selectedFisherForHold, setSelectedFisherForHold] = useState(null);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getDashboardMetrics();
      if (data && data.success) {
        if (data.metrics) setMetrics(data.metrics);
        if (data.recentActivity) setRecentActivity(data.recentActivity);
      }
    } catch (err) {
      setError(err.message || 'Failed to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  // Debounced Quick Fisher Search
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearchLoading(true);
        const data = await getFishers({ search: trimmed, limit: 5 });
        if (data && data.success) {
          setSearchResults(data.items || []);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error('Quick search error:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectSearchResult = (fisher) => {
    setSelectedFisher(fisher);
    setIsDrawerOpen(true);
    setShowDropdown(false);
  };

  const handleOpenAddModal = () => {
    setFisherToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (fisher) => {
    setFisherToEdit(fisher);
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (formData) => {
    if (fisherToEdit) {
      await updateFisher(fisherToEdit.id, formData);
    } else {
      await createFisher(formData);
    }
    fetchMetrics();
  };

  const handleOpenAddDebt = (fisher) => {
    setTargetFisherForAddDebt(fisher);
    setIsAddDebtOpen(true);
  };

  const handleAddDebtSubmit = async (fisherId, formData) => {
    await createDebt(fisherId, formData);
    fetchMetrics();
  };

  const handleOpenManageHold = (fisher) => {
    setSelectedFisherForHold(fisher);
    setIsManageHoldOpen(true);
  };

  const handleHoldUpdated = () => {
    fetchMetrics();
  };

  const handleArchive = async (id) => {
    if (window.confirm('Are you sure you want to archive this fisher record?')) {
      await archiveFisher(id);
      fetchMetrics();
    }
  };

  const handleRestore = async (id) => {
    await restoreFisher(id);
    fetchMetrics();
  };

  const formatTime = (isoString) => {
    if (!isoString) return 'Just now';
    const date = new Date(isoString);
    return (
      date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) +
      ', ' +
      date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    );
  };

  const metricCards = [
    {
      title: 'Total Fishers',
      value: metrics.totalFishers,
      helper: 'Registered fishers',
      icon: Users,
      color: 'text-[#111827]',
      accentBg: 'bg-[#FFF7D6]',
      accentBorder: 'border-[#FFD978]',
      iconColor: 'text-[#F5B942]',
      targetRoute: '/admin/fishers',
    },
    {
      title: 'Active / Cleared',
      value: metrics.active,
      helper: 'Cleared for departure',
      icon: UserCheck,
      color: 'text-emerald-700',
      accentBg: 'bg-emerald-50',
      accentBorder: 'border-emerald-200',
      iconColor: 'text-emerald-600',
      targetRoute: '/admin/fishers?status=ACTIVE',
    },
    {
      title: 'Blocked / Hold',
      value: metrics.blocked,
      helper: 'Clearance restricted',
      icon: UserX,
      color: 'text-red-700',
      accentBg: 'bg-red-50',
      accentBorder: 'border-red-200',
      iconColor: 'text-red-600',
      targetRoute: '/admin/fishers?status=BLOCKED',
    },
    {
      title: 'Pending',
      value: metrics.pending,
      helper: 'Pending verification',
      icon: Clock,
      color: 'text-amber-700',
      accentBg: 'bg-amber-50',
      accentBorder: 'border-amber-200',
      iconColor: 'text-amber-600',
      targetRoute: '/admin/fishers?status=PENDING',
    },
    {
      title: 'Outstanding Debt',
      value: `Rs. ${metrics.outstandingDebt}`,
      helper: 'Unpaid dues',
      icon: Coins,
      color: 'text-[#111827]',
      accentBg: 'bg-[#FFF7D6]',
      accentBorder: 'border-[#FFD978]',
      iconColor: 'text-[#D9A441]',
      targetRoute: null,
    },
  ];

  const filterTabs = [
    { id: 'ALL', label: 'All Fishers', count: metrics.totalFishers, dotColor: 'bg-slate-400', route: '/admin/fishers' },
    { id: 'ACTIVE', label: 'Active', count: metrics.active, dotColor: 'bg-emerald-500', route: '/admin/fishers?status=ACTIVE' },
    { id: 'BLOCKED', label: 'Blocked', count: metrics.blocked, dotColor: 'bg-red-500', route: '/admin/fishers?status=BLOCKED' },
    { id: 'PENDING', label: 'Pending', count: metrics.pending, dotColor: 'bg-amber-500', route: '/admin/fishers?status=PENDING' },
  ];

  const quickActions = [
    { label: 'Add Fisher', icon: Plus, subtitle: 'Register fisher', onClick: handleOpenAddModal, active: true },
    { label: 'Record Payment', icon: Receipt, subtitle: 'Settle debt', onClick: () => navigate('/admin/debt-payments'), active: true },
    { label: 'Check Clearance', icon: Calendar, subtitle: 'Issue clearance', onClick: () => navigate('/admin/clearance'), active: true },
  ];

  const operationalOverview = [
    { title: 'Active Fishers', value: metrics.active, status: 'Cleared', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', route: '/admin/fishers?status=ACTIVE' },
    { title: 'Blocked Fishers', value: metrics.blocked, status: 'Restricted', color: 'text-red-700 bg-red-50 border-red-200', route: '/admin/fishers?status=BLOCKED' },
    { title: 'Pending Clearance', value: metrics.pending, status: 'Awaiting', color: 'text-amber-700 bg-amber-50 border-amber-200', route: '/admin/fishers?status=PENDING' },
    { title: 'Outstanding Debt', value: `Rs. ${metrics.outstandingDebt}`, status: 'Dues', color: 'text-[#111827] bg-[#FFF7D6] border-[#FFD978]', route: null },
  ];

  return (
    <div className="space-y-6 pb-8">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E7EB] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight">
              Dashboard
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-[#FFF7D6] border border-[#FFD978] text-[11px] font-extrabold text-[#111827]">
              Overview
            </span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-[#64748B]">
            Valachchenai Harbor Clearance System
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={fetchMetrics}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-[#FFF7D6] text-[#111827] border border-[#E5E7EB] hover:border-[#FFD978] rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#F5B942] ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-between text-red-800 text-xs sm:text-sm shadow-2xs">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
          <button
            onClick={fetchMetrics}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded-xl font-bold text-xs border border-red-300 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {metricCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              onClick={() => card.targetRoute && navigate(card.targetRoute)}
              className={`bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs relative overflow-hidden transition-all duration-200 flex flex-col justify-between ${
                card.targetRoute ? 'hover:shadow-md hover:border-[#FFD978] cursor-pointer group' : ''
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
                    {card.title}
                  </span>
                  <div className={`p-2 rounded-xl border ${card.accentBg} ${card.accentBorder}`}>
                    <Icon className={`w-4 h-4 ${card.iconColor}`} />
                  </div>
                </div>

                {loading ? (
                  <div className="h-8 w-20 bg-slate-100 rounded animate-pulse my-2" />
                ) : (
                  <h2 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${card.color}`}>
                    {card.value}
                  </h2>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-medium text-[#64748B]">
                <span>{card.helper}</span>
                {card.targetRoute && (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#111827] group-hover:translate-x-0.5 transition-all" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Fisher Search Card */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-2xs space-y-5 relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-[#111827]">
              Fisher Search
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Search by Name, NIC, ID, or Boat No.
            </p>
          </div>
          
          {/* Status Tab Shortcuts */}
          <div className="flex items-center gap-1 p-1 bg-[#F5F6F8] border border-[#E5E7EB] rounded-xl overflow-x-auto">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => navigate(tab.route)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#64748B] hover:text-[#111827] hover:bg-white transition-all whitespace-nowrap cursor-pointer"
              >
                <span className={`w-2 h-2 rounded-full ${tab.dotColor}`} />
                <span>{tab.label}</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white text-slate-700 font-extrabold border border-[#E5E7EB]">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Live Functional Search Input & Dropdown */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
            <Search className="w-5 h-5" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery.trim() && setShowDropdown(true)}
            placeholder="Search by Name, NIC, Phone, ID, or Boat No..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-[#D1D5DB] rounded-xl text-sm text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978] focus:border-[#F5B942]"
          />

          {/* Instant Search Results Dropdown */}
          {showDropdown && (
            <div className="absolute z-20 top-full left-0 right-0 mt-2 bg-white border border-[#E5E7EB] rounded-2xl shadow-xl overflow-hidden divide-y divide-[#E5E7EB] animate-in fade-in zoom-in-95 duration-150">
              {searchLoading ? (
                <div className="p-4 text-xs font-semibold text-slate-500 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#F5B942]" />
                  <span>Searching database...</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-xs font-medium text-slate-500 text-center">
                  No records found for "{searchQuery}".
                </div>
              ) : (
                searchResults.map((fisher) => (
                  <div
                    key={fisher.id}
                    onClick={() => handleSelectSearchResult(fisher)}
                    className="p-3.5 hover:bg-[#FFF7D6]/50 transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-[#F5F6F8] border border-[#E5E7EB] text-[#F5B942]">
                        <Users className="w-4 h-4 text-[#111827]" />
                      </div>
                      <div>
                        <div className="text-xs font-extrabold text-[#111827]">{fisher.full_name}</div>
                        <div className="flex items-center gap-2 text-[10px] text-[#64748B] font-medium mt-0.5">
                          <span className="font-extrabold text-[#111827]">{fisher.fisher_id}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <CreditCard className="w-3 h-3 text-slate-400" />
                            {fisher.nic}
                          </span>
                          {fisher.boat_no && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1 font-bold text-slate-700">
                                <Ship className="w-3 h-3 text-slate-400" />
                                {fisher.boat_no}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      {fisher.status === 'ACTIVE' ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-extrabold">
                          ACTIVE
                        </span>
                      ) : fisher.status === 'BLOCKED' ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-[10px] font-extrabold">
                          BLOCKED
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-extrabold">
                          PENDING
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Informational Banner */}
        <div className="border-2 border-dashed border-[#E5E7EB] rounded-xl p-6 sm:p-8 text-center bg-[#F5F6F8]">
          <div className="w-10 h-10 rounded-full bg-white border border-[#E5E7EB] flex items-center justify-center mx-auto mb-2 text-[#F5B942] shadow-2xs">
            <Users className="w-5 h-5 text-[#111827]" />
          </div>
          <h3 className="text-sm font-extrabold text-[#111827]">
            {metrics.totalFishers > 0
              ? `${metrics.totalFishers} Registered Fishers`
              : 'No fishers registered.'}
          </h3>
          <p className="text-xs text-[#64748B] mt-1 max-w-md mx-auto">
            Use search or navigate to Fishers to manage records.
          </p>
        </div>
      </div>

      {/* Quick Actions Grid */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-2xs">
        <h2 className="text-base font-extrabold text-[#111827] mb-1">Quick Actions</h2>
        <p className="text-xs text-[#64748B] mb-4">System shortcuts</p>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((action, idx) => {
            const Icon = action.icon;
            return (
              <button
                key={idx}
                onClick={action.onClick}
                disabled={!action.active}
                className={`flex flex-col items-start p-4 rounded-2xl border text-[#111827] transition-all text-left group ${
                  action.active
                    ? 'bg-[#F5F6F8] border-[#E5E7EB] hover:bg-[#FFF7D6] hover:border-[#FFD978] cursor-pointer'
                    : 'bg-[#F5F6F8] border-[#E5E7EB] opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="p-2 rounded-xl bg-white border border-[#E5E7EB] text-[#F5B942] mb-3 group-hover:bg-[#FFF7D6]">
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-extrabold text-[#111827]">{action.label}</span>
                <span className="text-[10px] font-medium text-[#64748B] mt-0.5">{action.subtitle}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Operational Overview & Recent Activity Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Operational Overview Card */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#F5B942]" />
              <h2 className="text-base font-extrabold text-[#111827]">Operational Overview</h2>
            </div>
            <span className="text-xs font-semibold text-[#64748B]">Real-time</span>
          </div>

          <div className="space-y-3">
            {operationalOverview.map((item, idx) => (
              <div
                key={idx}
                onClick={() => item.route && navigate(item.route)}
                className={`flex items-center justify-between p-3.5 rounded-xl bg-[#F5F6F8] border border-[#E5E7EB] ${
                  item.route ? 'hover:border-[#FFD978] hover:bg-[#FFF7D6]/40 cursor-pointer transition-all' : ''
                }`}
              >
                <span className="text-xs font-bold text-[#111827]">{item.title}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-extrabold text-[#111827]">{item.value}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold border ${item.color}`}>
                    {item.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity Card */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
            <div className="flex items-center gap-2">
              <Clock3 className="w-5 h-5 text-[#F5B942]" />
              <h2 className="text-base font-extrabold text-[#111827]">Recent Activity</h2>
            </div>
            <span className="text-xs font-semibold text-[#64748B]">Audit Logs</span>
          </div>

          {recentActivity.length > 0 ? (
            <div className="space-y-3">
              {recentActivity.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between p-3 rounded-xl bg-[#F5F6F8] border border-[#E5E7EB]"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 rounded-lg bg-[#FFF7D6] text-[#F5B942] mt-0.5">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-extrabold text-[#111827]">
                        {log.action.replace(/_/g, ' ')}
                      </p>
                      <p className="text-[10px] font-medium text-[#64748B]">
                        {log.admin_email || 'System Admin'} • IP: {log.ip_address || '127.0.0.1'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400">
                    {formatTime(log.created_at)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 rounded-xl border border-dashed border-[#E5E7EB] text-center bg-[#F5F6F8]">
              <p className="text-xs font-bold text-[#64748B]">No recent activity.</p>
            </div>
          )}
        </div>

      </div>

      {/* Detail Drawer */}
      <FisherDetailDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        fisher={selectedFisher}
        onEdit={handleOpenEditModal}
        onArchive={handleArchive}
        onRestore={handleRestore}
        onAddDebt={handleOpenAddDebt}
        onManageHold={handleOpenManageHold}
      />

      {/* Add / Edit Modal */}
      <FisherModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleModalSubmit}
        fisher={fisherToEdit}
      />

      {/* Add Debt Modal */}
      <AddDebtModal
        isOpen={isAddDebtOpen}
        onClose={() => {
          setIsAddDebtOpen(false);
          setTargetFisherForAddDebt(null);
        }}
        onSubmit={handleAddDebtSubmit}
        targetFisher={targetFisherForAddDebt}
      />

      {/* Manage Hold Modal */}
      <ManageHoldModal
        isOpen={isManageHoldOpen}
        onClose={() => {
          setIsManageHoldOpen(false);
          setSelectedFisherForHold(null);
        }}
        fisher={selectedFisherForHold}
        onHoldUpdated={handleHoldUpdated}
      />

    </div>
  );
};
