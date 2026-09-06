import React, { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, Coins, Calendar, CreditCard, FileText, CheckCircle2 } from 'lucide-react';

export const RecordPaymentModal = ({ isOpen, onClose, onSubmit, debt }) => {
  const [formData, setFormData] = useState({
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'CASH',
    referenceNo: '',
    notes: '',
    idempotencyKey: '',
  });

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && debt) {
      // Generate a fresh UUID idempotency key for this payment submission
      const newKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'KEY-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

      setFormData({
        amount: debt.outstanding_amount || '',
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'CASH',
        referenceNo: '',
        notes: '',
        idempotencyKey: newKey,
      });
      setError('');
    }
  }, [isOpen, debt]);

  if (!isOpen || !debt) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const payVal = parseFloat(formData.amount);
    const outVal = parseFloat(debt.outstanding_amount || '0');

    if (isNaN(payVal) || payVal <= 0) {
      setError('Payment amount must be greater than zero.');
      return;
    }

    if (payVal > outVal) {
      setError(`Payment amount (Rs. ${payVal.toFixed(2)}) cannot exceed the outstanding balance (Rs. ${outVal.toFixed(2)}).`);
      return;
    }

    try {
      setSubmitting(true);
      await onSubmit(debt.id, formData);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] bg-[#F5F6F8]">
          <div>
            <h2 className="text-lg font-extrabold text-[#111827]">Record Payment</h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Settle or make a partial payment on fisher debt.
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

        {/* Debt Info Summary Box */}
        <div className="p-4 bg-[#FFF7D6] border-b border-[#FFD978] space-y-2 text-xs">
          <div className="flex items-center justify-between text-[#111827]">
            <span className="font-semibold text-slate-600">Category:</span>
            <span className="font-extrabold">{debt.category}</span>
          </div>
          <div className="flex items-center justify-between text-[#111827]">
            <span className="font-semibold text-slate-600">Fisher:</span>
            <span className="font-extrabold">{debt.full_name} ({debt.custom_fisher_id})</span>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#FFD978]/60 text-center">
            <div className="p-1.5 bg-white/80 rounded-lg">
              <div className="text-[10px] text-slate-500 font-semibold">Original</div>
              <div className="font-bold text-[#111827]">Rs. {debt.original_amount}</div>
            </div>
            <div className="p-1.5 bg-white/80 rounded-lg">
              <div className="text-[10px] text-slate-500 font-semibold">Already Paid</div>
              <div className="font-bold text-emerald-700">Rs. {debt.total_paid}</div>
            </div>
            <div className="p-1.5 bg-white/80 rounded-lg">
              <div className="text-[10px] text-slate-500 font-semibold">Outstanding</div>
              <div className="font-extrabold text-red-700">Rs. {debt.outstanding_amount}</div>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-red-800 text-xs font-medium">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Payment Amount */}
          <div>
            <label className="block text-xs font-bold text-[#111827] mb-1">
              Payment Amount (Rs.) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Coins className="w-4 h-4" />
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={debt.outstanding_amount}
                name="amount"
                required
                value={formData.amount}
                onChange={handleChange}
                placeholder={debt.outstanding_amount}
                className="w-full pl-9 pr-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-sm font-extrabold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Maximum payable: Rs. {debt.outstanding_amount}
            </p>
          </div>

          {/* Grid for Date & Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Payment Date */}
            <div>
              <label className="block text-xs font-bold text-[#111827] mb-1">
                Payment Date <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Calendar className="w-4 h-4" />
                </div>
                <input
                  type="date"
                  name="paymentDate"
                  required
                  value={formData.paymentDate}
                  onChange={handleChange}
                  className="w-full pl-9 pr-2 py-2 bg-white border border-[#D1D5DB] rounded-xl text-xs font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
                />
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-xs font-bold text-[#111827] mb-1">Method</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <CreditCard className="w-4 h-4" />
                </div>
                <select
                  name="paymentMethod"
                  value={formData.paymentMethod}
                  onChange={handleChange}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-xs font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
                >
                  <option value="CASH">CASH</option>
                  <option value="BANK_TRANSFER">BANK TRANSFER</option>
                  <option value="CHEQUE">CHEQUE</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </div>
            </div>

          </div>

          {/* Reference No */}
          <div>
            <label className="block text-xs font-bold text-[#111827] mb-1">Reference / Receipt No</label>
            <input
              type="text"
              name="referenceNo"
              value={formData.referenceNo}
              onChange={handleChange}
              placeholder="e.g. REC-2026-0091"
              className="w-full px-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
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
              placeholder="Optional payment notes"
              className="w-full px-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
            />
          </div>

          {/* Idempotency Protection Indicator */}
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-[10px] text-slate-500">
            <span>Double-submit Protection:</span>
            <span className="font-mono font-bold text-slate-700 tracking-tight line-clamp-1 max-w-[180px]">
              {formData.idempotencyKey}
            </span>
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
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[#111827]" />
                  <span>Record Payment</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
