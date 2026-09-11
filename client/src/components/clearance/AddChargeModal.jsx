import React, { useState, useEffect } from 'react';
import { getChargeTypes } from '../../services/chargeTypeService';
import { createDebt } from '../../services/debtService';
import { X, Plus, AlertCircle, Coins, Settings, Calendar } from 'lucide-react';

export const AddChargeModal = ({ isOpen, onClose, fisher, onSuccess, onNavigateToSettings }) => {
  const [chargeTypes, setChargeTypes] = useState([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [amount, setAmount] = useState('');
  const [debtDate, setDebtDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchTypes();
      setSelectedTypeId('');
      setAmount('');
      setDebtDate(new Date().toISOString().split('T')[0]);
      setDueDate('');
      setDescription('');
      setNotes('');
      setError('');
    }
  }, [isOpen]);

  const fetchTypes = async () => {
    try {
      setLoadingTypes(true);
      const res = await getChargeTypes({ activeOnly: 'true' });
      if (res && res.success) {
        setChargeTypes(res.chargeTypes || []);
      }
    } catch (err) {
      console.error('Failed to fetch charge types:', err);
    } finally {
      setLoadingTypes(false);
    }
  };

  const handleTypeChange = (e) => {
    const id = e.target.value;
    setSelectedTypeId(id);
    const selected = chargeTypes.find((ct) => String(ct.id) === String(id));
    if (selected) {
      setAmount(selected.default_amount);
      if (!description && selected.description) {
        setDescription(selected.description);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fisher) return;

    if (!selectedTypeId) {
      setError('Please select a Charge Type.');
      return;
    }

    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount greater than zero.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await createDebt(fisher.id, {
        chargeTypeId: selectedTypeId,
        originalAmount: amount,
        debtDate,
        dueDate: dueDate || null,
        description: description || null,
        notes: notes || null,
      });

      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to create new charge.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
      <div
        className="bg-white rounded-3xl border border-[#E5E7EB] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between bg-[#FFFDF3]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#FFF7D6] text-[#111827]">
              <Coins className="w-5 h-5 text-[#F5B942]" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#111827]">Add Charge</h3>
              <p className="text-xs text-[#64748B]">Enter charge details.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-[#111827] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2.5 text-red-800 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Read-Only Fisher Summary */}
          {fisher && (
            <div className="p-3.5 rounded-2xl bg-[#F5F6F8] border border-[#E5E7EB] flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">Selected Fisher</span>
                <span className="font-extrabold text-[#111827] text-sm">{fisher.full_name}</span>
              </div>
              <div className="text-right">
                <span className="font-mono text-[#D9A441] font-bold block">{fisher.fisher_id}</span>
                <span className="text-[11px] text-[#64748B]">{fisher.boat_no ? `Boat: ${fisher.boat_no}` : 'No Boat'}</span>
              </div>
            </div>
          )}

          {loadingTypes ? (
            <div className="py-8 text-center text-xs text-[#64748B]">Loading charge types...</div>
          ) : chargeTypes.length === 0 ? (
            <div className="p-6 rounded-2xl bg-amber-50/50 border border-amber-200 text-center space-y-3">
              <p className="text-xs font-semibold text-amber-900">No charge types configured.</p>
              {onNavigateToSettings && (
                <button
                  onClick={() => {
                    onClose();
                    onNavigateToSettings();
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] text-xs font-extrabold rounded-xl transition-all shadow-2xs cursor-pointer"
                >
                  <Settings className="w-4 h-4 text-[#111827]" />
                  <span>Configure Charge Types</span>
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Charge Type Dropdown */}
              <div>
                <label className="block text-xs font-bold text-[#111827] mb-1.5">
                  Charge Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedTypeId}
                  onChange={handleTypeChange}
                  required
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#111827] focus:outline-none focus:border-[#F5B942] focus:ring-2 focus:ring-[#FFD978]"
                >
                  <option value="">-- Select Charge Type --</option>
                  {chargeTypes.map((ct) => (
                    <option key={ct.id} value={ct.id}>
                      {ct.name} (Default: Rs. {ct.default_amount})
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount Input */}
              <div>
                <label className="block text-xs font-bold text-[#111827] mb-1.5">
                  Amount (Rs.) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#111827] focus:outline-none focus:border-[#F5B942] focus:ring-2 focus:ring-[#FFD978]"
                />
                <p className="text-[10px] text-[#64748B] mt-1">
                  Adjust default amount if needed.
                </p>
              </div>

              {/* Dates Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#111827] mb-1.5">
                    Debt Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={debtDate}
                    onChange={(e) => setDebtDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-white border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#111827] focus:outline-none focus:border-[#F5B942]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#111827] mb-1.5">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#111827] focus:outline-none focus:border-[#F5B942]"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-[#111827] mb-1.5">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter description"
                  className="w-full px-3.5 py-2 bg-white border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#111827] focus:outline-none focus:border-[#F5B942]"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-[#111827] mb-1.5">Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes"
                  className="w-full px-3.5 py-2 bg-white border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#111827] focus:outline-none focus:border-[#F5B942]"
                />
              </div>

              {/* Buttons */}
              <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#64748B] hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] text-xs font-extrabold rounded-xl transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Add Charge'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
