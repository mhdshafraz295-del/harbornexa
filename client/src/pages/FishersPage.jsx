import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getFishers,
  createFisher,
  updateFisher,
  archiveFisher,
  restoreFisher,
} from '../services/fisherService';
import { createDebt } from '../services/debtService';
import { FisherModal } from '../components/fishers/FisherModal';
import { FisherDetailDrawer } from '../components/fishers/FisherDetailDrawer';
import { AddDebtModal } from '../components/debts/AddDebtModal';
import { ManageHoldModal } from '../components/holds/ManageHoldModal';
import {
  Users,
  Search,
  Plus,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Archive,
  Eye,
  Edit,
  RotateCcw,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Ship,
  Phone,
  CreditCard,
  Coins,
  Lock,
} from 'lucide-react';

export const FishersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [fishers, setFishers] = useState([]);
  const [counts, setCounts] = useState({ all: 0, active: 0, blocked: 0, pending: 0, archived: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Search & Filter State
  const initialStatus = searchParams.get('status') || '';
  const initialArchiveStatus = searchParams.get('archiveStatus') || (initialStatus === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE');

  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('search') || '');
  const [activeTab, setActiveTab] = useState(initialStatus === 'ARCHIVED' ? 'ARCHIVED' : (initialStatus || 'ALL'));
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1', 10));
  const [limit, setLimit] = useState(parseInt(searchParams.get('limit') || '25', 10));

  // Modal & Drawer State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFisherForEdit, setSelectedFisherForEdit] = useState(null);
  
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedFisherForView, setSelectedFisherForView] = useState(null);

  // Add Debt & Manage Hold Modal States
  const [isAddDebtOpen, setIsAddDebtOpen] = useState(false);
  const [targetFisherForAddDebt, setTargetFisherForAddDebt] = useState(null);

  const [isManageHoldOpen, setIsManageHoldOpen] = useState(false);
  const [selectedFisherForHold, setSelectedFisherForHold] = useState(null);

  // Debounce search query input (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1); // Reset to page 1 on new search
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch Fishers from Backend API
  const fetchFisherData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      let statusParam = '';
      let archiveParam = 'ACTIVE';

      if (activeTab === 'ARCHIVED') {
        archiveParam = 'ARCHIVED';
      } else if (activeTab !== 'ALL') {
        statusParam = activeTab;
      }

      const params = {
        search: debouncedSearch,
        status: statusParam,
        archiveStatus: archiveParam,
        page,
        limit,
      };

      const data = await getFishers(params);
      if (data && data.success) {
        setFishers(data.items || []);
        if (data.counts) setCounts(data.counts);
        if (data.pagination) setPagination(data.pagination);
      }
    } catch (err) {
      setError(err.message || 'Failed to load fisher records.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, activeTab, page, limit]);

  useEffect(() => {
    fetchFisherData();
  }, [fetchFisherData]);

  // Synchronize state with URL search params
  useEffect(() => {
    const newParams = {};
    if (debouncedSearch) newParams.search = debouncedSearch;
    if (activeTab !== 'ALL') {
      if (activeTab === 'ARCHIVED') {
        newParams.archiveStatus = 'ARCHIVED';
      } else {
        newParams.status = activeTab;
      }
    }
    if (page > 1) newParams.page = page.toString();
    if (limit !== 25) newParams.limit = limit.toString();
    setSearchParams(newParams, { replace: true });
  }, [debouncedSearch, activeTab, page, limit, setSearchParams]);

  // Handle Tab Switch
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setPage(1);
  };

  // Handlers for Add / Edit
  const handleOpenAddModal = () => {
    setSelectedFisherForEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (fisher) => {
    setSelectedFisherForEdit(fisher);
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (formData) => {
    if (selectedFisherForEdit) {
      await updateFisher(selectedFisherForEdit.id, formData);
    } else {
      await createFisher(formData);
    }
    fetchFisherData();
  };

  // Handlers for Add Debt
  const handleOpenAddDebt = (fisher) => {
    setTargetFisherForAddDebt(fisher);
    setIsAddDebtOpen(true);
  };

  const handleAddDebtSubmit = async (fisherId, formData) => {
    await createDebt(fisherId, formData);
    fetchFisherData();
  };

  // Handlers for Manage Hold
  const handleOpenManageHold = (fisher) => {
    setSelectedFisherForHold(fisher);
    setIsManageHoldOpen(true);
  };

  const handleHoldUpdated = () => {
    fetchFisherData();
  };

  // Handlers for Archive / Restore
  const handleArchive = async (id) => {
    if (window.confirm('Are you sure you want to archive this fisher record?')) {
      try {
        await archiveFisher(id);
        fetchFisherData();
      } catch (err) {
        alert(err.message || 'Failed to archive fisher.');
      }
    }
  };

  const handleRestore = async (id) => {
    try {
      await restoreFisher(id);
      fetchFisherData();
    } catch (err) {
      alert(err.message || 'Failed to restore fisher.');
    }
  };

  const handleViewDetail = (fisher) => {
    setSelectedFisherForView(fisher);
    setIsDrawerOpen(true);
  };

  const formatTimestamp = (isoString) => {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    return (
      date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
      ', ' +
      date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    );
  };

  const filterTabs = [
    { id: 'ALL', label: 'All', count: counts.all, dotColor: 'bg-slate-400' },
    { id: 'ACTIVE', label: 'Active', count: counts.active, dotColor: 'bg-emerald-500' },
    { id: 'BLOCKED', label: 'Blocked', count: counts.blocked, dotColor: 'bg-red-500' },
    { id: 'PENDING', label: 'Pending', count: counts.pending, dotColor: 'bg-amber-500' },
    { id: 'ARCHIVED', label: 'Archived', count: counts.archived, dotColor: 'bg-slate-500' },
  ];

  return (
    <div className="space-y-6 pb-8">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E7EB] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight">
              Fishers
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-[#FFF7D6] border border-[#FFD978] text-[11px] font-extrabold text-[#111827]">
              Valachchenai Harbor
            </span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-[#64748B]">
            Manage harbor fisher records and clearance status.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchFisherData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-[#FFF7D6] text-[#111827] border border-[#E5E7EB] hover:border-[#FFD978] rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#F5B942] ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] rounded-xl text-xs font-extrabold transition-all shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#FFD978] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Fisher</span>
          </button>
        </div>
      </div>

      {/* API Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-between text-red-800 text-xs sm:text-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
          <button
            onClick={fetchFisherData}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded-xl font-bold text-xs border border-red-300 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Pure White Search & Filter Card */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Prominent Search Input */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Name, NIC, Phone, Fisher ID, Boat No..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#D1D5DB] rounded-xl text-sm text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978] focus:border-[#F5B942]"
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

          {/* Status Tabs Bar */}
          <div className="flex items-center gap-1 p-1 bg-[#F5F6F8] border border-[#E5E7EB] rounded-xl overflow-x-auto">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-[#FFF7D6] text-[#111827] border border-[#FFD978] shadow-2xs'
                    : 'text-[#64748B] hover:text-[#111827] hover:bg-white'
                }`}
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
      </div>

      {/* Main Fisher Records List / Table Container */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-2xs overflow-hidden">
        
        {loading ? (
          // Loading Skeleton
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : fishers.length === 0 ? (
          // Zero States
          <div className="p-12 text-center bg-[#F5F6F8]">
            <div className="w-12 h-12 rounded-full bg-white border border-[#E5E7EB] flex items-center justify-center mx-auto mb-3 text-slate-400 shadow-2xs">
              <Users className="w-6 h-6" />
            </div>
            {debouncedSearch || activeTab !== 'ALL' ? (
              <>
                <h3 className="text-sm font-extrabold text-[#111827]">No fishers found.</h3>
                <p className="text-xs text-[#64748B] mt-1">
                  Adjust search criteria or filters.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setActiveTab('ALL');
                  }}
                  className="mt-4 px-4 py-2 bg-white border border-[#E5E7EB] hover:border-[#FFD978] hover:bg-[#FFF7D6] rounded-xl text-xs font-bold text-[#111827] transition-all cursor-pointer"
                >
                  Reset Filters
                </button>
              </>
            ) : (
              <>
                <h3 className="text-sm font-extrabold text-[#111827]">No registered fishers.</h3>
                <p className="text-xs text-[#64748B] mt-1 max-w-sm mx-auto">
                  Use "+ Add Fisher" to register a fisher record.
                </p>
                <button
                  onClick={handleOpenAddModal}
                  className="mt-4 px-4 py-2 bg-[#FFD978] hover:bg-[#F5B942] rounded-xl text-xs font-extrabold text-[#111827] transition-all cursor-pointer"
                >
                  + Add Fisher
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table View (>= 768px) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F5F6F8] border-b border-[#E5E7EB] text-[11px] font-extrabold text-[#64748B] uppercase tracking-wider">
                    <th className="py-3.5 px-4">Fisher</th>
                    <th className="py-3.5 px-4">NIC</th>
                    <th className="py-3.5 px-4">Phone</th>
                    <th className="py-3.5 px-4">Boat No.</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Updated</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB] text-xs">
                  {fishers.map((fisher) => (
                    <tr
                      key={fisher.id}
                      className="hover:bg-[#FFF7D6]/40 transition-colors group cursor-pointer"
                      onClick={() => handleViewDetail(fisher)}
                    >
                      {/* Fisher Name & ID */}
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-[#111827]">{fisher.full_name}</div>
                        <div className="text-[10px] font-extrabold text-[#64748B] tracking-wider mt-0.5">
                          {fisher.fisher_id}
                        </div>
                      </td>

                      {/* NIC */}
                      <td className="py-3.5 px-4 font-bold text-[#111827] tracking-wide">
                        {fisher.nic}
                      </td>

                      {/* Phone */}
                      <td className="py-3.5 px-4 font-medium text-[#111827]">
                        {fisher.phone || <span className="text-slate-400">—</span>}
                      </td>

                      {/* Boat No */}
                      <td className="py-3.5 px-4 font-medium text-[#111827]">
                        {fisher.boat_no ? (
                          <span className="px-2 py-0.5 rounded-lg bg-[#F5F6F8] border border-[#E5E7EB] font-extrabold">
                            {fisher.boat_no}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {fisher.is_archived || fisher.effectiveStatus === 'NOT_ELIGIBLE' ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-slate-700 text-[10px] font-extrabold">
                            ARCHIVED
                          </span>
                        ) : (fisher.effectiveStatus ? fisher.effectiveStatus === 'CLEARED' : fisher.status === 'ACTIVE') ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-extrabold flex items-center gap-1 w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            ACTIVE
                          </span>
                        ) : (fisher.effectiveStatus ? fisher.effectiveStatus === 'HOLD' : fisher.status === 'BLOCKED') ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-[10px] font-extrabold flex items-center gap-1 w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            BLOCKED
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-extrabold flex items-center gap-1 w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            PENDING
                          </span>
                        )}
                      </td>

                      {/* Updated Date */}
                      <td className="py-3.5 px-4 text-[#64748B] text-[11px] font-medium">
                        {formatTimestamp(fisher.updated_at)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleViewDetail(fisher)}
                            title="View Detail"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-[#111827] hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenAddDebt(fisher)}
                            title="Add Debt"
                            className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                          >
                            <Coins className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenManageHold(fisher)}
                            title="Manage Hold"
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            <Lock className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(fisher)}
                            title="Edit Fisher"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-[#111827] hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          {fisher.is_archived ? (
                            <button
                              onClick={() => handleRestore(fisher.id)}
                              title="Restore Fisher"
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleArchive(fisher.id)}
                              title="Archive Fisher"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View (< 768px - Responsive without horizontal scroll) */}
            <div className="block md:hidden divide-y divide-[#E5E7EB]">
              {fishers.map((fisher) => (
                <div
                  key={fisher.id}
                  onClick={() => handleViewDetail(fisher)}
                  className="p-4 hover:bg-[#FFF7D6]/30 transition-colors space-y-3 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-extrabold text-[#111827] line-clamp-1">
                        {fisher.full_name}
                      </h3>
                      <span className="text-[10px] font-extrabold text-[#64748B] tracking-wider">
                        {fisher.fisher_id}
                      </span>
                    </div>

                    {fisher.is_archived || fisher.effectiveStatus === 'NOT_ELIGIBLE' ? (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-extrabold">
                        ARCHIVED
                      </span>
                    ) : (fisher.effectiveStatus ? fisher.effectiveStatus === 'CLEARED' : fisher.status === 'ACTIVE') ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-extrabold border border-emerald-200">
                        ACTIVE
                      </span>
                    ) : (fisher.effectiveStatus ? fisher.effectiveStatus === 'HOLD' : fisher.status === 'BLOCKED') ? (
                      <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[10px] font-extrabold border border-red-200">
                        BLOCKED
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-extrabold border border-amber-200">
                        PENDING
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-[#111827]">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-bold">{fisher.nic}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Ship className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-bold">{fisher.boat_no || 'No Boat'}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10px] text-slate-400">
                      Updated {formatTimestamp(fisher.updated_at)}
                    </span>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <button
                        onClick={() => handleOpenAddDebt(fisher)}
                        className="px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg text-[11px] font-bold text-amber-800 flex items-center gap-1 cursor-pointer"
                      >
                        <Coins className="w-3.5 h-3.5 text-amber-600" />
                        <span>Add Debt</span>
                      </button>
                      <button
                        onClick={() => handleOpenManageHold(fisher)}
                        className="px-2 py-1 bg-red-50 border border-red-200 rounded-lg text-[11px] font-bold text-red-800 flex items-center gap-1 cursor-pointer"
                      >
                        <Lock className="w-3.5 h-3.5 text-red-600" />
                        <span>Hold</span>
                      </button>
                      <button
                        onClick={() => handleViewDetail(fisher)}
                        className="px-2.5 py-1 bg-white border border-[#E5E7EB] rounded-lg text-xs font-bold text-[#111827] cursor-pointer"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(fisher)}
                        className="px-2.5 py-1 bg-[#FFD978] rounded-lg text-xs font-extrabold text-[#111827] cursor-pointer"
                      >
                        Edit
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
                  Showing {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} fishers
                </span>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(parseInt(e.target.value, 10));
                    setPage(1);
                  }}
                  className="ml-2 px-2 py-1 bg-white border border-[#E5E7EB] rounded-lg text-xs font-extrabold text-[#111827] focus:outline-none cursor-pointer"
                >
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>
              </div>

              {/* Page Nav Buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1}
                  className="p-1.5 rounded-lg bg-white border border-[#E5E7EB] disabled:opacity-40 text-[#111827] hover:bg-[#FFF7D6] transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="px-3 py-1 font-bold text-[#111827]">
                  Page {pagination.page} of {pagination.totalPages}
                </span>

                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="p-1.5 rounded-lg bg-white border border-[#E5E7EB] disabled:opacity-40 text-[#111827] hover:bg-[#FFF7D6] transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          </>
        )}

      </div>

      {/* Add / Edit Fisher Modal */}
      <FisherModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleModalSubmit}
        fisher={selectedFisherForEdit}
      />

      {/* Fisher Detail Slide-over Drawer */}
      <FisherDetailDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        fisher={selectedFisherForView}
        onEdit={handleOpenEditModal}
        onArchive={handleArchive}
        onRestore={handleRestore}
        onAddDebt={handleOpenAddDebt}
        onManageHold={handleOpenManageHold}
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

export default FishersPage;
