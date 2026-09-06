import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getDebts,
  createDebt,
  updateDebt,
  cancelDebt,
  recordPayment,
  reversePayment,
} from '../services/debtService';
import { AddDebtModal } from '../components/debts/AddDebtModal';
import { RecordPaymentModal } from '../components/debts/RecordPaymentModal';
import { ManageHoldModal } from '../components/holds/ManageHoldModal';
import { FisherDetailDrawer } from '../components/fishers/FisherDetailDrawer';
import {
  Coins,
  Receipt,
  CheckCircle2,
  Calendar,
  Search,
  Plus,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Ship,
  Eye,
  Lock,
  Ban,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

export const DebtPaymentsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [debts, setDebts] = useState([]);
  const [metrics, setMetrics] = useState({
    totalOutstanding: '0.00',
    fishersWithDebt: 0,
    fullyPaidFishers: 0,
    paymentsToday: '0.00',
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('search') || '');
  const [activeTab, setActiveTab] = useState(searchParams.get('status') || 'ALL');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1', 10));
  const [limit, setLimit] = useState(parseInt(searchParams.get('limit') || '10', 10));

  // Modal & Drawer State
  const [isAddDebtOpen, setIsAddDebtOpen] = useState(false);
  const [targetFisherForAddDebt, setTargetFisherForAddDebt] = useState(null);

  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [selectedDebtForPayment, setSelectedDebtForPayment] = useState(null);

  const [isManageHoldOpen, setIsManageHoldOpen] = useState(false);
  const [selectedFisherForHold, setSelectedFisherForHold] = useState(null);

  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [selectedFisherForDetail, setSelectedFisherForDetail] = useState(null);

  // Debounce search (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch Debts & Metrics
  const loadDebtsData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const params = {
        search: debouncedSearch,
        statusFilter: activeTab,
        page,
        limit,
      };

      const data = await getDebts(params);
      if (data && data.success) {
        setDebts(data.items || []);
        if (data.metrics) setMetrics(data.metrics);
        if (data.pagination) setPagination(data.pagination);
      }
    } catch (err) {
      setError(err.message || 'Failed to load debt and payment records.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, activeTab, page, limit]);

  useEffect(() => {
    loadDebtsData();
  }, [loadDebtsData]);

  // Sync URL search params
  useEffect(() => {
    const params = {};
    if (debouncedSearch) params.search = debouncedSearch;
    if (activeTab !== 'ALL') params.status = activeTab;
    if (page > 1) params.page = page.toString();
    if (limit !== 10) params.limit = limit.toString();
    setSearchParams(params, { replace: true });
  }, [debouncedSearch, activeTab, page, limit, setSearchParams]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setPage(1);
  };

  // Add Debt Handler
  const handleOpenAddDebt = (fisher = null) => {
    setTargetFisherForAddDebt(fisher);
    setIsAddDebtOpen(true);
  };

  const handleAddDebtSubmit = async (fisherId, formData) => {
    await createDebt(fisherId, formData);
    loadDebtsData();
  };

  // Record Payment Handler
  const handleOpenRecordPayment = (debtItem) => {
    setSelectedDebtForPayment(debtItem);
    setIsRecordPaymentOpen(true);
  };

  const handleRecordPaymentSubmit = async (debtId, formData) => {
    await recordPayment(debtId, formData);
    loadDebtsData();
  };

  // Manage Hold Handler
  const handleOpenManageHold = (fisherItem) => {
    setSelectedFisherForHold(fisherItem);
    setIsManageHoldOpen(true);
  };

  // Cancel Debt Handler
  const handleCancelDebt = async (debtId) => {
    const reason = window.prompt('Please enter cancellation reason for this debt:');
    if (reason && reason.trim()) {
      try {
        await cancelDebt(debtId, reason.trim());
        loadDebtsData();
      } catch (err) {
        alert(err.message || 'Failed to cancel debt.');
      }
    }
  };

  const handleViewFisherDetail = (fisherItem) => {
    setSelectedFisherForDetail(fisherItem);
    setIsDetailDrawerOpen(true);
  };

  const filterTabs = [
    { id: 'ALL', label: 'All Records' },
    { id: 'OUTSTANDING', label: 'மீதிக் கடன்' },
    { id: 'FULLY_PAID', label: 'Fully Paid' },
    { id: 'DEBT_HOLD', label: 'Debt Hold' },
    { id: 'CANCELLED', label: 'Cancelled' },
  ];

  const topMetricCards = [
    {
      title: 'Total Outstanding',
      value: `Rs. ${metrics.totalOutstanding}`,
      helper: 'Unpaid harbor dues & charges',
      icon: Coins,
      color: 'text-red-700',
      accentBg: 'bg-red-50',
      accentBorder: 'border-red-200',
      iconColor: 'text-red-600',
    },
    {
      title: 'Fishers With Debt',
      value: metrics.fishersWithDebt,
      helper: 'Fishers on automatic debt hold',
      icon: ShieldAlert,
      color: 'text-[#111827]',
      accentBg: 'bg-[#FFF7D6]',
      accentBorder: 'border-[#FFD978]',
      iconColor: 'text-[#F5B942]',
    },
    {
      title: 'Fully Paid',
      value: metrics.fullyPaidFishers,
      helper: 'Fishers with zero balance',
      icon: CheckCircle2,
      color: 'text-emerald-700',
      accentBg: 'bg-emerald-50',
      accentBorder: 'border-emerald-200',
      iconColor: 'text-emerald-600',
    },
    {
      title: 'Payments Today',
      value: `Rs. ${metrics.paymentsToday}`,
      helper: 'Received today (Asia/Colombo)',
      icon: Calendar,
      color: 'text-[#111827]',
      accentBg: 'bg-[#FFF7D6]',
      accentBorder: 'border-[#FFD978]',
      iconColor: 'text-[#D9A441]',
    },
  ];

  return (
    <div className="space-y-6 pb-8">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E7EB] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight">
              Debt & Payments
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-[#FFF7D6] border border-[#FFD978] text-[11px] font-extrabold text-[#111827]">
              Financial Ledger
            </span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-[#64748B]">
            Manage harbor debts, payments, and clearance holds.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadDebtsData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-[#FFF7D6] text-[#111827] border border-[#E5E7EB] hover:border-[#FFD978] rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#F5B942] ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={() => handleOpenAddDebt(null)}
            className="flex items-center gap-2 px-4 py-2 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] rounded-xl text-xs font-extrabold transition-all shadow-2xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Debt</span>
          </button>
        </div>
      </div>

      {/* Error Message Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-between text-red-800 text-xs sm:text-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
          <button
            onClick={loadDebtsData}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded-xl font-bold text-xs border border-red-300 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {topMetricCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs flex flex-col justify-between"
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
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Search & Status Filters Card */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Search Bar Input */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search debt by Fisher Name, NIC, Fisher ID, Phone or Boat No..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#D1D5DB] rounded-xl text-sm text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-[#111827] text-xs font-bold cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1 p-1 bg-[#F5F6F8] border border-[#E5E7EB] rounded-xl overflow-x-auto">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-[#FFF7D6] text-[#111827] border border-[#FFD978] shadow-2xs'
                    : 'text-[#64748B] hover:text-[#111827] hover:bg-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* Main Financial Table Container */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-2xs overflow-hidden">
        
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : debts.length === 0 ? (
          <div className="p-12 text-center bg-[#F5F6F8]">
            <div className="w-12 h-12 rounded-full bg-white border border-[#E5E7EB] flex items-center justify-center mx-auto mb-3 text-slate-400 shadow-2xs">
              <Coins className="w-6 h-6" />
            </div>
            {debouncedSearch || activeTab !== 'ALL' ? (
              <>
                <h3 className="text-sm font-extrabold text-[#111827]">No debt records match your search.</h3>
                <p className="text-xs text-[#64748B] mt-1">Try resetting your search query or status filter.</p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setActiveTab('ALL');
                  }}
                  className="mt-4 px-4 py-2 bg-white border border-[#E5E7EB] hover:bg-[#FFF7D6] rounded-xl text-xs font-bold text-[#111827] transition-all cursor-pointer"
                >
                  Reset Filters
                </button>
              </>
            ) : (
              <>
                <h3 className="text-sm font-extrabold text-[#111827]">No debt records created yet.</h3>
                <p className="text-xs text-[#64748B] mt-1 max-w-sm mx-auto">
                  Click the "+ Add Debt" button above to issue a new debt record.
                </p>
                <button
                  onClick={() => handleOpenAddDebt(null)}
                  className="mt-4 px-4 py-2 bg-[#FFD978] hover:bg-[#F5B942] rounded-xl text-xs font-extrabold text-[#111827] cursor-pointer"
                >
                  + Add Debt
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Financial Table (>= 768px) with sticky header and internal scroll */}
            <div className="hidden md:block max-h-[60vh] overflow-y-auto relative">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#F5F6F8] z-10 border-b border-[#E5E7EB] shadow-2xs">
                  <tr className="text-[11px] font-extrabold text-[#64748B] uppercase tracking-wider">
                    <th className="py-2.5 px-3.5">Fisher</th>
                    <th className="py-2.5 px-3.5">Category</th>
                    <th className="py-2.5 px-3.5 text-right">Original</th>
                    <th className="py-2.5 px-3.5 text-right">Paid</th>
                    <th className="py-2.5 px-3.5 text-right">Outstanding</th>
                    <th className="py-2.5 px-3.5">Status</th>
                    <th className="py-2.5 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB] text-xs">
                  {debts.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-[#FFF7D6]/40 transition-colors group cursor-pointer"
                      onClick={() => handleViewFisherDetail({ id: item.fisher_id, full_name: item.full_name, fisher_id: item.custom_fisher_id })}
                    >
                      {/* Fisher Name & Custom ID */}
                      <td className="py-2.5 px-3.5">
                        <div className="font-extrabold text-[#111827]">{item.full_name}</div>
                        <div className="flex items-center gap-2 text-[10px] text-[#64748B] font-semibold mt-0.5">
                          <span>{item.custom_fisher_id}</span>
                          {item.boat_no && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1 font-bold text-slate-700">
                                <Ship className="w-3 h-3 text-slate-400" />
                                {item.boat_no}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Category & Date */}
                      <td className="py-2.5 px-3.5">
                        <div className="font-extrabold text-[#111827]">{item.category}</div>
                        <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                          {item.debt_date ? new Date(item.debt_date).toLocaleDateString('en-GB') : ''}
                        </div>
                      </td>

                      {/* Original Amount */}
                      <td className="py-2.5 px-3.5 text-right font-bold text-[#111827]">
                        Rs. {item.original_amount}
                      </td>

                      {/* Paid Amount */}
                      <td className="py-2.5 px-3.5 text-right font-bold text-emerald-700">
                        Rs. {item.total_paid}
                      </td>

                      {/* Outstanding Amount */}
                      <td className="py-2.5 px-3.5 text-right font-extrabold text-red-700">
                        Rs. {item.outstanding_amount}
                      </td>

                      {/* Debt Status Badge */}
                      <td className="py-2.5 px-3.5">
                        {item.status === 'PAID' ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-extrabold">
                            PAID
                          </span>
                        ) : item.status === 'PARTIALLY_PAID' ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-extrabold">
                            PARTIAL
                          </span>
                        ) : item.status === 'CANCELLED' ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-slate-600 text-[10px] font-extrabold">
                            CANCELLED
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-[10px] font-extrabold">
                            OPEN
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {item.status !== 'PAID' && item.status !== 'CANCELLED' && (
                            <button
                              onClick={() => handleOpenRecordPayment(item)}
                              title="Record Payment"
                              className="px-2.5 py-1 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] rounded-lg text-[11px] font-extrabold transition-all cursor-pointer"
                            >
                              Pay
                            </button>
                          )}

                          <button
                            onClick={() => handleOpenManageHold({ id: item.fisher_id, full_name: item.full_name, fisher_id: item.custom_fisher_id })}
                            title="Manage Manual Hold"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            <Lock className="w-4 h-4" />
                          </button>

                          {item.status !== 'CANCELLED' && parseFloat(item.total_paid) === 0 && (
                            <button
                              onClick={() => handleCancelDebt(item.id)}
                              title="Cancel Debt"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View (< 768px - Responsive with controlled internal max-height) */}
            <div className="block md:hidden max-h-[60vh] overflow-y-auto divide-y divide-[#E5E7EB]">
              {debts.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleViewFisherDetail({ id: item.fisher_id, full_name: item.full_name, fisher_id: item.custom_fisher_id })}
                  className="p-4 hover:bg-[#FFF7D6]/30 transition-colors space-y-3 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-extrabold text-[#111827] line-clamp-1">
                        {item.full_name}
                      </h3>
                      <div className="flex items-center gap-2 text-[10px] text-[#64748B] font-semibold mt-0.5">
                        <span>{item.custom_fisher_id}</span>
                        {item.boat_no && <span>• Boat: {item.boat_no}</span>}
                      </div>
                    </div>

                    {item.status === 'PAID' ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-extrabold border border-emerald-200">
                        PAID
                      </span>
                    ) : item.status === 'PARTIALLY_PAID' ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-extrabold border border-amber-200">
                        PARTIAL
                      </span>
                    ) : item.status === 'CANCELLED' ? (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-extrabold border border-slate-300">
                        CANCELLED
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[10px] font-extrabold border border-red-200">
                        OPEN
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 p-2.5 bg-[#F5F6F8] rounded-xl text-center text-xs">
                    <div>
                      <div className="text-[10px] text-slate-500 font-semibold">Original</div>
                      <div className="font-bold text-[#111827]">Rs. {item.original_amount}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-semibold">Paid</div>
                      <div className="font-bold text-emerald-700">Rs. {item.total_paid}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-semibold">Outstanding</div>
                      <div className="font-extrabold text-red-700">Rs. {item.outstanding_amount}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 text-xs" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10px] text-slate-400 font-medium">
                      Category: {item.category}
                    </span>

                    <div className="flex items-center gap-2">
                      {item.status !== 'PAID' && item.status !== 'CANCELLED' && (
                        <button
                          onClick={() => handleOpenRecordPayment(item)}
                          className="px-3 py-1 bg-[#FFD978] rounded-lg text-xs font-extrabold text-[#111827]"
                        >
                          Pay
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenManageHold({ id: item.fisher_id, full_name: item.full_name, fisher_id: item.custom_fisher_id })}
                        className="p-1.5 bg-white border border-[#E5E7EB] rounded-lg text-slate-700"
                      >
                        <Lock className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-[#E5E7EB] bg-[#F5F6F8] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-medium text-[#64748B]">
              <div className="flex items-center gap-2">
                <span>
                  Showing {pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} records
                </span>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(parseInt(e.target.value, 10));
                    setPage(1);
                  }}
                  className="ml-2 px-2 py-1 bg-white border border-[#E5E7EB] rounded-lg text-xs font-extrabold text-[#111827] focus:outline-none cursor-pointer"
                >
                  <option value={10}>10 per page</option>
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1}
                  className="p-1.5 rounded-lg bg-white border border-[#E5E7EB] disabled:opacity-40 text-[#111827] hover:bg-[#FFF7D6] cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="px-3 py-1 font-bold text-[#111827]">
                  Page {pagination.page} of {pagination.totalPages || 1}
                </span>

                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="p-1.5 rounded-lg bg-white border border-[#E5E7EB] disabled:opacity-40 text-[#111827] hover:bg-[#FFF7D6] cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}

      </div>

      {/* Add Debt Modal */}
      <AddDebtModal
        isOpen={isAddDebtOpen}
        onClose={() => setIsAddDebtOpen(false)}
        onSubmit={handleAddDebtSubmit}
        targetFisher={targetFisherForAddDebt}
      />

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={isRecordPaymentOpen}
        onClose={() => setIsRecordPaymentOpen(false)}
        onSubmit={handleRecordPaymentSubmit}
        debt={selectedDebtForPayment}
      />

      {/* Manage Hold Modal */}
      <ManageHoldModal
        isOpen={isManageHoldOpen}
        onClose={() => setIsManageHoldOpen(false)}
        fisher={selectedFisherForHold}
        onHoldUpdated={loadDebtsData}
      />

      {/* Fisher Detail Drawer */}
      <FisherDetailDrawer
        isOpen={isDetailDrawerOpen}
        onClose={() => setIsDetailDrawerOpen(false)}
        fisher={selectedFisherForDetail}
        onEdit={() => {}}
        onArchive={() => {}}
        onRestore={() => {}}
        onAddDebt={handleOpenAddDebt}
        onManageHold={handleOpenManageHold}
      />

    </div>
  );
};

export default DebtPaymentsPage;
