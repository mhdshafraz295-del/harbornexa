import React, { useState, useEffect } from 'react';
import {
  CalendarClock,
  Plus,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Search,
  Calendar,
  DollarSign,
  FileText,
  AlertCircle,
  Ban,
} from 'lucide-react';

export const InstallmentsPage = () => {
  const [plans, setPlans] = useState([]);
  const [eligibleDebts, setEligibleDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [expandedPlanId, setExpandedPlanId] = useState(null);

  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedDebtId, setSelectedDebtId] = useState('');
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [firstDueDate, setFirstDueDate] = useState('');
  const [graceDays, setGraceDays] = useState('0');
  const [notes, setNotes] = useState('');
  const [previewSchedule, setPreviewSchedule] = useState(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Cancel Modal State
  const [cancelModalPlan, setCancelModalPlan] = useState(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  const fetchPlansAndDebts = async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, debtsRes] = await Promise.all([
        fetch('/api/installments/plans', { credentials: 'include' }),
        fetch('/api/installments/eligible-debts', { credentials: 'include' }),
      ]);

      const plansData = await plansRes.json();
      const debtsData = await debtsRes.json();

      if (plansData.success) {
        setPlans(plansData.plans || []);
      } else {
        setError(plansData.error || 'Failed to fetch installment plans.');
      }

      if (debtsData.success) {
        setEligibleDebts(debtsData.eligibleDebts || []);
      }
    } catch (err) {
      setError(err.message || 'Network error fetching installment plans.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlansAndDebts();
  }, []);

  // Handle previewing schedule in modal
  const handlePreviewSchedule = async () => {
    if (!selectedDebtId || !monthlyAmount || !firstDueDate) {
      setCreateError('Please select a debt, enter monthly installment amount, and select first due date.');
      return;
    }
    const debt = eligibleDebts.find((d) => d.debtId === selectedDebtId);
    if (!debt) return;

    try {
      setCreateError(null);
      const res = await fetch('/api/installments/preview-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          startingBalance: debt.outstandingBalance,
          monthlyInstallmentAmount: Number(monthlyAmount),
          firstDueDate,
          gracePeriodDays: Number(graceDays) || 0,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setPreviewSchedule(data.schedule);
      } else {
        setCreateError(data.error || 'Failed to generate preview schedule.');
      }
    } catch (err) {
      setCreateError(err.message);
    }
  };

  // Handle submit create plan
  const handleCreatePlan = async (e) => {
    e.preventDefault();
    setCreateError(null);
    const debt = eligibleDebts.find((d) => d.debtId === selectedDebtId);
    if (!debt) {
      setCreateError('Please select a valid eligible debt.');
      return;
    }

    setCreateSubmitting(true);
    try {
      const res = await fetch('/api/installments/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fisherId: debt.fisherId,
          debtId: debt.debtId,
          monthlyInstallmentAmount: Number(monthlyAmount),
          firstDueDate,
          gracePeriodDays: Number(graceDays) || 0,
          notes,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setIsCreateModalOpen(false);
        resetCreateForm();
        fetchPlansAndDebts();
      } else {
        setCreateError(data.error || 'Failed to create installment plan.');
      }
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreateSubmitting(false);
    }
  };

  const resetCreateForm = () => {
    setSelectedDebtId('');
    setMonthlyAmount('');
    setFirstDueDate('');
    setGraceDays('0');
    setNotes('');
    setPreviewSchedule(null);
    setCreateError(null);
  };

  // Handle submit cancel plan
  const handleCancelPlan = async (e) => {
    e.preventDefault();
    if (!cancellationReason.trim()) {
      setCancelError('Cancellation reason is required.');
      return;
    }

    setCancelSubmitting(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/installments/plans/${cancelModalPlan.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cancellationReason }),
      });

      const data = await res.json();
      if (data.success) {
        setCancelModalPlan(null);
        setCancellationReason('');
        fetchPlansAndDebts();
      } else {
        setCancelError(data.error || 'Failed to cancel plan.');
      }
    } catch (err) {
      setCancelError(err.message);
    } finally {
      setCancelSubmitting(false);
    }
  };

  // Filter plans
  const filteredPlans = plans.filter((plan) => {
    const matchesSearch =
      plan.fisherName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plan.nicNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plan.fisherCode.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'ACTIVE') return plan.status === 'ACTIVE';
    if (statusFilter === 'OVERDUE_REVIEW')
      return (
        plan.status === 'ACTIVE' &&
        (plan.coverage.overdueDuesCount > 0 || plan.coverage.isManualReviewRequired)
      );
    if (statusFilter === 'CANCELLED') return plan.status === 'CANCELLED';
    if (statusFilter === 'COMPLETED') return plan.status === 'COMPLETED';
    return true;
  });

  const activePlansCount = plans.filter((p) => p.status === 'ACTIVE').length;
  const overdueCount = plans.filter((p) => p.status === 'ACTIVE' && p.coverage.overdueDuesCount > 0).length;
  const reviewRequiredCount = plans.filter((p) => p.coverage.isManualReviewRequired).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#111827] tracking-tight flex items-center gap-2">
            <CalendarClock className="w-7 h-7 text-[#D9A441]" />
            Installment Management / தவணை நிர்வாகம்
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Manage installment payment schedules for fisher debts without triggering legacy holds.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchPlansAndDebts}
            className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#111827] text-white hover:bg-slate-800 text-sm font-bold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4 text-[#D9A441]" />
            New Installment Plan
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Plans</span>
            <Clock className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-3xl font-black text-[#111827] mt-2">{activePlansCount}</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Overdue Installments</span>
            <AlertTriangle className="w-5 h-5 text-rose-500" />
          </div>
          <p className="text-3xl font-black text-rose-600 mt-2">{overdueCount}</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Manual Review Required</span>
            <AlertCircle className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-3xl font-black text-amber-600 mt-2">{reviewRequiredCount}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Fisher, NIC, Code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-slate-400"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto">
          {[
            { id: 'ALL', label: 'All Plans' },
            { id: 'ACTIVE', label: 'Active' },
            { id: 'OVERDUE_REVIEW', label: 'Overdue / Review' },
            { id: 'COMPLETED', label: 'Completed' },
            { id: 'CANCELLED', label: 'Cancelled' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                statusFilter === tab.id
                  ? 'bg-[#111827] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Plans List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 font-medium">Loading installment plans...</div>
        ) : error ? (
          <div className="p-12 text-center text-rose-500 font-medium">{error}</div>
        ) : filteredPlans.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-medium">No installment plans found.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredPlans.map((plan) => {
              const isExpanded = expandedPlanId === plan.id;
              const hasManualReview = plan.coverage.isManualReviewRequired;
              const isOverdue = plan.coverage.overdueDuesCount > 0;

              return (
                <div key={plan.id} className="transition-colors hover:bg-slate-50/50">
                  <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Fisher Info */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-[#111827]">{plan.fisherName}</span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                          {plan.fisherCode}
                        </span>
                        <span className="text-xs font-mono text-slate-400">{plan.nicNumber}</span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium">
                        Linked Debt: <span className="font-semibold text-slate-700">{plan.debtDescription || `Debt #${plan.debtId}`}</span>
                      </p>
                    </div>

                    {/* Plan Details */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-medium text-slate-600">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Starting Balance</span>
                        <span className="font-bold text-slate-900">Rs. {plan.startingBalance.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Monthly Installment</span>
                        <span className="font-bold text-slate-900">Rs. {plan.monthlyInstallmentAmount.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">First Due Date</span>
                        <span className="font-bold text-slate-900">{plan.firstDueDate}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Grace Days</span>
                        <span className="font-bold text-slate-900">{plan.gracePeriodDays} days</span>
                      </div>
                    </div>

                    {/* Status Badge & Actions */}
                    <div className="flex items-center gap-3 self-end md:self-center">
                      {hasManualReview ? (
                        <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" /> MANUAL REVIEW
                        </span>
                      ) : isOverdue ? (
                        <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> {plan.coverage.overdueDuesCount} OVERDUE
                        </span>
                      ) : plan.status === 'ACTIVE' ? (
                        <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" /> ACTIVE / CURRENT
                        </span>
                      ) : plan.status === 'COMPLETED' ? (
                        <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" /> COMPLETED
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-slate-100 text-slate-600 border border-slate-300 flex items-center gap-1">
                          <Ban className="w-3.5 h-3.5" /> CANCELLED
                        </span>
                      )}

                      <button
                        onClick={() => setExpandedPlanId(isExpanded ? null : plan.id)}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
                        title="Toggle Dues Schedule"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {plan.status === 'ACTIVE' && (
                        <button
                          onClick={() => {
                            setCancelModalPlan(plan);
                            setCancellationReason('');
                            setCancelError(null);
                          }}
                          className="px-3 py-1 rounded-lg text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
                        >
                          Cancel Plan
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Manual Review Alert */}
                  {hasManualReview && (
                    <div className="mx-5 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                      <div>
                        <span className="font-bold">Clearance Hold (MANUAL_REVIEW_REQUIRED): </span>
                        {plan.coverage.manualReviewReason === 'PRE_PLAN_PAYMENT_REVERSED'
                          ? 'A pre-plan baseline payment was reversed after plan creation. The clearance engine automatically holds clearance until resolved.'
                          : 'This plan is marked completed but the underlying debt balance is non-zero.'}
                      </div>
                    </div>
                  )}

                  {/* Expanded Schedule Drawer */}
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-2 bg-slate-50/70 border-t border-slate-100 space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                        <span>Installment Dues Schedule ({plan.totalDuesCount} installments)</span>
                        {plan.notes && <span className="text-slate-500 font-normal italic">Notes: {plan.notes}</span>}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {plan.coverage.dues.map((due) => (
                          <div
                            key={due.id}
                            className={`p-3 rounded-xl border text-xs space-y-1 ${
                              due.isPaid
                                ? 'bg-emerald-50/50 border-emerald-200'
                                : due.isOverdue
                                ? 'bg-rose-50/50 border-rose-200'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between font-bold">
                              <span>Due #{due.due_sequence}</span>
                              <span className={due.isPaid ? 'text-emerald-700' : due.isOverdue ? 'text-rose-700' : 'text-slate-600'}>
                                {due.isPaid ? 'PAID' : due.isOverdue ? 'OVERDUE' : 'PENDING'}
                              </span>
                            </div>
                            <div className="text-[#111827] font-extrabold text-sm">
                              Rs. {due.amount.toLocaleString()}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Due: <span className="font-semibold text-slate-700">{due.due_date_str}</span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Grace Deadline: {due.effective_overdue_deadline_date_str}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Installment Plan Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h3 className="text-lg font-black text-[#111827]">Create Installment Plan</h3>
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  resetCreateForm();
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreatePlan} className="space-y-4">
              {/* Select Eligible Debt */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Select Fisher Debt *
                </label>
                <select
                  value={selectedDebtId}
                  onChange={(e) => {
                    setSelectedDebtId(e.target.value);
                    setPreviewSchedule(null);
                  }}
                  required
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:border-slate-400"
                >
                  <option value="">-- Select Fisher & Debt --</option>
                  {eligibleDebts.map((d) => (
                    <option key={d.debtId} value={d.debtId} disabled={d.hasActivePlan}>
                      {d.fisherName} ({d.fisherCode}) – {d.description} [Bal: Rs. {d.outstandingBalance.toLocaleString()}]
                      {d.hasActivePlan ? ' (Active Plan Exists)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Monthly Amount & First Due Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Monthly Installment (Rs.) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="e.g. 10000"
                    value={monthlyAmount}
                    onChange={(e) => {
                      setMonthlyAmount(e.target.value);
                      setPreviewSchedule(null);
                    }}
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    First Due Date *
                  </label>
                  <input
                    type="date"
                    value={firstDueDate}
                    onChange={(e) => {
                      setFirstDueDate(e.target.value);
                      setPreviewSchedule(null);
                    }}
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-slate-400"
                  />
                </div>
              </div>

              {/* Grace Days */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Grace Period Days
                </label>
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={graceDays}
                  onChange={(e) => {
                    setGraceDays(e.target.value);
                    setPreviewSchedule(null);
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-slate-400"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Notes / Agreement Reference
                </label>
                <textarea
                  rows="2"
                  placeholder="Optional agreement details or approval notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-slate-400"
                />
              </div>

              {/* Preview Button */}
              <button
                type="button"
                onClick={handlePreviewSchedule}
                className="w-full py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Generate & Preview Schedule
              </button>

              {/* Schedule Preview Display */}
              {previewSchedule && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2 max-h-40 overflow-y-auto">
                  <div className="font-bold text-slate-700">Schedule Preview ({previewSchedule.length} installments):</div>
                  <div className="space-y-1">
                    {previewSchedule.map((due) => (
                      <div key={due.due_sequence} className="flex justify-between font-mono text-[11px] text-slate-600">
                        <span>#{due.due_sequence} – {due.due_date_str} (Deadline: {due.effective_overdue_deadline_date_str})</span>
                        <span className="font-bold text-slate-900">Rs. {due.amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    resetCreateForm();
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-4 py-2 rounded-xl bg-[#111827] text-white hover:bg-slate-800 text-xs font-bold shadow-sm"
                >
                  {createSubmitting ? 'Activating Plan...' : 'Activate Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Plan Confirmation Modal */}
      {cancelModalPlan && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-black text-rose-600 flex items-center gap-2">
              <Ban className="w-5 h-5" /> Cancel Installment Plan
            </h3>

            <p className="text-xs text-slate-600">
              Are you sure you want to cancel the installment plan for{' '}
              <span className="font-bold text-slate-900">{cancelModalPlan.fisherName}</span>?
              <br />
              <span className="text-rose-600 font-semibold block mt-1">
                The underlying debt will immediately return to standard OUTSTANDING_DEBT hold behavior.
              </span>
            </p>

            {cancelError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                {cancelError}
              </div>
            )}

            <form onSubmit={handleCancelPlan} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Cancellation Reason *
                </label>
                <textarea
                  rows="3"
                  required
                  placeholder="State reason for plan cancellation (mandatory)..."
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-slate-400"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCancelModalPlan(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={cancelSubmitting}
                  className="px-4 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-700 text-xs font-bold shadow-sm"
                >
                  {cancelSubmitting ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InstallmentsPage;

