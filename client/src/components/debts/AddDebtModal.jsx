import React, { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, Coins, Calendar, FileText, Tag, User, CalendarClock, Search, CheckCircle2 } from 'lucide-react';
import { getFishers } from '../../services/fisherService';

export const AddDebtModal = ({ isOpen, onClose, onSubmit, targetFisher = null }) => {
  const [formData, setFormData] = useState({
    fisher_id: targetFisher?.id || '',
    category: 'Fisher Loan (மீனவர் லோன்)',
    originalAmount: '',
    debtDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    description: '',
    notes: '',
  });

  const [enableInstallment, setEnableInstallment] = useState(false);
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [firstDueDate, setFirstDueDate] = useState('');
  const [graceDays, setGraceDays] = useState('0');

  const [fishersList, setFishersList] = useState([]);
  const [loadingFishers, setLoadingFishers] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // NIC Search & Selected Fisher State
  const [nicQuery, setNicQuery] = useState('');
  const [selectedFisher, setSelectedFisher] = useState(targetFisher || null);
  const [showFisherDropdown, setShowFisherDropdown] = useState(false);

  useEffect(() => {
    if (targetFisher) {
      setSelectedFisher(targetFisher);
      setFormData((prev) => ({ ...prev, fisher_id: targetFisher.id }));
      setNicQuery(targetFisher.nic || targetFisher.full_name || '');
    } else if (isOpen) {
      setSelectedFisher(null);
      setNicQuery('');
      setShowFisherDropdown(false);
      // Fetch fishers for selector
      const fetchAllFishers = async () => {
        try {
          setLoadingFishers(true);
          const res = await getFishers({ limit: 100 });
          if (res && res.success) {
            setFishersList(res.items || []);
          }
        } catch (err) {
          console.error(err);
        } finally {
          setLoadingFishers(false);
        }
      };
      fetchAllFishers();
    }
    setError('');
  }, [isOpen, targetFisher]);

  // Server-side live search when user types NIC or Name
  useEffect(() => {
    if (!isOpen || selectedFisher || !nicQuery.trim() || nicQuery.trim().length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const res = await getFishers({ search: nicQuery.trim(), limit: 30 });
        if (res && res.success && res.items) {
          setFishersList((prev) => {
            const map = new Map(prev.map((f) => [f.id, f]));
            res.items.forEach((f) => map.set(f.id, f));
            return Array.from(map.values());
          });
        }
      } catch (err) {
        console.error('Fisher search error:', err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [nicQuery, isOpen, selectedFisher]);

  if (!isOpen) return null;

  const handleSelectFisher = (fisher) => {
    setSelectedFisher(fisher);
    setFormData((prev) => ({ ...prev, fisher_id: fisher.id }));
    setNicQuery(fisher.nic || fisher.full_name);
    setShowFisherDropdown(false);
    if (error) setError('');
  };

  const handleClearSelectedFisher = () => {
    setSelectedFisher(null);
    setFormData((prev) => ({ ...prev, fisher_id: '' }));
    setNicQuery('');
    setShowFisherDropdown(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const targetId = selectedFisher?.id || targetFisher?.id || formData.fisher_id;
    if (!targetId) {
      setError('Please search and select a fisher using NIC or name.');
      return;
    }
    if (!formData.category.trim()) {
      setError('Category is required.');
      return;
    }
    if (!formData.originalAmount || parseFloat(formData.originalAmount) <= 0) {
      setError('Debt amount must be greater than zero.');
      return;
    }

    if (enableInstallment) {
      if (!monthlyAmount || parseFloat(monthlyAmount) <= 0) {
        setError('Valid monthly installment amount is required.');
        return;
      }
      if (!firstDueDate) {
        setError('First installment due date is required.');
        return;
      }
    }

    const payload = {
      ...formData,
      enableInstallmentPlan: enableInstallment,
      monthlyInstallmentAmount: enableInstallment ? parseFloat(monthlyAmount) : undefined,
      firstDueDate: enableInstallment ? firstDueDate : undefined,
      graceDays: enableInstallment ? parseInt(graceDays, 10) || 0 : undefined,
    };

    try {
      setSubmitting(true);
      await onSubmit(targetId, payload);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create debt/loan record.');
    } finally {
      setSubmitting(false);
    }
  };

  const categorySuggestions = [
    'Fisher Loan (மீனவர் லோன்)',
    'Harbor Service Charge',
    'Previous Arrears',
    'License / Document Fee',
    'Boat Related Charge',
    'Other',
  ];

  // Filter local fishers list by nicQuery
  const q = nicQuery.trim().toLowerCase();
  const filteredFishers = fishersList.filter((f) => {
    if (!q) return true;
    return (
      (f.nic && f.nic.toLowerCase().includes(q)) ||
      (f.full_name && f.full_name.toLowerCase().includes(q)) ||
      (f.fisher_id && f.fisher_id.toLowerCase().includes(q)) ||
      (f.boat_no && f.boat_no.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] bg-[#F5F6F8]">
          <div>
            <h2 className="text-lg font-extrabold text-[#111827]">Add Debt / Fisher Loan</h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Enter loan or debt details and optional monthly installment plan.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-[#111827] hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-red-800 text-xs font-medium">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Fisher Section with NIC Search & Auto-fill */}
          {selectedFisher ? (
            <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-emerald-800 font-extrabold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Fisher Identified (மீனவர் விபரம் கண்டறியப்பட்டது)</span>
                </div>
                {!targetFisher && (
                  <button
                    type="button"
                    onClick={handleClearSelectedFisher}
                    className="text-[11px] font-bold text-slate-500 hover:text-red-600 underline cursor-pointer"
                  >
                    Change / மாற்றவும்
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs border-t border-emerald-200/60">
                <div>
                  <span className="text-slate-500 block text-[10px]">பெயர் (Name):</span>
                  <span className="font-extrabold text-[#111827]">{selectedFisher.full_name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">NIC எண்:</span>
                  <span className="font-mono font-extrabold text-emerald-900 bg-white/70 px-1.5 py-0.5 rounded border border-emerald-200/80 inline-block">
                    {selectedFisher.nic || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Fisher ID:</span>
                  <span className="font-bold text-slate-700">{selectedFisher.fisher_id}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">படகு எண் (Boat No):</span>
                  <span className="font-bold text-slate-700">{selectedFisher.boat_no || 'N/A'}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative">
              <label className="block text-xs font-bold text-[#111827] mb-1">
                Search Fisher by NIC / Name (NIC அல்லது பெயர் மூலம் தேடவும்) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={nicQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNicQuery(val);
                    setShowFisherDropdown(true);
                    // If exact NIC match is typed, auto-select immediately
                    const exact = fishersList.find(
                      (f) => f.nic && f.nic.toLowerCase() === val.trim().toLowerCase()
                    );
                    if (exact) {
                      handleSelectFisher(exact);
                    }
                  }}
                  onFocus={() => setShowFisherDropdown(true)}
                  placeholder="Type NIC number (e.g. 1990...) or Fisher Name..."
                  className="w-full pl-9 pr-8 py-2 bg-white border border-[#D1D5DB] rounded-xl text-sm font-medium text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
                />
                {nicQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setNicQuery('');
                      setShowFisherDropdown(false);
                    }}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Live Filtered Dropdown */}
              {showFisherDropdown && (
                <div className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl divide-y divide-slate-100">
                  {filteredFishers.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">
                      {loadingFishers ? 'Searching fishers...' : 'No fisher found with this NIC / Name.'}
                    </div>
                  ) : (
                    filteredFishers.slice(0, 15).map((f) => (
                      <div
                        key={f.id}
                        onClick={() => handleSelectFisher(f)}
                        className="p-3 hover:bg-[#FFF7D6] cursor-pointer transition-colors text-xs flex items-center justify-between"
                      >
                        <div>
                          <div className="font-extrabold text-[#111827]">{f.full_name}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span>ID: <strong className="text-slate-700">{f.fisher_id}</strong></span>
                            {f.boat_no && <span>• Boat: <strong className="text-slate-700">{f.boat_no}</strong></span>}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-mono font-bold text-[11px] border border-slate-200">
                            NIC: {f.nic || 'N/A'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Category & Suggestions */}
          <div>
            <label className="block text-xs font-bold text-[#111827] mb-1">
              Category <span className="text-red-500">*</span>
            </label>
            <div className="relative mb-2">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Tag className="w-4 h-4" />
              </div>
              <input
                type="text"
                name="category"
                required
                value={formData.category}
                onChange={handleChange}
                placeholder="Enter category"
                className="w-full pl-9 pr-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-sm font-semibold text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
              />
            </div>
            {/* Quick Suggestions Chips */}
            <div className="flex flex-wrap gap-1.5">
              {categorySuggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, category: sug }))}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                    formData.category === sug
                      ? 'bg-[#FFF7D6] border-[#FFD978] text-[#111827]'
                      : 'bg-[#F5F6F8] border-[#E5E7EB] text-slate-600 hover:bg-white'
                  }`}
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          {/* Original Amount & Dates Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            {/* Amount */}
            <div>
              <label className="block text-xs font-bold text-[#111827] mb-1">
                Amount (Rs.) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Coins className="w-4 h-4" />
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  name="originalAmount"
                  required
                  value={formData.originalAmount}
                  onChange={handleChange}
                  placeholder="10000.00"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-sm font-extrabold text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
                />
              </div>
            </div>

            {/* Debt Date */}
            <div>
              <label className="block text-xs font-bold text-[#111827] mb-1">
                Date <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Calendar className="w-4 h-4" />
                </div>
                <input
                  type="date"
                  name="debtDate"
                  required
                  value={formData.debtDate}
                  onChange={handleChange}
                  className="w-full pl-9 pr-2 py-2 bg-white border border-[#D1D5DB] rounded-xl text-xs font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
                />
              </div>
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-xs font-bold text-[#111827] mb-1">Due Date</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Calendar className="w-4 h-4" />
                </div>
                <input
                  type="date"
                  name="dueDate"
                  value={formData.dueDate}
                  onChange={handleChange}
                  className="w-full pl-9 pr-2 py-2 bg-white border border-[#D1D5DB] rounded-xl text-xs font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
                />
              </div>
            </div>

          </div>

          {/* Monthly Installment Option Section */}
          <div className="p-4 rounded-xl border border-[#FFD978] bg-[#FFFDF5] space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enableInstallment}
                onChange={(e) => {
                  setEnableInstallment(e.target.checked);
                  if (e.target.checked && !firstDueDate) {
                    // Default to next month same day or 30 days ahead
                    const d = new Date();
                    d.setMonth(d.getMonth() + 1);
                    setFirstDueDate(d.toISOString().split('T')[0]);
                  }
                }}
                className="w-4 h-4 rounded text-[#D9A441] focus:ring-[#FFD978] cursor-pointer"
              />
              <span className="text-xs font-black text-[#111827] flex items-center gap-1.5">
                <CalendarClock className="w-4 h-4 text-[#B45309]" />
                Set Monthly Installment Plan (மாதாந்திர தவணை திட்டம் அமைக்க)
              </span>
            </label>

            {enableInstallment && (
              <div className="space-y-3 pt-2 border-t border-[#FFD978]/60">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#111827] mb-1">
                      Monthly Amount (Rs.) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={monthlyAmount}
                      onChange={(e) => setMonthlyAmount(e.target.value)}
                      placeholder="e.g. 5000"
                      required={enableInstallment}
                      className="w-full px-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-xs font-bold text-[#111827] focus:ring-2 focus:ring-[#FFD978]"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">மாதம் எவ்வளவு தருவார்</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#111827] mb-1">
                      First Due Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={firstDueDate}
                      onChange={(e) => setFirstDueDate(e.target.value)}
                      required={enableInstallment}
                      className="w-full px-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-xs font-bold text-[#111827] focus:ring-2 focus:ring-[#FFD978]"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">முதல் தவணை தொடங்கும் தேதி</p>
                  </div>
                </div>

                {/* Real-time Calculation Summary */}
                {formData.originalAmount && monthlyAmount && Number(monthlyAmount) > 0 && Number(formData.originalAmount) > 0 && (
                  <div className="p-2.5 bg-white rounded-lg border border-[#FFD978] text-xs space-y-1">
                    <div className="flex items-center justify-between text-[#111827]">
                      <span className="text-slate-600 font-semibold">Total Loan:</span>
                      <span className="font-extrabold">
                        Rs. {Number(formData.originalAmount).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[#111827]">
                      <span className="text-slate-600 font-semibold">Monthly Installment:</span>
                      <span className="font-extrabold text-emerald-700">
                        Rs. {Number(monthlyAmount).toLocaleString('en-LK', { minimumFractionDigits: 2 })} / month
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[#111827]">
                      <span className="text-slate-600 font-semibold">Installment Duration:</span>
                      <span className="font-extrabold text-[#B45309]">
                        {Math.ceil(Number(formData.originalAmount) / Number(monthlyAmount))} Months
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-[#111827] mb-1">Description</label>
            <textarea
              name="description"
              rows="2"
              value={formData.description}
              onChange={handleChange}
              placeholder="Enter description"
              className="w-full px-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-sm text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-[#111827] mb-1">Notes</label>
            <textarea
              name="notes"
              rows="2"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Optional notes"
              className="w-full px-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-sm text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5E7EB]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-[#111827] border border-[#E5E7EB] rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] rounded-xl text-xs font-extrabold transition-all shadow-2xs cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#111827]" />
                  <span>Adding...</span>
                </>
              ) : (
                <span>Add Debt</span>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
