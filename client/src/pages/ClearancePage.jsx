import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getFishers } from '../services/fisherService';
import { getFisherClearance, grantClearance, getTodayClearances, getFisherClearanceHistory } from '../services/clearanceService';
import { AddChargeModal } from '../components/clearance/AddChargeModal';
import { RecordPaymentModal } from '../components/debts/RecordPaymentModal';
import { ManageHoldModal } from '../components/holds/ManageHoldModal';
import {
  Search,
  CheckCircle2,
  AlertOctagon,
  Clock,
  Ban,
  Coins,
  Plus,
  Receipt,
  ShieldAlert,
  RefreshCw,
  AlertCircle,
  Ship,
  User,
  Calendar,
  ChevronRight,
  ShieldCheck,
  FileText,
} from 'lucide-react';

export const ClearancePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Selected Fisher & Clearance Data
  const [selectedFisherId, setSelectedFisherId] = useState(null);
  const [clearanceData, setClearanceData] = useState(null);
  const [clearanceHistory, setClearanceHistory] = useState([]);
  const [loadingClearance, setLoadingClearance] = useState(false);
  const [clearanceError, setClearanceError] = useState('');

  // Today's Clearances State
  const [todayClearances, setTodayClearances] = useState([]);
  const [todayLoading, setTodayLoading] = useState(false);

  // Grant Clearance Modal & Submitting State
  const [isGranting, setIsGranting] = useState(false);
  const [grantNotes, setGrantNotes] = useState('');
  const [showGrantConfirm, setShowGrantConfirm] = useState(false);
  const [grantError, setGrantError] = useState('');

  // Modals
  const [isAddChargeOpen, setIsAddChargeOpen] = useState(false);
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [isManageHoldOpen, setIsManageHoldOpen] = useState(false);

  // Initial load: check query param fisherId & fetch today's clearances
  useEffect(() => {
    fetchTodayClearances();

    const paramId = searchParams.get('fisherId');
    if (paramId) {
      setSelectedFisherId(paramId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (selectedFisherId) {
      fetchClearanceDetails(selectedFisherId);
    }
  }, [selectedFisherId]);

  // Debounced Quick Search
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
        console.error('Search error:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchTodayClearances = async () => {
    try {
      setTodayLoading(true);
      const res = await getTodayClearances();
      if (res && res.success) {
        setTodayClearances(res.clearances || []);
      }
    } catch (err) {
      console.error('Today clearances error:', err);
    } finally {
      setTodayLoading(false);
    }
  };

  const fetchClearanceDetails = async (id) => {
    try {
      setLoadingClearance(true);
      setClearanceError('');
      const res = await getFisherClearance(id);
      if (res && res.success) {
        setClearanceData(res);
      }

      const histRes = await getFisherClearanceHistory(id);
      if (histRes && histRes.success) {
        setClearanceHistory(histRes.history || []);
      }
    } catch (err) {
      setClearanceError(err.response?.data?.message || err.message || 'Failed to load fisher clearance details.');
    } finally {
      setLoadingClearance(false);
    }
  };

  const handleSelectFisher = (fisher) => {
    setSelectedFisherId(fisher.id);
    setSearchQuery('');
    setShowDropdown(false);
    setSearchParams({ fisherId: fisher.id });
  };

  const handleGrantClearanceSubmit = async () => {
    if (!clearanceData?.fisher) return;

    try {
      setIsGranting(true);
      setGrantError('');
      // Generate UUID idempotency key per intended action
      const idempotencyKey = `CLR-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      await grantClearance(clearanceData.fisher.id, {
        idempotencyKey,
        notes: grantNotes || null,
      });

      setShowGrantConfirm(false);
      setGrantNotes('');
      await fetchClearanceDetails(clearanceData.fisher.id);
      await fetchTodayClearances();
    } catch (err) {
      setGrantError(err.response?.data?.message || err.message || 'Failed to grant clearance.');
    } finally {
      setIsGranting(false);
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const fisher = clearanceData?.fisher;
  const clearanceStatus = clearanceData?.clearanceStatus;
  const financialSummary = clearanceData?.financialSummary;

  const isCleared = clearanceStatus?.status === 'CLEARED';
  const isHold = clearanceStatus?.status === 'HOLD';
  const isPending = clearanceStatus?.status === 'PENDING';
  const isNotEligible = clearanceStatus?.status === 'NOT_ELIGIBLE';

  return (
    <div className="space-y-6 pb-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E7EB] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight">Clearance</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-[#FFF7D6] border border-[#FFD978] text-[11px] font-extrabold text-[#111827]">
              Fisher Verification
            </span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-[#64748B]">
            Verify fisher clearance eligibility and record trip charges.
          </p>
        </div>
      </div>

      {/* Top Section: Quick Fisher Search */}
      <div className="relative">
        <div className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-2xs">
          <label className="block text-xs font-bold text-[#111827] mb-2">Fisher Search</label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery.trim() && setShowDropdown(true)}
              placeholder="Search by Name, NIC, Phone, Fisher ID, Boat No..."
              className="w-full pl-10 pr-10 py-2.5 bg-[#F5F6F8] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#111827] focus:outline-none focus:border-[#F5B942] focus:ring-2 focus:ring-[#FFD978] transition-all"
            />
            {searchLoading && (
              <RefreshCw className="w-4 h-4 text-[#F5B942] animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
            )}
          </div>
        </div>

        {/* Dropdown Search Results */}
        {showDropdown && searchResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-[#E5E7EB] rounded-2xl shadow-xl z-40 overflow-hidden divide-y divide-[#E5E7EB]">
            {searchResults.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSelectFisher(item)}
                className="w-full text-left p-3.5 hover:bg-[#FFFDF3] transition-colors flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#FFF7D6] border border-[#FFD978] flex items-center justify-center font-extrabold text-xs text-[#111827]">
                    {item.full_name.charAt(0)}
                  </div>
                  <div>
                    <span className="font-extrabold text-xs text-[#111827] block">{item.full_name}</span>
                    <span className="text-[10px] text-[#64748B]">
                      NIC: {item.nic} | Boat: {item.boat_no || 'N/A'}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-xs font-bold text-[#D9A441] block">{item.fisher_id}</span>
                  <span
                    className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      item.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : item.status === 'BLOCKED'
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected Fisher Panel & Status Overview */}
      {!selectedFisherId ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-[#E5E7EB] space-y-3">
          <div className="w-12 h-12 rounded-full bg-[#FFF7D6] border border-[#FFD978] flex items-center justify-center mx-auto text-[#D9A441]">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-extrabold text-[#111827]">No Fisher Selected</h3>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto">
            Search for a fisher to check clearance eligibility or grant clearance.
          </p>
        </div>
      ) : loadingClearance ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-[#E5E7EB] text-xs text-[#64748B]">
          <RefreshCw className="w-6 h-6 text-[#F5B942] animate-spin mx-auto mb-2" />
          Loading clearance status...
        </div>
      ) : clearanceError ? (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{clearanceError}</span>
        </div>
      ) : (
        fisher && (
          <div className="space-y-6">
            {/* Selected Fisher Info & Status Display Card */}
            <div className="bg-white rounded-3xl border border-[#E5E7EB] p-6 shadow-2xs space-y-6">
              {/* Header Info Row */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5E7EB] pb-5">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-[#FFF7D6] border border-[#FFD978] flex items-center justify-center font-extrabold text-base text-[#111827]">
                    {fisher.full_name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold text-[#111827]">{fisher.full_name}</h2>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#64748B] mt-0.5">
                      <span>ID: <strong className="font-mono text-[#111827]">{fisher.fisher_id}</strong></span>
                      <span>NIC: <strong className="text-[#111827]">{fisher.nic}</strong></span>
                      <span>Phone: <strong className="text-[#111827]">{fisher.phone || 'N/A'}</strong></span>
                      <span>Boat: <strong className="text-[#111827]">{fisher.boat_no || 'N/A'}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#64748B]">Base Status:</span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase ${
                      fisher.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : fisher.status === 'BLOCKED'
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {fisher.status}
                  </span>
                </div>
              </div>

              {/* Financial Snapshot & Large Status Panel */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Financial Summary */}
                <div className="p-4 rounded-2xl bg-[#F5F6F8] border border-[#E5E7EB] space-y-2">
                  <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">Financial Summary</span>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[#64748B]">Total Debt:</span>
                    <span className="font-semibold text-[#111827]">Rs. {financialSummary?.totalDebt || '0.00'}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[#64748B]">Total Paid:</span>
                    <span className="font-semibold text-emerald-700">Rs. {financialSummary?.totalPaid || '0.00'}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs pt-1.5 border-t border-[#E5E7EB]">
                    <span className="font-extrabold text-[#111827]">Outstanding Debt:</span>
                    <span className="font-extrabold text-red-600 font-mono text-sm">
                      Rs. {financialSummary?.outstandingDebt || '0.00'}
                    </span>
                  </div>
                </div>

                {/* Large Derived Clearance Status */}
                <div
                  className={`md:col-span-2 p-5 rounded-2xl border flex flex-col justify-between ${
                    isCleared
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                      : isHold
                      ? 'bg-red-50/60 border-red-200 text-red-900'
                      : isPending
                      ? 'bg-amber-50/60 border-amber-200 text-amber-900'
                      : 'bg-slate-100 border-slate-200 text-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">
                        Effective Clearance Status
                      </span>
                      {isCleared && <CheckCircle2 className="w-6 h-6 text-emerald-600" />}
                      {isHold && <AlertOctagon className="w-6 h-6 text-red-600" />}
                      {isPending && <Clock className="w-6 h-6 text-amber-600" />}
                      {isNotEligible && <Ban className="w-6 h-6 text-slate-500" />}
                    </div>

                    <h3 className="text-xl font-black tracking-tight mt-1">
                      {isCleared && 'CLEARED TO PROCEED'}
                      {isHold && 'HOLD – DO NOT PROCEED'}
                      {isPending && 'PENDING'}
                      {isNotEligible && 'NOT ELIGIBLE'}
                    </h3>
                  </div>

                  {/* Hold Reasons List */}
                  {clearanceStatus?.reasons && clearanceStatus.reasons.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-current/10 space-y-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider block opacity-75">
                        Active Reason(s):
                      </span>
                      {clearanceStatus.reasons.map((r, idx) => (
                        <div key={idx} className="text-xs font-extrabold flex items-center justify-between gap-2">
                          <span>• {r.label}</span>
                          {r.amount && <span>Rs. {r.amount}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#E5E7EB]">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setIsAddChargeOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] text-xs font-extrabold rounded-xl transition-all shadow-2xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-[#111827]" />
                    <span>Add Charge</span>
                  </button>

                  <button
                    onClick={() => setIsRecordPaymentOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-[#FFF7D6] text-[#111827] border border-[#E5E7EB] hover:border-[#FFD978] text-xs font-bold rounded-xl transition-all shadow-2xs cursor-pointer"
                  >
                    <Receipt className="w-4 h-4 text-[#F5B942]" />
                    <span>Record Payment</span>
                  </button>

                  <button
                    onClick={() => setIsManageHoldOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-100 text-[#111827] border border-[#E5E7EB] text-xs font-bold rounded-xl transition-all shadow-2xs cursor-pointer"
                  >
                    <ShieldAlert className="w-4 h-4 text-slate-500" />
                    <span>Manage Hold</span>
                  </button>
                </div>

                {/* Grant Clearance Button (Enabled ONLY when CLEARED) */}
                <button
                  onClick={() => setShowGrantConfirm(true)}
                  disabled={!isCleared}
                  className={`flex items-center gap-2 px-6 py-2.5 text-xs font-extrabold rounded-xl transition-all shadow-2xs cursor-pointer ${
                    isCleared
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-2 focus:ring-emerald-500'
                      : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Grant Clearance</span>
                </button>
              </div>
            </div>

            {/* Clearance History for Selected Fisher */}
            <div className="bg-white rounded-3xl border border-[#E5E7EB] p-6 shadow-2xs space-y-4">
              <h3 className="text-sm font-extrabold text-[#111827] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#F5B942]" />
                Clearance History ({fisher.full_name})
              </h3>

              {clearanceHistory.length === 0 ? (
                <p className="text-xs text-[#64748B] py-4 text-center">No previous clearance records.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#E5E7EB] text-[10px] font-extrabold text-[#64748B] uppercase">
                        <th className="py-2.5 px-3">Clearance No.</th>
                        <th className="py-2.5 px-3">Date & Time</th>
                        <th className="py-2.5 px-3">Boat No.</th>
                        <th className="py-2.5 px-3">Cleared By</th>
                        <th className="py-2.5 px-3">Outstanding Debt Snapshot</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E7EB]">
                      {clearanceHistory.map((item) => (
                        <tr key={item.id} className="hover:bg-[#FFFDF3]">
                          <td className="py-2.5 px-3 font-mono font-bold text-[#111827]">{item.clearance_no}</td>
                          <td className="py-2.5 px-3 text-[#64748B]">
                            {formatDate(item.granted_at)} ({formatTime(item.granted_at)})
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-[#111827]">{item.boat_no_snapshot || 'N/A'}</td>
                          <td className="py-2.5 px-3 text-[#64748B]">{item.granted_by_admin_name || 'Admin'}</td>
                          <td className="py-2.5 px-3 font-mono text-[#111827]">
                            Rs. {item.outstanding_debt_snapshot}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              CLEARED
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* Today's Clearances Section (Asia/Colombo) */}
      <div className="bg-white rounded-3xl border border-[#E5E7EB] p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#F5B942]" />
            <h3 className="text-base font-extrabold text-[#111827]">Today's Clearances</h3>
            <span className="text-xs text-[#64748B] font-medium">(Asia/Colombo Business Day)</span>
          </div>
          <button
            onClick={fetchTodayClearances}
            className="p-1.5 text-slate-400 hover:text-[#111827] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${todayLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {todayLoading ? (
          <p className="text-xs text-[#64748B] py-6 text-center">Loading today's clearances...</p>
        ) : todayClearances.length === 0 ? (
          <p className="text-xs text-[#64748B] py-6 text-center">No clearances recorded today.</p>
        ) : (
          <div>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E5E7EB] text-[10px] font-extrabold text-[#64748B] uppercase">
                    <th className="py-3 px-3">Clearance No.</th>
                    <th className="py-3 px-3">Fisher</th>
                    <th className="py-3 px-3">Fisher ID</th>
                    <th className="py-3 px-3">Boat No.</th>
                    <th className="py-3 px-3">Time</th>
                    <th className="py-3 px-3">Cleared By</th>
                    <th className="py-3 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {todayClearances.map((item) => (
                    <tr key={item.id} className="hover:bg-[#FFFDF3]">
                      <td className="py-3 px-3 font-mono font-bold text-[#111827]">{item.clearance_no}</td>
                      <td className="py-3 px-3 font-extrabold text-[#111827]">{item.full_name}</td>
                      <td className="py-3 px-3 font-mono text-[#D9A441]">{item.custom_fisher_id}</td>
                      <td className="py-3 px-3 text-[#111827] font-medium">{item.boat_no_snapshot || 'N/A'}</td>
                      <td className="py-3 px-3 text-[#64748B]">{formatTime(item.granted_at)}</td>
                      <td className="py-3 px-3 text-[#64748B]">{item.granted_by_admin_name || 'Admin'}</td>
                      <td className="py-3 px-3">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          CLEARED
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden space-y-3">
              {todayClearances.map((item) => (
                <div key={item.id} className="p-3.5 rounded-2xl bg-[#F5F6F8] border border-[#E5E7EB] space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-mono font-extrabold text-[#111827]">{item.clearance_no}</span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      CLEARED
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-[#111827]">{item.full_name}</span>
                    <span className="font-mono text-[#D9A441]">{item.custom_fisher_id}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-[#64748B]">
                    <span>Boat: {item.boat_no_snapshot || 'N/A'}</span>
                    <span>Time: {formatTime(item.granted_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Grant Clearance Confirmation Modal */}
      {showGrantConfirm && fisher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl border border-[#E5E7EB] shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#111827]">Grant Harbor Clearance</h3>
                <p className="text-xs text-[#64748B]">{fisher.full_name} ({fisher.fisher_id})</p>
              </div>
            </div>

            {grantError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold">
                {grantError}
              </div>
            )}

            <div className="p-3.5 rounded-2xl bg-[#F5F6F8] border border-[#E5E7EB] space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#64748B]">Boat No Snapshot:</span>
                <span className="font-semibold text-[#111827]">{fisher.boat_no || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Base Status Snapshot:</span>
                <span className="font-semibold text-[#111827]">{fisher.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Outstanding Snapshot:</span>
                <span className="font-semibold text-emerald-700">Rs. {financialSummary?.outstandingDebt || '0.00'}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#111827] mb-1.5">Notes (Optional)</label>
              <textarea
                rows={2}
                value={grantNotes}
                onChange={(e) => setGrantNotes(e.target.value)}
                placeholder="Optional remarks for this clearance..."
                className="w-full px-3.5 py-2 bg-white border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#111827] focus:outline-none focus:border-[#F5B942]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowGrantConfirm(false)}
                className="px-4 py-2 text-xs font-bold text-[#64748B] hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGrantClearanceSubmit}
                disabled={isGranting}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl transition-all shadow-2xs cursor-pointer disabled:opacity-50"
              >
                {isGranting ? 'Granting...' : 'Grant Clearance'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Charge Modal */}
      <AddChargeModal
        isOpen={isAddChargeOpen}
        onClose={() => setIsAddChargeOpen(false)}
        fisher={fisher}
        onSuccess={() => fetchClearanceDetails(fisher.id)}
        onNavigateToSettings={() => navigate('/admin/settings')}
      />

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={isRecordPaymentOpen}
        onClose={() => setIsRecordPaymentOpen(false)}
        fisherId={fisher?.id}
        onSuccess={() => fetchClearanceDetails(fisher.id)}
      />

      {/* Manage Hold Modal */}
      <ManageHoldModal
        isOpen={isManageHoldOpen}
        onClose={() => setIsManageHoldOpen(false)}
        fisher={fisher}
        onSuccess={() => fetchClearanceDetails(fisher.id)}
      />
    </div>
  );
};

export default ClearancePage;
