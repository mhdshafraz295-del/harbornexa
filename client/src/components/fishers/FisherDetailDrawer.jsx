import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  User,
  CreditCard,
  Phone,
  Ship,
  MapPin,
  FileText,
  Calendar,
  Clock,
  Edit,
  Archive,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Receipt,
  Plus,
  Coins,
  Lock,
  ChevronDown,
  ChevronUp,
  QrCode,
} from 'lucide-react';
import { getFisherFinancialInfo } from '../../services/debtService';
import { getQrStatus, generateQrToken, revokeQrToken } from '../../services/qrService';
import { getFisherHolds } from '../../services/holdService';
import { ViewQrModal } from '../qr/ViewQrModal';

export const FisherDetailDrawer = ({
  isOpen,
  onClose,
  fisher,
  onEdit,
  onArchive,
  onRestore,
  onAddDebt,
  onRecordPayment,
  onManageHold,
}) => {
  const [financialData, setFinancialData] = useState(null);
  const [loadingFinancials, setLoadingFinancials] = useState(false);
  const [expandedDebtId, setExpandedDebtId] = useState(null);

  // Holds State
  const [holdsList, setHoldsList] = useState([]);

  // QR State
  const [qrInfo, setQrInfo] = useState({ isIssued: false, activeToken: null });
  const [loadingQr, setLoadingQr] = useState(false);
  const [isViewQrModalOpen, setIsViewQrModalOpen] = useState(false);
  const [currentRawToken, setCurrentRawToken] = useState(null);
  const [isReissueConfirmOpen, setIsReissueConfirmOpen] = useState(false);

  const fetchFinancials = useCallback(async () => {
    if (!fisher?.id) return;
    try {
      setLoadingFinancials(true);
      const data = await getFisherFinancialInfo(fisher.id);
      if (data && data.success) {
        setFinancialData(data);
      }
    } catch (err) {
      console.error('Failed to load fisher financial info:', err);
    } finally {
      setLoadingFinancials(false);
    }
  }, [fisher]);

  const fetchHolds = useCallback(async () => {
    if (!fisher?.id) return;
    try {
      const data = await getFisherHolds(fisher.id);
      if (data && data.success) {
        setHoldsList(data.holds || []);
      }
    } catch (err) {
      console.error('Failed to load fisher holds:', err);
    }
  }, [fisher]);

  const fetchQrInfo = useCallback(async () => {
    if (!fisher?.id) return;
    try {
      setLoadingQr(true);
      const data = await getQrStatus(fisher.id);
      if (data && data.success) {
        setQrInfo({ isIssued: data.isIssued, activeToken: data.activeToken });
      }
    } catch (err) {
      console.error('Failed to load QR status:', err);
    } finally {
      setLoadingQr(false);
    }
  }, [fisher]);

  useEffect(() => {
    if (isOpen && fisher) {
      fetchFinancials();
      fetchHolds();
      fetchQrInfo();
    } else {
      setFinancialData(null);
      setHoldsList([]);
      setQrInfo({ isIssued: false, activeToken: null });
      setCurrentRawToken(null);
      setIsReissueConfirmOpen(false);
    }
  }, [isOpen, fisher, fetchFinancials, fetchHolds, fetchQrInfo]);

  const handleGenerateQr = async () => {
    if (!fisher?.id || loadingQr) return;
    if (fisher.is_archived) {
      alert('QR unavailable for archived Fisher.');
      return;
    }
    try {
      setLoadingQr(true);
      const data = await generateQrToken(fisher.id);
      if (data && data.success) {
        setCurrentRawToken(data.rawToken);
        setIsViewQrModalOpen(true);
        fetchQrInfo();
      } else {
        alert(data?.message || 'Failed to generate QR token.');
      }
    } catch (err) {
      alert(err.message || 'Failed to generate QR token.');
    } finally {
      setLoadingQr(false);
    }
  };

  const handleConfirmReissue = async () => {
    setIsReissueConfirmOpen(false);
    await handleGenerateQr();
  };

  if (!isOpen || !fisher) return null;

  const formatDate = (isoString) => {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    return (
      date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ' at ' +
      date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    );
  };

  const clearance = financialData?.clearanceStatus;

  const getEffectiveStatusBadge = () => {
    if (fisher.is_archived || clearance?.status === 'NOT_ELIGIBLE') {
      return (
        <span className="px-2.5 py-1 rounded-full bg-slate-100 border border-slate-300 text-slate-700 text-xs font-extrabold flex items-center gap-1">
          <Archive className="w-3.5 h-3.5 text-slate-500" />
          <span>NOT ELIGIBLE</span>
        </span>
      );
    }
    if (clearance?.status === 'HOLD') {
      return (
        <span className="px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-extrabold flex items-center gap-1">
          <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
          <span>HOLD</span>
        </span>
      );
    }
    if (clearance?.status === 'PENDING') {
      return (
        <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-extrabold flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <span>PENDING</span>
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-extrabold flex items-center gap-1">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
        <span>CLEARED</span>
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white h-full shadow-2xl border-l border-[#E5E7EB] flex flex-col z-10 animate-in slide-in-from-right duration-300">
        
        {/* Drawer Header */}
        <div className="px-6 py-5 border-b border-[#E5E7EB] bg-[#F5F6F8] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#FFF7D6] border border-[#FFD978] text-[#F5B942]">
              <User className="w-6 h-6 text-[#111827]" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-[#111827] line-clamp-1">
                {fisher.full_name}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-extrabold text-[#64748B] tracking-wider">
                  {fisher.fisher_id}
                </span>
                {getEffectiveStatusBadge()}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-[#111827] hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Clearance Reasons Banner if on HOLD */}
          {clearance?.status === 'HOLD' && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 space-y-2 text-xs text-red-900">
              <div className="flex items-center gap-2 font-extrabold text-red-700">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Clearance Restricted</span>
              </div>
              <ul className="list-disc pl-5 space-y-1 font-semibold text-[11px]">
                {clearance.reasons.map((r, i) => (
                  <li key={i}>{r.label}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Financial Summary Card */}
          <div className="bg-[#F5F6F8] border border-[#E5E7EB] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-[#64748B] uppercase tracking-wider">
                Financial Summary
              </h3>
              <span className="text-[10px] font-bold text-slate-500">Real-time DB</span>
            </div>

            {loadingFinancials ? (
              <div className="h-16 bg-slate-200/60 rounded-xl animate-pulse" />
            ) : (
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2.5 bg-white rounded-xl border border-[#E5E7EB]">
                  <div className="text-[10px] text-slate-500 font-bold">Total Debt</div>
                  <div className="font-extrabold text-[#111827] mt-0.5">
                    Rs. {financialData?.financialSummary?.totalDebt || '0.00'}
                  </div>
                </div>

                <div className="p-2.5 bg-white rounded-xl border border-[#E5E7EB]">
                  <div className="text-[10px] text-slate-500 font-bold">Total Paid</div>
                  <div className="font-extrabold text-emerald-700 mt-0.5">
                    Rs. {financialData?.financialSummary?.totalPaid || '0.00'}
                  </div>
                </div>

                <div className="p-2.5 bg-white rounded-xl border border-[#E5E7EB]">
                  <div className="text-[10px] text-slate-500 font-bold">Outstanding</div>
                  <div className="font-extrabold text-red-700 mt-0.5">
                    Rs. {financialData?.financialSummary?.outstandingDebt || '0.00'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Identity & Contact Details Card */}
          <div className="bg-[#F5F6F8] border border-[#E5E7EB] rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-extrabold text-[#64748B] uppercase tracking-wider">
              Fisher Details
            </h3>

            <div className="space-y-2.5 text-xs text-[#111827]">
              <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-[#E5E7EB]">
                <div className="flex items-center gap-2 text-[#64748B]">
                  <CreditCard className="w-4 h-4 text-slate-400" />
                  <span className="font-semibold">NIC:</span>
                </div>
                <span className="font-extrabold tracking-wider">{fisher.nic}</span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-[#E5E7EB]">
                <div className="flex items-center gap-2 text-[#64748B]">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span className="font-semibold">Phone:</span>
                </div>
                <span className="font-extrabold">{fisher.phone || 'Not provided'}</span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-[#E5E7EB]">
                <div className="flex items-center gap-2 text-[#64748B]">
                  <Ship className="w-4 h-4 text-slate-400" />
                  <span className="font-semibold">Boat No.:</span>
                </div>
                <span className="font-extrabold">{fisher.boat_no || 'Not assigned'}</span>
              </div>

              {fisher.address && (
                <div className="p-2.5 rounded-xl bg-white border border-[#E5E7EB] space-y-1">
                  <div className="flex items-center gap-2 text-[#64748B]">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold">Address:</span>
                  </div>
                  <p className="text-xs text-[#111827] font-medium pl-6">{fisher.address}</p>
                </div>
              )}
            </div>
          </div>

          {/* Secure QR Identification Card Section */}
          <div className="bg-[#F5F6F8] border border-[#E5E7EB] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#64748B] uppercase tracking-wider">
                <QrCode className="w-4 h-4 text-[#F5B942]" />
                <span>QR Identification</span>
              </div>

              {fisher.is_archived ? (
                <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-slate-500 text-[10px] font-extrabold">
                  DISABLED
                </span>
              ) : qrInfo.isIssued ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-extrabold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  <span>ISSUED</span>
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-slate-600 text-[10px] font-extrabold">
                  NOT ISSUED
                </span>
              )}
            </div>

            {fisher.is_archived ? (
              <div className="p-3 bg-white border border-slate-200 rounded-xl text-center">
                <p className="text-xs font-semibold text-slate-500">
                  QR unavailable for archived fisher.
                </p>
              </div>
            ) : loadingQr ? (
              <div className="h-12 bg-slate-200/60 rounded-xl animate-pulse" />
            ) : qrInfo.isIssued ? (
              <div className="space-y-3">
                {qrInfo.activeToken && (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-[#E5E7EB] text-xs">
                    <span className="text-slate-500 font-semibold">Issued Date:</span>
                    <span className="font-extrabold text-[#111827]">
                      {qrInfo.activeToken.issued_at || qrInfo.activeToken.created_at
                        ? new Date(qrInfo.activeToken.issued_at || qrInfo.activeToken.created_at).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'Active'}
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setIsReissueConfirmOpen(true)}
                  disabled={loadingQr}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] rounded-xl text-xs font-extrabold transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reissue QR</span>
                </button>
              </div>
            ) : (
              <div className="p-3 bg-white border border-dashed border-[#E5E7EB] rounded-xl text-center space-y-2">
                <p className="text-xs font-bold text-slate-600">No active QR card issued.</p>
                <button
                  type="button"
                  onClick={handleGenerateQr}
                  disabled={loadingQr}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] rounded-xl text-xs font-extrabold transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>Generate QR</span>
                </button>
              </div>
            )}
          </div>

          {/* Manual Holds & History Card */}
          <div className="bg-[#F5F6F8] border border-[#E5E7EB] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-[#64748B] uppercase tracking-wider">
                Manual Holds
              </h3>
            </div>

            {/* Active Holds */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                <span>Active Holds</span>
                <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[10px] font-extrabold">
                  {holdsList.filter((h) => !h.released_at).length} Active
                </span>
              </div>

              {holdsList.filter((h) => !h.released_at).length === 0 ? (
                <div className="p-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-500 italic text-center">
                  No active manual holds.
                </div>
              ) : (
                holdsList
                  .filter((h) => !h.released_at)
                  .map((h) => (
                    <div key={h.id} className="p-3 bg-white border border-red-200 rounded-xl space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-red-700">
                          {h.reason_code === 'OTHER' ? h.reason_text || 'Other' : h.reason_code}
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold">
                          {formatDate(h.hold_date)}
                        </span>
                      </div>
                      {h.notes && <p className="text-[11px] text-slate-600 italic">Notes: {h.notes}</p>}
                    </div>
                  ))
              )}
            </div>

            {/* Hold History */}
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <div className="text-[11px] font-bold text-slate-700">Hold History</div>
              {holdsList.length === 0 ? (
                <div className="p-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-500 italic text-center">
                  No hold history.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {holdsList.map((h) => (
                    <div key={h.id} className="p-2.5 bg-white border border-[#E5E7EB] rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-[#111827]">
                          {h.reason_code === 'OTHER' ? h.reason_text || 'Other' : h.reason_code}
                        </span>
                        {h.released_at ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-extrabold">
                            RELEASED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[10px] font-extrabold">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500">Held: {formatDate(h.hold_date)}</div>
                      {h.released_at && (
                        <div className="text-[10px] text-emerald-800 font-medium">
                          Released: {formatDate(h.released_at)} {h.release_notes ? `• ${h.release_notes}` : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Debts & Payment History Card */}
          <div className="bg-[#F5F6F8] border border-[#E5E7EB] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-[#64748B] uppercase tracking-wider">
                Debts & Payments
              </h3>
            </div>

            {financialData?.debts?.length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {financialData.debts.map((d) => (
                  <div key={d.id} className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden text-xs">
                    <div
                      onClick={() => setExpandedDebtId(expandedDebtId === d.id ? null : d.id)}
                      className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-50"
                    >
                      <div>
                        <div className="font-extrabold text-[#111827]">{d.category}</div>
                        <div className="text-[10px] text-slate-400">
                          Orig: Rs. {d.original_amount} • Out: Rs. {d.outstanding_amount}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          d.status === 'PAID'
                            ? 'bg-emerald-50 text-emerald-700'
                            : d.status === 'PARTIALLY_PAID'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-red-50 text-red-700'
                        }`}>
                          {d.status}
                        </span>
                        {expandedDebtId === d.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </div>

                    {expandedDebtId === d.id && (
                      <div className="p-3 border-t border-slate-100 bg-slate-50 space-y-2 text-[11px]">
                        <div className="font-bold text-slate-700">Payment Ledger:</div>
                        {d.payments.length === 0 ? (
                          <div className="text-slate-400 italic">No payments recorded for this debt.</div>
                        ) : (
                          d.payments.map((p) => (
                            <div key={p.id} className="p-2 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                              <div>
                                <span className="font-extrabold text-emerald-700">Rs. {p.amount}</span>
                                <span className="text-slate-500 ml-2 font-medium">({p.payment_method})</span>
                                {p.reversed_at && (
                                  <span className="ml-2 text-red-600 font-extrabold">
                                    [REVERSED: {p.reversal_reason}]
                                  </span>
                                )}
                              </div>
                              <span className="text-slate-400 text-[10px]">
                                {new Date(p.payment_date).toLocaleDateString('en-GB')}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-slate-500 font-medium">
                No debt records.
              </div>
            )}
          </div>

          {/* Registration Timestamps */}
          <div className="bg-[#F5F6F8] border border-[#E5E7EB] rounded-2xl p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between text-[#64748B]">
              <span className="flex items-center gap-1.5 font-medium">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Created:
              </span>
              <span className="font-bold text-[#111827]">{formatDate(fisher.created_at)}</span>
            </div>

            <div className="flex items-center justify-between text-[#64748B]">
              <span className="flex items-center gap-1.5 font-medium">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Updated:
              </span>
              <span className="font-bold text-[#111827]">{formatDate(fisher.updated_at)}</span>
            </div>
          </div>

        </div>

        {/* Drawer Footer Actions */}
        <div className="p-4 border-t border-[#E5E7EB] bg-white flex flex-col gap-2">
          <button
            onClick={() => {
              onClose();
              window.location.href = `/admin/clearance?fisherId=${fisher.id}`;
            }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-[#FFF7D6] hover:bg-[#FFD978] text-[#111827] border border-[#FFD978] rounded-xl text-xs font-extrabold cursor-pointer transition-colors"
          >
            <ShieldCheck className="w-4 h-4 text-[#D9A441]" />
            <span>View Clearance</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                onClose();
                if (onAddDebt) onAddDebt(fisher);
              }}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] rounded-xl text-xs font-extrabold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Debt</span>
            </button>

            <button
              onClick={() => {
                onClose();
                if (onManageHold) onManageHold(fisher);
              }}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-[#E5E7EB] hover:bg-red-50 text-red-800 rounded-xl text-xs font-extrabold cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>Manage Hold</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onEdit(fisher);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-[#111827] rounded-xl text-xs font-bold cursor-pointer"
            >
              <Edit className="w-4 h-4" />
              <span>Edit</span>
            </button>

            {fisher.is_archived ? (
              <button
                onClick={() => {
                  onRestore(fisher.id);
                  onClose();
                }}
                className="px-3 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-extrabold cursor-pointer"
              >
                Restore
              </button>
            ) : (
              <button
                onClick={() => {
                  onArchive(fisher.id);
                  onClose();
                }}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Archive
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Reissue Confirmation Modal */}
      {isReissueConfirmOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="p-2 bg-amber-50 rounded-xl border border-amber-200">
                <RotateCcw className="w-6 h-6" />
              </div>
              <h3 className="text-base font-extrabold text-[#111827]">Reissue QR Card</h3>
            </div>

            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              Reissuing deactivates the current QR card. Continue?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsReissueConfirmOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReissue}
                disabled={loadingQr}
                className="px-4 py-2 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] rounded-xl text-xs font-extrabold transition-colors cursor-pointer"
              >
                {loadingQr ? 'Reissuing...' : 'Reissue QR'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ViewQrModal
        isOpen={isViewQrModalOpen}
        onClose={() => {
          setIsViewQrModalOpen(false);
          setCurrentRawToken(null);
        }}
        fisher={fisher}
        rawToken={currentRawToken}
        onReissue={() => setIsReissueConfirmOpen(true)}
      />
    </div>
  );
};
