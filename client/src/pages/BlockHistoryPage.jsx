import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getBlockHistory, releaseHold, blockFisherByNic, blockFisherByBoat } from '../services/holdService';
import { FisherDetailDrawer } from '../components/fishers/FisherDetailDrawer';
import {
  Ban,
  ShieldAlert,
  ShieldCheck,
  Search,
  RefreshCw,
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Ship,
  Lock,
  RotateCcw,
  Coins,
  FileText,
  User,
  X,
  Plus,
} from 'lucide-react';

export const BlockHistoryPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [metrics, setMetrics] = useState({
    activeManualCount: 0,
    historyCount: 0,
    debtCount: 0,
    adminBlockCount: 0,
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('search') || '');
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'ACTIVE');
  const [fromDate, setFromDate] = useState(searchParams.get('fromDate') || '');
  const [toDate, setToDate] = useState(searchParams.get('toDate') || '');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1', 10));
  const [limit, setLimit] = useState(parseInt(searchParams.get('limit') || '10', 10));

  // Release Hold Modal State
  const [releaseModalHold, setReleaseModalHold] = useState(null);
  const [releaseNotesInput, setReleaseNotesInput] = useState('');
  const [releasing, setReleasing] = useState(false);

  // Fisher Detail Drawer State
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [selectedFisherForDetail, setSelectedFisherForDetail] = useState(null);

  // NIC Block Modal State
  const [nicBlockModalOpen, setNicBlockModalOpen] = useState(false);
  const [nicInput, setNicInput] = useState('');
  const [nicNotes, setNicNotes] = useState('');
  const [nicBlocking, setNicBlocking] = useState(false);
  const [nicBlockResult, setNicBlockResult] = useState(null);
  const [nicBlockError, setNicBlockError] = useState('');

  // Boat Block Modal State
  const [boatBlockModalOpen, setBoatBlockModalOpen] = useState(false);
  const [boatInput, setBoatInput] = useState('');
  const [boatNotes, setBoatNotes] = useState('');
  const [boatBlocking, setBoatBlocking] = useState(false);
  const [boatBlockResult, setBoatBlockResult] = useState(null);
  const [boatBlockError, setBoatBlockError] = useState('');

  // Debounce search (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch Block History Data
  const loadBlockHistoryData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const params = {
        tab: activeTab,
        search: debouncedSearch,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page,
        limit,
      };

      const data = await getBlockHistory(params);
      if (data && data.success) {
        setItems(data.items || []);
        if (data.metrics) setMetrics(data.metrics);
        if (data.pagination) setPagination(data.pagination);
      }
    } catch (err) {
      setError(err.message || 'Failed to load block history records.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, debouncedSearch, fromDate, toDate, page, limit]);

  useEffect(() => {
    loadBlockHistoryData();
  }, [loadBlockHistoryData]);

  // Sync URL search params
  useEffect(() => {
    const params = {};
    if (activeTab !== 'ACTIVE') params.tab = activeTab;
    if (debouncedSearch) params.search = debouncedSearch;
    if (fromDate) params.fromDate = fromDate;
    if (toDate) params.toDate = toDate;
    if (page > 1) params.page = page.toString();
    if (limit !== 10) params.limit = limit.toString();
    setSearchParams(params, { replace: true });
  }, [activeTab, debouncedSearch, fromDate, toDate, page, limit, setSearchParams]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setPage(1);
  };

  const handleOpenReleaseModal = (holdItem) => {
    setReleaseModalHold(holdItem);
    setReleaseNotesInput('');
  };

  const handleConfirmReleaseSubmit = async (e) => {
    e.preventDefault();
    if (!releaseModalHold?.id || !releaseNotesInput.trim()) {
      alert('Please enter release notes.');
      return;
    }
    try {
      setReleasing(true);
      await releaseHold(releaseModalHold.id, releaseNotesInput.trim());
      setReleaseModalHold(null);
      setReleaseNotesInput('');
      loadBlockHistoryData();
    } catch (err) {
      alert(err.message || 'Failed to release manual hold.');
    } finally {
      setReleasing(false);
    }
  };

  const handleViewFisherDetail = (fisherId, fullName, customFisherId) => {
    setSelectedFisherForDetail({ id: fisherId, full_name: fullName, fisher_id: customFisherId });
    setIsDetailDrawerOpen(true);
  };

  const handleOpenNicBlockModal = () => {
    setNicInput('');
    setNicNotes('');
    setNicBlockResult(null);
    setNicBlockError('');
    setNicBlockModalOpen(true);
  };

  const handleNicBlockSubmit = async (e) => {
    e.preventDefault();
    if (!nicInput.trim()) {
      setNicBlockError('NIC number enter செய்யவும்.');
      return;
    }
    try {
      setNicBlocking(true);
      setNicBlockError('');
      setNicBlockResult(null);
      const data = await blockFisherByNic(nicInput.trim(), nicNotes.trim() || undefined);
      setNicBlockResult(data);
      loadBlockHistoryData();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Block செய்வதில் பிரச்சனை வந்தது.';
      setNicBlockError(msg);
    } finally {
      setNicBlocking(false);
    }
  };

  const handleOpenBoatBlockModal = () => {
    setBoatInput('');
    setBoatNotes('');
    setBoatBlockResult(null);
    setBoatBlockError('');
    setBoatBlockModalOpen(true);
  };

  const handleBoatBlockSubmit = async (e) => {
    e.preventDefault();
    if (!boatInput.trim()) {
      setBoatBlockError('Boat number enter செய்யவும்.');
      return;
    }
    try {
      setBoatBlocking(true);
      setBoatBlockError('');
      setBoatBlockResult(null);
      const data = await blockFisherByBoat(boatInput.trim(), boatNotes.trim() || undefined);
      setBoatBlockResult(data);
      loadBlockHistoryData();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Block செய்வதில் பிரச்சனை வந்தது.';
      setBoatBlockError(msg);
    } finally {
      setBoatBlocking(false);
    }
  };

  const filterTabs = [
    { id: 'ACTIVE', label: 'Active Holds', count: metrics.activeManualCount },
    { id: 'HISTORY', label: 'Hold History', count: metrics.historyCount },
    { id: 'DEBT', label: 'Debt Holds', count: metrics.debtCount },
    { id: 'ADMIN_BLOCK', label: 'Admin Blocks', count: metrics.adminBlockCount },
    { id: 'ALL', label: 'All', count: null },
  ];

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatReasonCode = (code, text) => {
    if (code === 'OTHER' && text) return text;
    if (code === 'PAYMENT_ISSUE') return 'Payment Issue';
    if (code === 'DOCUMENT_ISSUE') return 'Document Issue';
    if (code === 'MANAGEMENT_DECISION') return 'Management Decision';
    if (code === 'DEBT_HOLD') return text || 'Automatic Debt Hold';
    if (code === 'ADMIN_BLOCK') return text || 'Manual Block – reason not recorded';
    return code || 'Manual Hold';
  };

  return (
    <div className="space-[#E5E7EB] space-y-6 pb-8">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E7EB] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight">
              Block History & Holds
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-[11px] font-extrabold text-red-700">
              Restriction Audit
            </span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-[#64748B]">
            Audit manual holds, release history, debt holds, and admin blocks.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadBlockHistoryData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-[#FFF7D6] text-[#111827] border border-[#E5E7EB] hover:border-[#FFD978] rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#F5B942] ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={handleOpenNicBlockModal}
            className="flex items-center gap-2 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
          >
            <Ban className="w-3.5 h-3.5" />
            <span>Block by NIC</span>
          </button>
          <button
            onClick={handleOpenBoatBlockModal}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
          >
            <Ship className="w-3.5 h-3.5" />
            <span>Block by Boat</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-between text-red-800 text-xs sm:text-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
          <button
            onClick={loadBlockHistoryData}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded-xl font-bold text-xs border border-red-300 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
              Active Manual Holds
            </span>
            <div className="p-2 rounded-xl border bg-red-50 border-red-200">
              <Lock className="w-4 h-4 text-red-600" />
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-red-700 tracking-tight">
            {metrics.activeManualCount}
          </h2>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] font-medium text-[#64748B]">
            Requires manual Admin release
          </div>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
              Total Hold History
            </span>
            <div className="p-2 rounded-xl border bg-emerald-50 border-emerald-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight">
            {metrics.historyCount}
          </h2>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] font-medium text-[#64748B]">
            Active & permanent released logs
          </div>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
              Automatic Debt Holds
            </span>
            <div className="p-2 rounded-xl border bg-[#FFF7D6] border-[#FFD978]">
              <Coins className="w-4 h-4 text-[#F5B942]" />
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight">
            {metrics.debtCount}
          </h2>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] font-medium text-[#64748B]">
            Auto-clears upon full payment
          </div>
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
              Admin Blocked
            </span>
            <div className="p-2 rounded-xl border bg-slate-100 border-slate-300">
              <Ban className="w-4 h-4 text-slate-700" />
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">
            {metrics.adminBlockCount}
          </h2>
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] font-medium text-[#64748B]">
            Base status BLOCKED fishers
          </div>
        </div>
      </div>

      {/* Filter & Search Header Card */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
        
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-[#F5F6F8] border border-[#E5E7EB] rounded-xl overflow-x-auto">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-[#FFF7D6] text-[#111827] border border-[#FFD978] shadow-2xs'
                  : 'text-[#64748B] hover:text-[#111827] hover:bg-white'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== null && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  activeTab === tab.id ? 'bg-[#FFD978] text-[#111827]' : 'bg-slate-200 text-slate-700'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search & Date Controls */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          
          {/* Search Input */}
          <div className="relative md:col-span-2">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Fisher Name, NIC, Fisher ID, Phone or Boat No..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-[#D1D5DB] rounded-xl text-xs text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
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

          {/* From Date Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap">From:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
            />
          </div>

          {/* To Date Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap">To:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
            />
          </div>

        </div>

      </div>

      {/* Main Records Container */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-2xs overflow-hidden">
        
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center bg-[#F5F6F8]">
            <div className="w-12 h-12 rounded-full bg-white border border-[#E5E7EB] flex items-center justify-center mx-auto mb-3 text-slate-400 shadow-2xs">
              <ShieldAlert className="w-6 h-6 text-[#F5B942]" />
            </div>
            <h3 className="text-sm font-extrabold text-[#111827]">
              {activeTab === 'ACTIVE'
                ? 'No active manual holds.'
                : activeTab === 'HISTORY'
                ? 'No hold history found.'
                : activeTab === 'DEBT'
                ? 'No fishers are currently on automatic debt hold.'
                : activeTab === 'ADMIN_BLOCK'
                ? 'No admin-blocked fishers found.'
                : 'No restriction records found.'}
            </h3>
            <p className="text-xs text-[#64748B] mt-1 max-w-sm mx-auto">
              {debouncedSearch || fromDate || toDate
                ? 'Try resetting your search query or date range filter.'
                : 'Fisher clearance restrictions will be logged here.'}
            </p>
            {(debouncedSearch || fromDate || toDate) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFromDate('');
                  setToDate('');
                }}
                className="mt-4 px-4 py-2 bg-white border border-[#E5E7EB] hover:bg-[#FFF7D6] rounded-xl text-xs font-bold text-[#111827] transition-all cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table View (>= 768px) */}
            <div className="hidden md:block max-h-[60vh] overflow-y-auto relative">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#F5F6F8] z-10 border-b border-[#E5E7EB] shadow-2xs">
                  <tr className="text-[11px] font-extrabold text-[#64748B] uppercase tracking-wider">
                    <th className="py-2.5 px-3.5">Fisher</th>
                    <th className="py-2.5 px-3.5">Reason</th>
                    <th className="py-2.5 px-3.5">Hold Date</th>
                    <th className="py-2.5 px-3.5">Status</th>
                    <th className="py-2.5 px-3.5">Release Details</th>
                    <th className="py-2.5 px-3.5">Created By</th>
                    <th className="py-2.5 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB] text-xs">
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => handleViewFisherDetail(item.fisher_id, item.full_name, item.custom_fisher_id)}
                      className="hover:bg-[#FFF7D6]/40 transition-colors cursor-pointer group"
                    >
                      {/* Fisher Info */}
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

                      {/* Reason & Category */}
                      <td className="py-2.5 px-3.5 max-w-xs">
                        <div className="font-extrabold text-[#111827]">
                          {formatReasonCode(item.reason_code, item.reason_text)}
                        </div>
                        {item.notes && (
                          <div className="text-[10px] text-slate-500 italic mt-0.5 line-clamp-1">
                            Notes: {item.notes}
                          </div>
                        )}
                        {item.block_type === 'DEBT_HOLD' && (
                          <span className="inline-block mt-1 text-[10px] font-extrabold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Debt Hold – Automatic
                          </span>
                        )}
                        {item.block_type === 'ADMIN_BLOCK' && (
                          <span className="inline-block mt-1 text-[10px] font-extrabold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
                            Admin Block
                          </span>
                        )}
                      </td>

                      {/* Hold Date */}
                      <td className="py-2.5 px-3.5 text-slate-600 font-semibold">
                        {formatDate(item.hold_date)}
                      </td>

                      {/* Status Badge */}
                      <td className="py-2.5 px-3.5">
                        {item.hold_status === 'ACTIVE' ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-[10px] font-extrabold flex items-center gap-1 w-fit">
                            <Lock className="w-3 h-3" />
                            <span>ACTIVE HOLD</span>
                          </span>
                        ) : item.hold_status === 'RELEASED' ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-extrabold flex items-center gap-1 w-fit">
                            <ShieldCheck className="w-3 h-3" />
                            <span>RELEASED</span>
                          </span>
                        ) : item.hold_status === 'AUTOMATIC' ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-extrabold flex items-center gap-1 w-fit">
                            <Coins className="w-3 h-3" />
                            <span>DEBT HOLD</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-slate-700 text-[10px] font-extrabold flex items-center gap-1 w-fit">
                            <Ban className="w-3 h-3" />
                            <span>BLOCKED</span>
                          </span>
                        )}
                      </td>

                      {/* Release Info */}
                      <td className="py-2.5 px-3.5 max-w-xs text-[11px]">
                        {item.released_at ? (
                          <div>
                            <div className="font-bold text-emerald-800">
                              Released: {formatDate(item.released_at)}
                            </div>
                            {item.released_by_name && (
                              <div className="text-[10px] text-slate-500 font-medium">
                                By: {item.released_by_name}
                              </div>
                            )}
                            {item.release_notes && (
                              <div className="text-[10px] text-slate-600 italic line-clamp-1 mt-0.5">
                                Notes: {item.release_notes}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Not released</span>
                        )}
                      </td>

                      {/* Created By Admin */}
                      <td className="py-2.5 px-3.5 text-slate-600 font-medium text-[11px]">
                        {item.created_by_name || 'System Admin'}
                      </td>

                      {/* Action Buttons */}
                      <td className="py-2.5 px-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {item.block_type === 'MANUAL_HOLD' && item.hold_status === 'ACTIVE' && (
                            <button
                              type="button"
                              onClick={() => handleOpenReleaseModal(item)}
                              className="px-2.5 py-1 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] rounded-lg text-[11px] font-extrabold transition-all cursor-pointer shadow-2xs"
                            >
                              Release Hold
                            </button>
                          )}

                          {item.block_type === 'DEBT_HOLD' && (
                            <button
                              type="button"
                              onClick={() => navigate(`/admin/debt-payments?search=${encodeURIComponent(item.custom_fisher_id)}`)}
                              className="px-2.5 py-1 bg-white border border-[#E5E7EB] hover:bg-slate-50 text-[#111827] rounded-lg text-[11px] font-extrabold transition-all cursor-pointer"
                            >
                              View Debt
                            </button>
                          )}

                          {item.block_type === 'ADMIN_BLOCK' && (
                            <button
                              type="button"
                              onClick={() => handleViewFisherDetail(item.fisher_id, item.full_name, item.custom_fisher_id)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-[#111827] rounded-lg text-[11px] font-extrabold transition-all cursor-pointer"
                            >
                              Manage Fisher
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View (< 768px) */}
            <div className="block md:hidden max-h-[60vh] overflow-y-auto divide-y divide-[#E5E7EB]">
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleViewFisherDetail(item.fisher_id, item.full_name, item.custom_fisher_id)}
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

                    {item.hold_status === 'ACTIVE' ? (
                      <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[10px] font-extrabold border border-red-200">
                        ACTIVE HOLD
                      </span>
                    ) : item.hold_status === 'RELEASED' ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-extrabold border border-emerald-200">
                        RELEASED
                      </span>
                    ) : item.hold_status === 'AUTOMATIC' ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[10px] font-extrabold border border-amber-200">
                        DEBT HOLD
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-extrabold border border-slate-300">
                        BLOCKED
                      </span>
                    )}
                  </div>

                  <div className="p-3 bg-[#F5F6F8] rounded-xl text-xs space-y-1">
                    <div className="font-extrabold text-[#111827]">
                      {formatReasonCode(item.reason_code, item.reason_text)}
                    </div>
                    {item.notes && <div className="text-[11px] text-slate-500 italic">Notes: {item.notes}</div>}
                    {item.hold_date && <div className="text-[10px] text-slate-400 font-medium">Hold Date: {formatDate(item.hold_date)}</div>}
                  </div>

                  {item.released_at && (
                    <div className="p-2.5 bg-emerald-50/60 rounded-xl border border-emerald-100 text-[11px] text-emerald-900 space-y-0.5">
                      <div className="font-bold">Released: {formatDate(item.released_at)}</div>
                      {item.release_notes && <div className="text-[10px] italic">Notes: {item.release_notes}</div>}
                    </div>
                  )}

                  <div className="flex items-center justify-end pt-1" onClick={(e) => e.stopPropagation()}>
                    {item.block_type === 'MANUAL_HOLD' && item.hold_status === 'ACTIVE' && (
                      <button
                        type="button"
                        onClick={() => handleOpenReleaseModal(item)}
                        className="px-3 py-1.5 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] rounded-xl text-xs font-extrabold transition-all cursor-pointer"
                      >
                        Release Hold
                      </button>
                    )}

                    {item.block_type === 'DEBT_HOLD' && (
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/debt-payments?search=${encodeURIComponent(item.custom_fisher_id)}`)}
                        className="px-3 py-1.5 bg-white border border-[#E5E7EB] text-[#111827] rounded-xl text-xs font-extrabold cursor-pointer"
                      >
                        View Debt
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Footer */}
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

      {/* Release Manual Hold Confirmation Modal */}
      {releaseModalHold && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmReleaseSubmit}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <div className="flex items-center gap-2 text-emerald-700">
                <ShieldCheck className="w-5 h-5" />
                <h3 className="text-base font-extrabold text-[#111827]">Release Hold</h3>
              </div>
              <button
                type="button"
                onClick={() => setReleaseModalHold(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Fisher:</span>
                <span className="font-extrabold text-[#111827]">{releaseModalHold.full_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Reason:</span>
                <span className="font-bold text-[#111827]">
                  {formatReasonCode(releaseModalHold.reason_code, releaseModalHold.reason_text)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Hold Date:</span>
                <span className="font-semibold text-slate-700">{formatDate(releaseModalHold.hold_date)}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold text-[#111827] mb-1">
                Release Notes <span className="text-red-600">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={releaseNotesInput}
                onChange={(e) => setReleaseNotesInput(e.target.value)}
                placeholder="Enter release notes..."
                className="w-full p-3 bg-white border border-[#D1D5DB] rounded-xl text-xs text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
              <button
                type="button"
                onClick={() => setReleaseModalHold(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={releasing}
                className="px-4 py-2 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] rounded-xl text-xs font-extrabold transition-colors cursor-pointer disabled:opacity-50"
              >
                {releasing ? 'Releasing...' : 'Confirm Release'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Fisher Detail Drawer */}
      <FisherDetailDrawer
        isOpen={isDetailDrawerOpen}
        onClose={() => setIsDetailDrawerOpen(false)}
        fisher={selectedFisherForDetail}
        onEdit={() => {}}
        onArchive={() => {}}
        onRestore={() => {}}
      />

      {/* NIC Block Modal */}
      {nicBlockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-[#E5E7EB] overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] bg-red-50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-red-100 border border-red-200">
                  <Ban className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-[#111827]">NIC மூலம் Block செய்ய</h2>
                  <p className="text-[11px] text-[#64748B] font-medium">NIC number enter செய்தால் அந்த ஆளை block செய்யலாம்</p>
                </div>
              </div>
              <button
                onClick={() => setNicBlockModalOpen(false)}
                className="p-1.5 hover:bg-red-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">

              {/* Success Result */}
              {nicBlockResult && nicBlockResult.success && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-extrabold text-emerald-700">Block வெற்றிகரமாக செய்யப்பட்டது!</span>
                  </div>
                  <div className="space-y-1 text-[11px] text-emerald-800">
                    <div><span className="font-bold">பெயர்:</span> {nicBlockResult.fisher?.full_name}</div>
                    <div><span className="font-bold">NIC:</span> {nicBlockResult.fisher?.nic}</div>
                    <div><span className="font-bold">Fisher ID:</span> {nicBlockResult.fisher?.fisher_id}</div>
                    {nicBlockResult.fisher?.hadExistingActiveHold && (
                      <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 font-bold">
                        ⚠️ இந்த ஆளுக்கு ஏற்கனவே active block இருந்தது. புதிய block-ம் சேர்க்கப்பட்டது.
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => { setNicBlockModalOpen(false); setNicBlockResult(null); }}
                    className="mt-3 w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              )}

              {/* Form - only show if no success yet */}
              {!nicBlockResult && (
                <form onSubmit={handleNicBlockSubmit} className="space-y-4">
                  
                  {/* Error */}
                  {nicBlockError && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{nicBlockError}</span>
                    </div>
                  )}

                  {/* NIC Input */}
                  <div>
                    <label className="block text-xs font-bold text-[#374151] mb-1.5">
                      NIC Number <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <User className="w-4 h-4 text-slate-400" />
                      </div>
                      <input
                        type="text"
                        value={nicInput}
                        onChange={(e) => { setNicInput(e.target.value); setNicBlockError(''); }}
                        placeholder="உதாரணம்: 199012345678"
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#D1D5DB] rounded-xl text-xs text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400"
                        autoFocus
                      />
                    </div>
                    <p className="text-[10px] text-[#64748B] mt-1">
                      யாரு register பண்ணாலும் — NIC மட்டும் போதும், block ஆகும்.
                    </p>
                  </div>

                  {/* Notes Input */}
                  <div>
                    <label className="block text-xs font-bold text-[#374151] mb-1.5">
                      காரணம் / Notes <span className="text-[#64748B] font-normal">(optional)</span>
                    </label>
                    <textarea
                      value={nicNotes}
                      onChange={(e) => setNicNotes(e.target.value)}
                      placeholder="Block செய்வதற்கான காரணம் எழுதவும்..."
                      rows={3}
                      className="w-full px-3.5 py-2.5 bg-white border border-[#D1D5DB] rounded-xl text-xs text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400 resize-none"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setNicBlockModalOpen(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={nicBlocking || !nicInput.trim()}
                      className="flex items-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-extrabold transition-colors cursor-pointer"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      {nicBlocking ? 'Blocking...' : 'Block செய்'}
                    </button>
                  </div>
                </form>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Boat Block Modal */}
      {boatBlockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-[#E5E7EB] overflow-hidden">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] bg-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-slate-700 border border-slate-600">
                  <Ship className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-white">Boat Number மூலம் Block செய்ய</h2>
                  <p className="text-[11px] text-slate-300 font-medium">Boat number enter செய்தால் அந்த ஆளை block செய்யலாம்</p>
                </div>
              </div>
              <button
                onClick={() => setBoatBlockModalOpen(false)}
                className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4 text-slate-300" />
              </button>
            </div>

            <div className="p-6 space-y-4">

              {/* Success Result */}
              {boatBlockResult && boatBlockResult.success && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-extrabold text-emerald-700">Boat Block வெற்றிகரமாக செய்யப்பட்டது!</span>
                  </div>
                  <div className="space-y-1 text-[11px] text-emerald-800">
                    <div><span className="font-bold">Boat No:</span> {boatBlockResult.boatNo || boatBlockResult.fisher?.boat_no}</div>
                    {boatBlockResult.fisher?.full_name && <div><span className="font-bold">பெயர்:</span> {boatBlockResult.fisher?.full_name}</div>}
                    {boatBlockResult.fisher?.nic && <div><span className="font-bold">NIC:</span> {boatBlockResult.fisher?.nic}</div>}
                    <div className="mt-2 p-2 bg-emerald-100 border border-emerald-200 rounded-lg text-emerald-900 font-bold">
                      🚢 இனி இந்த boat number departure PDF-ல் வந்தால் automatically ⛔ BLOCKED BOAT என்று காட்டும்.
                    </div>
                  </div>
                  <button
                    onClick={() => { setBoatBlockModalOpen(false); setBoatBlockResult(null); }}
                    className="mt-3 w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              )}

              {/* Form */}
              {!boatBlockResult && (
                <form onSubmit={handleBoatBlockSubmit} className="space-y-4">

                  {/* Error */}
                  {boatBlockError && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{boatBlockError}</span>
                    </div>
                  )}

                  {/* Boat No Input */}
                  <div>
                    <label className="block text-xs font-bold text-[#374151] mb-1.5">
                      Boat Number <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Ship className="w-4 h-4 text-slate-400" />
                      </div>
                      <input
                        type="text"
                        value={boatInput}
                        onChange={(e) => { setBoatInput(e.target.value); setBoatBlockError(''); }}
                        placeholder="உதாரணம்: BOAT-001 அல்லது SL-123"
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#D1D5DB] rounded-xl text-xs text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
                        autoFocus
                      />
                    </div>
                    <p className="text-[10px] text-[#64748B] mt-1">
                      யாரு register பண்ணாலும் — Boat number மட்டும் போதும், block ஆகும்.
                    </p>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-bold text-[#374151] mb-1.5">
                      காரணம் / Notes <span className="text-[#64748B] font-normal">(optional)</span>
                    </label>
                    <textarea
                      value={boatNotes}
                      onChange={(e) => setBoatNotes(e.target.value)}
                      placeholder="Block செய்வதற்கான காரணம் எழுதவும்..."
                      rows={3}
                      className="w-full px-3.5 py-2.5 bg-white border border-[#D1D5DB] rounded-xl text-xs text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400 resize-none"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setBoatBlockModalOpen(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={boatBlocking || !boatInput.trim()}
                      className="flex items-center gap-2 px-5 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-extrabold transition-colors cursor-pointer"
                    >
                      <Ship className="w-3.5 h-3.5" />
                      {boatBlocking ? 'Blocking...' : 'Block செய்'}
                    </button>
                  </div>
                </form>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default BlockHistoryPage;
