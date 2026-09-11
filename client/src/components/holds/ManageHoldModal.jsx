import React, { useState, useEffect, useCallback } from 'react';
import { X, Loader2, AlertCircle, ShieldAlert, CheckCircle2, RotateCcw, Plus, Lock } from 'lucide-react';
import { createHold, releaseHold, getFisherHolds } from '../../services/holdService';

export const ManageHoldModal = ({ isOpen, onClose, fisher, onHoldUpdated, onSuccess }) => {
  const [holds, setHolds] = useState([]);
  const [loadingHolds, setLoadingHolds] = useState(false);
  const [mode, setMode] = useState('LIST'); // 'LIST' | 'CREATE' | 'RELEASE'

  const [createForm, setCreateForm] = useState({
    reasonCode: 'DOCUMENT_ISSUE',
    reasonText: '',
    notes: '',
  });

  const [selectedHoldToRelease, setSelectedHoldToRelease] = useState(null);
  const [releaseNotes, setReleaseNotes] = useState('');

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchHolds = useCallback(async () => {
    if (!fisher?.id) return;
    try {
      setLoadingHolds(true);
      setError('');
      const data = await getFisherHolds(fisher.id);
      if (data && data.success) {
        setHolds(data.holds || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load manual holds.');
    } finally {
      setLoadingHolds(false);
    }
  }, [fisher]);

  useEffect(() => {
    if (isOpen && fisher) {
      fetchHolds();
      setMode('LIST');
      setError('');
      setCreateForm({ reasonCode: 'DOCUMENT_ISSUE', reasonText: '', notes: '' });
      setSelectedHoldToRelease(null);
      setReleaseNotes('');
    }
  }, [isOpen, fisher, fetchHolds]);

  if (!isOpen || !fisher) return null;

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (createForm.reasonCode === 'OTHER' && !createForm.reasonText.trim()) {
      setError('Reason text is required when selecting OTHER.');
      return;
    }

    try {
      setSubmitting(true);
      await createHold(fisher.id, createForm);
      await fetchHolds();
      if (onHoldUpdated) onHoldUpdated();
      if (onSuccess) onSuccess();
      setMode('LIST');
    } catch (err) {
      setError(err.message || 'Failed to create manual hold.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReleaseSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!releaseNotes.trim()) {
      setError('Release notes are required to release a manual hold.');
      return;
    }

    try {
      setSubmitting(true);
      await releaseHold(selectedHoldToRelease.id, releaseNotes);
      await fetchHolds();
      if (onHoldUpdated) onHoldUpdated();
      if (onSuccess) onSuccess();
      setMode('LIST');
    } catch (err) {
      setError(err.message || 'Failed to release manual hold.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeHoldsList = holds.filter((h) => !h.released_at);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] bg-[#F5F6F8]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-50 border border-red-200 text-red-600">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-[#111827]">Manage Holds</h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                {fisher.full_name} ({fisher.fisher_id})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-[#111827] hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-6 space-y-4">
          
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-red-800 text-xs font-medium">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* LIST MODE */}
          {mode === 'LIST' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#111827] uppercase tracking-wider">
                  Active Holds ({activeHoldsList.length})
                </span>
                <button
                  onClick={() => setMode('CREATE')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] rounded-xl text-xs font-extrabold transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Add Hold</span>
                </button>
              </div>

              {loadingHolds ? (
                <div className="p-6 text-center text-xs font-semibold text-slate-400">
                  Loading hold records...
                </div>
              ) : holds.length === 0 ? (
                <div className="p-8 border border-dashed border-[#E5E7EB] rounded-2xl bg-[#F5F6F8] text-center">
                  <Lock className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-[#111827]">No manual holds on record.</p>
                  <p className="text-[11px] text-[#64748B] mt-0.5">
                    This fisher has no active or historical non-debt manual hold entries.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {holds.map((h) => (
                    <div
                      key={h.id}
                      className={`p-3.5 rounded-2xl border flex items-start justify-between gap-3 text-xs ${
                        h.released_at
                          ? 'bg-slate-50 border-slate-200 text-slate-500'
                          : 'bg-red-50/50 border-red-200 text-[#111827]'
                      }`}
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-[#111827]">
                            {h.reason_code === 'OTHER' ? h.reason_text : h.reason_code.replace('_', ' ')}
                          </span>
                          {h.released_at ? (
                            <span className="px-2 py-0.2 rounded-full bg-slate-200 text-slate-700 text-[10px] font-extrabold">
                              RELEASED
                            </span>
                          ) : (
                            <span className="px-2 py-0.2 rounded-full bg-red-100 text-red-700 text-[10px] font-extrabold">
                              ACTIVE HOLD
                            </span>
                          )}
                        </div>

                        {h.notes && <p className="text-slate-600 text-[11px]">{h.notes}</p>}

                        <div className="text-[10px] text-slate-400 font-medium">
                          Placed by {h.created_by_name || 'Admin'} on{' '}
                          {new Date(h.hold_date).toLocaleDateString('en-GB')}
                        </div>

                        {h.released_at && (
                          <div className="p-2 bg-white rounded-xl border border-slate-200 text-[10px] text-slate-600 mt-1">
                            <span className="font-bold text-slate-800">Released: </span>
                            {h.release_notes} (by {h.released_by_name || 'Admin'})
                          </div>
                        )}
                      </div>

                      {!h.released_at && (
                        <button
                          onClick={() => {
                            setSelectedHoldToRelease(h);
                            setReleaseNotes('');
                            setMode('RELEASE');
                          }}
                          className="px-3 py-1.5 bg-white border border-red-300 hover:bg-red-100 text-red-800 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
                        >
                          Release Hold
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CREATE HOLD MODE */}
          {mode === 'CREATE' && (
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="text-xs font-extrabold text-[#111827]">Add Hold</div>

              <div>
                <label className="block text-xs font-bold text-[#111827] mb-1">
                  Reason <span className="text-red-500">*</span>
                </label>
                <select
                  value={createForm.reasonCode}
                  onChange={(e) => setCreateForm({ ...createForm, reasonCode: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-xs font-bold text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
                >
                  <option value="DOCUMENT_ISSUE">DOCUMENT ISSUE (Expired ID / Boat Papers)</option>
                  <option value="PAYMENT_ISSUE">PAYMENT ISSUE (Unsettled Non-Ledger Fee)</option>
                  <option value="MANAGEMENT_DECISION">MANAGEMENT DECISION (Harbor Administrative Action)</option>
                  <option value="OTHER">OTHER (Specify Reason)</option>
                </select>
              </div>

              {createForm.reasonCode === 'OTHER' && (
                <div>
                  <label className="block text-xs font-bold text-[#111827] mb-1">
                    Reason Details <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={createForm.reasonText}
                    onChange={(e) => setCreateForm({ ...createForm, reasonText: e.target.value })}
                    placeholder="Enter specific reason..."
                    className="w-full px-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#111827] mb-1">Notes</label>
                <textarea
                  rows="3"
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  placeholder="Optional notes"
                  className="w-full px-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setMode('LIST')}
                  disabled={submitting}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-[#111827] border border-[#E5E7EB] rounded-xl text-xs font-bold"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-extrabold transition-all cursor-pointer disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Add Hold</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* RELEASE HOLD MODE */}
          {mode === 'RELEASE' && selectedHoldToRelease && (
            <form onSubmit={handleReleaseSubmit} className="space-y-4">
              <div className="text-xs font-extrabold text-[#111827]">
                Release Hold: {selectedHoldToRelease.reason_code}
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                Enter release notes for audit records.
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111827] mb-1">
                  Release Notes <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows="3"
                  required
                  value={releaseNotes}
                  onChange={(e) => setReleaseNotes(e.target.value)}
                  placeholder="Enter release notes..."
                  className="w-full px-3 py-2 bg-white border border-[#D1D5DB] rounded-xl text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setMode('LIST')}
                  disabled={submitting}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-[#111827] border border-[#E5E7EB] rounded-xl text-xs font-bold"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition-all cursor-pointer disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Release Hold</span>
                  )}
                </button>
              </div>
            </form>
          )}

        </div>

      </div>
    </div>
  );
};
