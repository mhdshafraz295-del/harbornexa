import React, { useState, useEffect } from 'react';
import {
  getChargeTypes,
  createChargeType,
  updateChargeType,
  activateChargeType,
  deactivateChargeType,
} from '../services/chargeTypeService';
import { Settings as SettingsIcon, Plus, Edit2, Check, X, AlertCircle, RefreshCw, ToggleLeft, ToggleRight, Coins } from 'lucide-react';

export const SettingsPage = () => {
  const [chargeTypes, setChargeTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal / Form state for Add/Edit Charge Type
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [name, setName] = useState('');
  const [defaultAmount, setDefaultAmount] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  const fetchChargeTypes = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await getChargeTypes();
      if (res && res.success) {
        setChargeTypes(res.chargeTypes || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load charge types.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChargeTypes();
  }, []);

  const handleOpenAddModal = () => {
    setEditingType(null);
    setName('');
    setDefaultAmount('');
    setDescription('');
    setIsActive(true);
    setModalError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (ct) => {
    setEditingType(ct);
    setName(ct.name);
    setDefaultAmount(ct.default_amount);
    setDescription(ct.description || '');
    setIsActive(Boolean(ct.is_active));
    setModalError('');
    setIsModalOpen(true);
  };

  const handleToggleActive = async (ct) => {
    try {
      if (ct.is_active) {
        await deactivateChargeType(ct.id);
      } else {
        await activateChargeType(ct.id);
      }
      fetchChargeTypes();
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to update charge type status.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name || !name.trim()) {
      setModalError('Charge type name is required.');
      return;
    }

    if (!defaultAmount || isNaN(defaultAmount) || parseFloat(defaultAmount) <= 0) {
      setModalError('Valid default amount is required.');
      return;
    }

    try {
      setSubmitting(true);
      setModalError('');

      if (editingType) {
        await updateChargeType(editingType.id, {
          name: name.trim(),
          defaultAmount,
          description: description ? description.trim() : null,
          isActive,
        });
      } else {
        await createChargeType({
          name: name.trim(),
          defaultAmount,
          description: description ? description.trim() : null,
          isActive,
        });
      }

      setIsModalOpen(false);
      fetchChargeTypes();
    } catch (err) {
      setModalError(err.response?.data?.message || err.message || 'Failed to save charge type.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E7EB] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight">Settings</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-[#FFF7D6] border border-[#FFD978] text-[11px] font-extrabold text-[#111827]">
              System Configuration
            </span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-[#64748B]">
            Configure system parameters and charge types.
          </p>
        </div>

        <button
          onClick={fetchChargeTypes}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-[#FFF7D6] text-[#111827] border border-[#E5E7EB] hover:border-[#FFD978] rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#F5B942] ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Charge Types Section Card */}
      <div className="bg-white rounded-3xl border border-[#E5E7EB] p-6 shadow-2xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E7EB] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#FFF7D6] text-[#111827]">
              <Coins className="w-5 h-5 text-[#F5B942]" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#111827]">Charge Types</h2>
              <p className="text-xs text-[#64748B]">Manage trip fee categories and default amounts.</p>
            </div>
          </div>

          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] rounded-xl text-xs font-extrabold transition-all shadow-2xs cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Charge Type</span>
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-xs text-[#64748B]">Loading charge types...</div>
        ) : chargeTypes.length === 0 ? (
          <div className="p-12 text-center bg-[#F5F6F8] rounded-2xl border border-[#E5E7EB] space-y-2">
            <p className="text-xs font-extrabold text-[#111827]">No charge types configured.</p>
            <p className="text-[11px] text-[#64748B]">
              Add a charge type to record trip fees.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5E7EB] text-[10px] font-extrabold text-[#64748B] uppercase">
                  <th className="py-3 px-3">Charge Type</th>
                  <th className="py-3 px-3">Default Amount</th>
                  <th className="py-3 px-3">Description</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {chargeTypes.map((ct) => (
                  <tr key={ct.id} className="hover:bg-[#FFFDF3]">
                    <td className="py-3 px-3 font-extrabold text-[#111827]">{ct.name}</td>
                    <td className="py-3 px-3 font-mono font-bold text-[#111827]">Rs. {ct.default_amount}</td>
                    <td className="py-3 px-3 text-[#64748B] max-w-xs truncate">{ct.description || 'N/A'}</td>
                    <td className="py-3 px-3">
                      <button
                        onClick={() => handleToggleActive(ct)}
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase transition-all cursor-pointer ${
                          ct.is_active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {ct.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => handleOpenEditModal(ct)}
                        className="p-1.5 text-slate-500 hover:text-[#111827] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        title="Edit Charge Type"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Charge Type Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl border border-[#E5E7EB] shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <h3 className="text-base font-extrabold text-[#111827]">
                {editingType ? 'Edit Charge Type' : 'Add Charge Type'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-[#111827] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#111827] mb-1.5">
                  Charge Type <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Departure Fee"
                  required
                  className="w-full px-3.5 py-2 bg-white border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#111827] focus:outline-none focus:border-[#F5B942]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111827] mb-1.5">
                  Default Amount (Rs.) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={defaultAmount}
                  onChange={(e) => setDefaultAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full px-3.5 py-2 bg-white border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#111827] focus:outline-none focus:border-[#F5B942]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111827] mb-1.5">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description"
                  className="w-full px-3.5 py-2 bg-white border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#111827] focus:outline-none focus:border-[#F5B942]"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold text-[#111827]">Status</span>
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className={`px-3 py-1 rounded-full text-xs font-extrabold cursor-pointer transition-colors ${
                    isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'
                  }`}
                >
                  {isActive ? 'Active' : 'Inactive'}
                </button>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-[#64748B] hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] text-xs font-extrabold rounded-xl transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
