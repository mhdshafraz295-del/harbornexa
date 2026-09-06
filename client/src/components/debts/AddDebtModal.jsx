import React, { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, Coins, Calendar, FileText, Tag, User } from 'lucide-react';
import { getFishers } from '../../services/fisherService';

export const AddDebtModal = ({ isOpen, onClose, onSubmit, targetFisher = null }) => {
  const [formData, setFormData] = useState({
    fisher_id: targetFisher?.id || '',
    category: 'Harbor Service Charge',
    originalAmount: '',
    debtDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    description: '',
    notes: '',
  });

  const [fishersList, setFishersList] = useState([]);
  const [loadingFishers, setLoadingFishers] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (targetFisher) {
      setFormData((prev) => ({ ...prev, fisher_id: targetFisher.id }));
    } else if (isOpen) {
      // Fetch fishers for selector if no target fisher passed
      const fetchAllFishers = async () => {
        try {
          setLoadingFishers(true);
          const res = await getFishers({ limit: 100 });
          if (res && res.success) {
            setFishersList(res.items || []);
            if (res.items?.length > 0 && !formData.fisher_id) {
              setFormData((prev) => ({ ...prev, fisher_id: res.items[0].id }));
            }
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

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const targetId = targetFisher?.id || formData.fisher_id;
    if (!targetId) {
      setError('Please select a fisher record.');
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

    try {
      setSubmitting(true);
      await onSubmit(targetId, formData);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create debt record.');
    } finally {
      setSubmitting(false);
    }
  };

  const categorySuggestions = [
    'Harbor Service Charge',
    'Previous Arrears',
    'License / Document Fee',
    'Boat Related Charge',
    'Other',
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] bg-[#F5F6F8]">
          <div>
            <h2 className="text-lg font-extrabold text-[#111827]">Add Debt Record</h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Record new harbor charge or arrears for a fisher.
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

          {/* Target Fisher */}
          {targetFisher ? (
            <div className="p-3 rounded-xl bg-[#FFF7D6] border border-[#FFD978] flex items-center justify-between text-xs">
              <span className="font-semibold text-[#111827]">Target Fisher:</span>
              <span className="font-extrabold text-[#111827]">
                {targetFisher.full_name} ({targetFisher.fisher_id})
              </span>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-[#111827] mb-1">
                Select Fisher <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <select
                  name="fisher_id"
                  value={formData.fisher_id}
                  onChange={handleChange}
                  disabled={loadingFishers}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FFD978] cursor-pointer"
                >
                  {fishersList.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.full_name} ({f.fisher_id}) {f.boat_no ? `• Boat: ${f.boat_no}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Category & Suggestions */}
          <div>
            <label className="block text-xs font-bold text-[#111827] mb-1">
              Debt Category <span className="text-red-500">*</span>
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
                placeholder="e.g. Harbor Service Charge"
                className="w-full pl-9 pr-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-sm text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
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
                Debt Date <span className="text-red-500">*</span>
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

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-[#111827] mb-1">Description</label>
            <textarea
              name="description"
              rows="2"
              value={formData.description}
              onChange={handleChange}
              placeholder="e.g. Harbor vessel docking fee for current season"
              className="w-full px-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-sm text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-[#111827] mb-1">Admin Notes</label>
            <textarea
              name="notes"
              rows="2"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Internal remarks or approval reference"
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
                  <span>Adding Debt...</span>
                </>
              ) : (
                <span>Add Debt Record</span>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
