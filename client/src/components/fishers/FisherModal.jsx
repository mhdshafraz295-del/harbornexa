import React, { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, User, Shield, CreditCard, Phone, Ship, MapPin, FileText } from 'lucide-react';

export const FisherModal = ({ isOpen, onClose, onSubmit, fisher = null }) => {
  const isEditMode = !!fisher;

  const [formData, setFormData] = useState({
    full_name: '',
    nic: '',
    phone: '',
    boat_no: '',
    address: '',
    status: 'ACTIVE',
    notes: '',
  });

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (fisher) {
      setFormData({
        full_name: fisher.full_name || '',
        nic: fisher.nic || '',
        phone: fisher.phone || '',
        boat_no: fisher.boat_no || '',
        address: fisher.address || '',
        status: fisher.status || 'ACTIVE',
        notes: fisher.notes || '',
      });
    } else {
      setFormData({
        full_name: '',
        nic: '',
        phone: '',
        boat_no: '',
        address: '',
        status: 'ACTIVE',
        notes: '',
      });
    }
    setError('');
  }, [fisher, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Quick client-side validation
    if (!formData.full_name.trim()) {
      setError('Full name is required.');
      return;
    }
    if (!formData.nic.trim()) {
      setError('NIC is required.');
      return;
    }

    const nicClean = formData.nic.trim().toUpperCase();
    const isOldNic = /^\d{9}[VX]$/.test(nicClean);
    const isNewNic = /^\d{12}$/.test(nicClean);

    if (!isOldNic && !isNewNic) {
      setError('Invalid Sri Lankan NIC format. Must be 9 digits + V/X (e.g. 991234567V) or 12 digits.');
      return;
    }

    try {
      setSubmitting(true);
      await onSubmit(formData);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save fisher record.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] bg-[#F5F6F8]">
          <div>
            <h2 className="text-lg font-extrabold text-[#111827]">
              {isEditMode ? 'Edit Fisher Record' : 'Register New Fisher'}
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              {isEditMode
                ? `Updating Fisher ID: ${fisher?.fisher_id}`
                : 'Enter fisher identity details for Valachchenai Harbor records.'}
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

          {/* Fisher ID Badge if Editing */}
          {isEditMode && (
            <div className="p-3 rounded-xl bg-[#FFF7D6] border border-[#FFD978] flex items-center justify-between text-xs">
              <span className="font-semibold text-[#111827]">System Fisher ID (Immutable):</span>
              <span className="font-extrabold text-[#111827] tracking-wider px-2 py-0.5 rounded bg-white border border-[#F5B942]">
                {fisher?.fisher_id}
              </span>
            </div>
          )}

          {/* Full Name */}
          <div>
            <label className="block text-xs font-bold text-[#111827] mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                name="full_name"
                required
                value={formData.full_name}
                onChange={handleChange}
                placeholder="e.g. Kadiramarthamby Rifan"
                className="w-full pl-9 pr-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-sm text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978] focus:border-[#F5B942]"
              />
            </div>
          </div>

          {/* Grid for NIC & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* NIC */}
            <div>
              <label className="block text-xs font-bold text-[#111827] mb-1">
                Sri Lankan NIC <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <CreditCard className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  name="nic"
                  required
                  value={formData.nic}
                  onChange={handleChange}
                  placeholder="e.g. 991234567V or 200527001738"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-sm text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978] focus:border-[#F5B942]"
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-bold text-[#111827] mb-1">Phone Number</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="e.g. 0771234567"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-sm text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978] focus:border-[#F5B942]"
                />
              </div>
            </div>
          </div>

          {/* Grid for Boat No & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Boat No */}
            <div>
              <label className="block text-xs font-bold text-[#111827] mb-1">Boat Number</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Ship className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  name="boat_no"
                  value={formData.boat_no}
                  onChange={handleChange}
                  placeholder="e.g. IMULA-A-0123"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-sm text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978] focus:border-[#F5B942]"
                />
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-bold text-[#111827] mb-1">Initial Status</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Shield className="w-4 h-4" />
                </div>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FFD978] focus:border-[#F5B942] cursor-pointer"
                >
                  <option value="ACTIVE">ACTIVE (Cleared)</option>
                  <option value="BLOCKED">BLOCKED (Restricted)</option>
                  <option value="PENDING">PENDING (Verification)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-bold text-[#111827] mb-1">Home Address</label>
            <div className="relative">
              <div className="absolute top-2.5 left-0 pl-3 flex items-start pointer-events-none text-slate-400">
                <MapPin className="w-4 h-4" />
              </div>
              <textarea
                name="address"
                rows="2"
                value={formData.address}
                onChange={handleChange}
                placeholder="e.g. Main Street, Valachchenai, Batticaloa"
                className="w-full pl-9 pr-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-sm text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978] focus:border-[#F5B942]"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-[#111827] mb-1">Admin Notes</label>
            <div className="relative">
              <div className="absolute top-2.5 left-0 pl-3 flex items-start pointer-events-none text-slate-400">
                <FileText className="w-4 h-4" />
              </div>
              <textarea
                name="notes"
                rows="2"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Optional notes or remarks"
                className="w-full pl-9 pr-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-sm text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978] focus:border-[#F5B942]"
              />
            </div>
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
              className="flex items-center gap-2 px-5 py-2 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] rounded-xl text-xs font-extrabold transition-all shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#FFD978] cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#111827]" />
                  <span>{isEditMode ? 'Saving Changes...' : 'Adding Fisher...'}</span>
                </>
              ) : (
                <span>{isEditMode ? 'Save Changes' : 'Add Fisher'}</span>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
