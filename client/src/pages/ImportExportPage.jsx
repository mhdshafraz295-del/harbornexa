import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Upload,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  Filter,
  RefreshCw,
  Users,
  CreditCard,
  Receipt,
  ShieldAlert,
  Ban,
  ArrowRight,
} from 'lucide-react';
import exportService from '../services/exportService';

export const ImportExportPage = () => {
  const [activeTab, setActiveTab] = useState('export'); // 'export' | 'import'

  // Import State
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewResult, setPreviewResult] = useState(null);
  const [previewFilter, setPreviewFilter] = useState('ALL'); // 'ALL' | 'VALID' | 'INVALID'
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccessMessage, setImportSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Export Filters State
  const [activeSearch, setActiveSearch] = useState('');
  const [blockedSearch, setBlockedSearch] = useState('');

  const [fisherSearch, setFisherSearch] = useState('');
  const [fisherStatus, setFisherStatus] = useState('');

  const [debtSearch, setDebtSearch] = useState('');
  const [debtStatus, setDebtStatus] = useState('');

  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentStartDate, setPaymentStartDate] = useState('');
  const [paymentEndDate, setPaymentEndDate] = useState('');

  const [clearanceSearch, setClearanceSearch] = useState('');
  const [clearanceStatus, setClearanceStatus] = useState('');
  const [clearanceStartDate, setClearanceStartDate] = useState('');
  const [clearanceEndDate, setClearanceEndDate] = useState('');

  const [blockSearch, setBlockSearch] = useState('');
  const [blockStatus, setBlockStatus] = useState('');

  const [downloadingModule, setDownloadingModule] = useState(null); // 'active-fishers-pdf', 'blocked-fishers-csv', etc.

  // ----------------------------------------------------
  // Import Handlers
  // ----------------------------------------------------
  const handleDownloadTemplate = async () => {
    try {
      setErrorMessage('');
      await exportService.downloadImportTemplate();
    } catch (err) {
      setErrorMessage(err.message || 'Failed to download template.');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewResult(null);
      setImportSuccessMessage('');
      setErrorMessage('');
    }
  };

  const handlePreviewUpload = async () => {
    if (!selectedFile) return;
    try {
      setIsUploading(true);
      setErrorMessage('');
      setImportSuccessMessage('');
      const data = await exportService.previewFisherImport(selectedFile);
      setPreviewResult(data);
    } catch (err) {
      setErrorMessage(err.message || 'Error processing uploaded spreadsheet.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!previewResult || previewResult.validCount === 0) return;
    try {
      setIsImporting(true);
      setErrorMessage('');
      const validData = previewResult.previewRows
        .filter((r) => r.status === 'VALID')
        .map((r) => r.validatedData);

      const res = await exportService.confirmFisherImport(validData);
      setImportSuccessMessage(res.message || `Successfully imported ${res.count} fishers.`);
      setSelectedFile(null);
      setPreviewResult(null);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to import fishers.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadErrors = async () => {
    if (!previewResult) return;
    try {
      const invalidRows = previewResult.previewRows.filter((r) => r.status !== 'VALID');
      await exportService.downloadErrorReport(invalidRows);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to download error log.');
    }
  };

  // ----------------------------------------------------
  // Export Handlers
  // ----------------------------------------------------
  const handleExport = async (moduleName, format, exportFn, params) => {
    const key = `${moduleName}-${format}`;
    try {
      setDownloadingModule(key);
      setErrorMessage('');
      await exportFn({ ...params, format });
    } catch (err) {
      setErrorMessage(err.message || `Failed to export ${moduleName}.`);
    } finally {
      setDownloadingModule(null);
    }
  };

  const filteredPreviewRows = previewResult
    ? previewResult.previewRows.filter((r) => {
        if (previewFilter === 'VALID') return r.status === 'VALID';
        if (previewFilter === 'INVALID') return r.status !== 'VALID';
        return true;
      })
    : [];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#FFF7D6] border border-[#FFD978] flex items-center justify-center text-[#111827] shrink-0">
              <FileSpreadsheet className="w-6 h-6 text-[#F5B942]" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-[#111827] tracking-tight">
                Import & Export Data Center
              </h1>
              <p className="text-xs text-[#64748B] mt-0.5">
                Export production reports or batch import fishers.
              </p>
            </div>
          </div>

          {/* Tab Controls */}
          <div className="flex items-center bg-[#F5F6F8] p-1 rounded-xl border border-[#E5E7EB] shrink-0">
            <button
              onClick={() => setActiveTab('export')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'export'
                  ? 'bg-white text-[#111827] shadow-2xs border border-[#E5E7EB]'
                  : 'text-[#64748B] hover:text-[#111827]'
              }`}
            >
              <Download className="w-4 h-4 text-[#F5B942]" />
              <span>Export Reports</span>
            </button>
            <button
              onClick={() => setActiveTab('import')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'import'
                  ? 'bg-white text-[#111827] shadow-2xs border border-[#E5E7EB]'
                  : 'text-[#64748B] hover:text-[#111827]'
              }`}
            >
              <Upload className="w-4 h-4 text-[#F5B942]" />
              <span>Fisher Import</span>
            </button>
          </div>
        </div>
      </div>

      {/* Alert Banner for Messages */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold flex items-center gap-2.5">
          <XCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {importSuccessMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{importSuccessMessage}</span>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 1: EXPORT REPORTS (ALL ROWS) */}
      {/* ==================================================== */}
      {activeTab === 'export' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Active Fishers Report */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-2xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-3 border-b border-[#E5E7EB] pb-3">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#111827]">Active Fishers Report</h3>
                  <p className="text-[11px] text-[#64748B]">Fishers with CLEARED status.</p>
                </div>
              </div>

              {/* Filters */}
              <div className="mt-4">
                <label className="text-[11px] font-bold text-[#475569] block mb-1">Search</label>
                <input
                  type="text"
                  value={activeSearch}
                  onChange={(e) => setActiveSearch(e.target.value)}
                  placeholder="Name, NIC, Fisher ID, Boat..."
                  className="w-full text-xs px-3 py-2 rounded-xl border border-[#E5E7EB] focus:outline-none focus:border-[#F5B942]"
                />
              </div>
            </div>

            {/* Export Action Buttons */}
            <div className="pt-3 border-t border-[#E5E7EB] flex items-center justify-end gap-2">
              <button
                disabled={downloadingModule === 'active-fishers-pdf'}
                onClick={() => handleExport('active-fishers', 'pdf', exportService.exportActiveFishers, { search: activeSearch })}
                className="px-3.5 py-2 text-xs font-bold rounded-xl bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{downloadingModule === 'active-fishers-pdf' ? 'Generating PDF...' : 'PDF'}</span>
              </button>
              <button
                disabled={downloadingModule === 'active-fishers-csv'}
                onClick={() => handleExport('active-fishers', 'csv', exportService.exportActiveFishers, { search: activeSearch })}
                className="px-3.5 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {/* Card 2: Blocked Fishers (BCL) Report */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-2xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-3 border-b border-[#E5E7EB] pb-3">
                <div className="p-2 rounded-xl bg-red-50 text-red-700">
                  <ShieldAlert className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#111827]">Blocked Fishers (BCL) Report</h3>
                  <p className="text-[11px] text-[#64748B]">Fishers with BLC / HOLD status.</p>
                </div>
              </div>

              {/* Filters */}
              <div className="mt-4">
                <label className="text-[11px] font-bold text-[#475569] block mb-1">Search</label>
                <input
                  type="text"
                  value={blockedSearch}
                  onChange={(e) => setBlockedSearch(e.target.value)}
                  placeholder="Name, NIC, Fisher ID, Boat..."
                  className="w-full text-xs px-3 py-2 rounded-xl border border-[#E5E7EB] focus:outline-none focus:border-[#F5B942]"
                />
              </div>
            </div>

            {/* Export Action Buttons */}
            <div className="pt-3 border-t border-[#E5E7EB] flex items-center justify-end gap-2">
              <button
                disabled={downloadingModule === 'blocked-fishers-pdf'}
                onClick={() => handleExport('blocked-fishers', 'pdf', exportService.exportBlockedFishers, { search: blockedSearch })}
                className="px-3.5 py-2 text-xs font-bold rounded-xl bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{downloadingModule === 'blocked-fishers-pdf' ? 'Generating PDF...' : 'PDF'}</span>
              </button>
              <button
                disabled={downloadingModule === 'blocked-fishers-csv'}
                onClick={() => handleExport('blocked-fishers', 'csv', exportService.exportBlockedFishers, { search: blockedSearch })}
                className="px-3.5 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {/* Card 3: Debt Records */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-2xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-3 border-b border-[#E5E7EB] pb-3">
                <div className="p-2 rounded-xl bg-[#FFF7D6] text-[#111827]">
                  <CreditCard className="w-5 h-5 text-[#F5B942]" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#111827]">Debt Records Report</h3>
                  <p className="text-[11px] text-[#64748B]">Outstanding charges (மீதிக் கடன்), payments, and balances.</p>
                </div>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                <div>
                  <label className="text-[11px] font-bold text-[#475569] block mb-1">Search</label>
                  <input
                    type="text"
                    value={debtSearch}
                    onChange={(e) => setDebtSearch(e.target.value)}
                    placeholder="Debt Code, Fisher, Charge..."
                    className="w-full text-xs px-3 py-2 rounded-xl border border-[#E5E7EB] focus:outline-none focus:border-[#F5B942]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#475569] block mb-1">Status</label>
                  <select
                    value={debtStatus}
                    onChange={(e) => setDebtStatus(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-[#E5E7EB] focus:outline-none focus:border-[#F5B942]"
                  >
                    <option value="">All Statuses</option>
                    <option value="UNPAID">UNPAID</option>
                    <option value="PARTIAL">PARTIAL</option>
                    <option value="PAID">PAID</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Export Action Buttons */}
            <div className="pt-3 border-t border-[#E5E7EB] flex items-center justify-end gap-2">
              <button
                disabled={downloadingModule === 'debts-pdf'}
                onClick={() => handleExport('debts', 'pdf', exportService.exportDebts, { search: debtSearch, status: debtStatus })}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{downloadingModule === 'debts-pdf' ? 'Generating PDF...' : 'PDF'}</span>
              </button>
              <button
                disabled={downloadingModule === 'debts-excel'}
                onClick={() => handleExport('debts', 'excel', exportService.exportDebts, { search: debtSearch, status: debtStatus })}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{downloadingModule === 'debts-excel' ? 'Exporting...' : 'Excel (.xlsx)'}</span>
              </button>
              <button
                disabled={downloadingModule === 'debts-csv'}
                onClick={() => handleExport('debts', 'csv', exportService.exportDebts, { search: debtSearch, status: debtStatus })}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {/* Card 3: Payments Collection */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-2xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-3 border-b border-[#E5E7EB] pb-3">
                <div className="p-2 rounded-xl bg-[#FFF7D6] text-[#111827]">
                  <Receipt className="w-5 h-5 text-[#F5B942]" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#111827]">Payment Collection Report</h3>
                  <p className="text-[11px] text-[#64748B]">Log of payments collected from fishers.</p>
                </div>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                <div>
                  <label className="text-[11px] font-bold text-[#475569] block mb-1">Search</label>
                  <input
                    type="text"
                    value={paymentSearch}
                    onChange={(e) => setPaymentSearch(e.target.value)}
                    placeholder="Receipt, Fisher..."
                    className="w-full text-xs px-3 py-2 rounded-xl border border-[#E5E7EB] focus:outline-none focus:border-[#F5B942]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#475569] block mb-1">From Date</label>
                  <input
                    type="date"
                    value={paymentStartDate}
                    onChange={(e) => setPaymentStartDate(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-[#E5E7EB] focus:outline-none focus:border-[#F5B942]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#475569] block mb-1">To Date</label>
                  <input
                    type="date"
                    value={paymentEndDate}
                    onChange={(e) => setPaymentEndDate(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-[#E5E7EB] focus:outline-none focus:border-[#F5B942]"
                  />
                </div>
              </div>
            </div>

            {/* Export Action Buttons */}
            <div className="pt-3 border-t border-[#E5E7EB] flex items-center justify-end gap-2">
              <button
                disabled={downloadingModule === 'payments-pdf'}
                onClick={() => handleExport('payments', 'pdf', exportService.exportPayments, { search: paymentSearch, startDate: paymentStartDate, endDate: paymentEndDate })}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{downloadingModule === 'payments-pdf' ? 'Generating PDF...' : 'PDF'}</span>
              </button>
              <button
                disabled={downloadingModule === 'payments-excel'}
                onClick={() => handleExport('payments', 'excel', exportService.exportPayments, { search: paymentSearch, startDate: paymentStartDate, endDate: paymentEndDate })}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{downloadingModule === 'payments-excel' ? 'Exporting...' : 'Excel (.xlsx)'}</span>
              </button>
              <button
                disabled={downloadingModule === 'payments-csv'}
                onClick={() => handleExport('payments', 'csv', exportService.exportPayments, { search: paymentSearch, startDate: paymentStartDate, endDate: paymentEndDate })}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {/* Card 4: Clearance Issuance */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-2xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-3 border-b border-[#E5E7EB] pb-3">
                <div className="p-2 rounded-xl bg-[#FFF7D6] text-[#111827]">
                  <CheckCircle2 className="w-5 h-5 text-[#F5B942]" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#111827]">Clearance History Report</h3>
                  <p className="text-[11px] text-[#64748B]">Log of clearances granted to fishers.</p>
                </div>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                <div>
                  <label className="text-[11px] font-bold text-[#475569] block mb-1">Search</label>
                  <input
                    type="text"
                    value={clearanceSearch}
                    onChange={(e) => setClearanceSearch(e.target.value)}
                    placeholder="Clearance No, Fisher..."
                    className="w-full text-xs px-3 py-2 rounded-xl border border-[#E5E7EB] focus:outline-none focus:border-[#F5B942]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#475569] block mb-1">From Date</label>
                  <input
                    type="date"
                    value={clearanceStartDate}
                    onChange={(e) => setClearanceStartDate(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-[#E5E7EB] focus:outline-none focus:border-[#F5B942]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#475569] block mb-1">To Date</label>
                  <input
                    type="date"
                    value={clearanceEndDate}
                    onChange={(e) => setClearanceEndDate(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-[#E5E7EB] focus:outline-none focus:border-[#F5B942]"
                  />
                </div>
              </div>
            </div>

            {/* Export Action Buttons */}
            <div className="pt-3 border-t border-[#E5E7EB] flex items-center justify-end gap-2">
              <button
                disabled={downloadingModule === 'clearances-pdf'}
                onClick={() => handleExport('clearances', 'pdf', exportService.exportClearances, { search: clearanceSearch, startDate: clearanceStartDate, endDate: clearanceEndDate })}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{downloadingModule === 'clearances-pdf' ? 'Generating PDF...' : 'PDF'}</span>
              </button>
              <button
                disabled={downloadingModule === 'clearances-excel'}
                onClick={() => handleExport('clearances', 'excel', exportService.exportClearances, { search: clearanceSearch, startDate: clearanceStartDate, endDate: clearanceEndDate })}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{downloadingModule === 'clearances-excel' ? 'Exporting...' : 'Excel (.xlsx)'}</span>
              </button>
              <button
                disabled={downloadingModule === 'clearances-csv'}
                onClick={() => handleExport('clearances', 'csv', exportService.exportClearances, { search: clearanceSearch, startDate: clearanceStartDate, endDate: clearanceEndDate })}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {/* Card 5: Block & Hold History */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-2xs md:col-span-2 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-3 border-b border-[#E5E7EB] pb-3">
                <div className="p-2 rounded-xl bg-[#FFF7D6] text-[#111827]">
                  <Ban className="w-5 h-5 text-[#F5B942]" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#111827]">Block & Hold History Report</h3>
                  <p className="text-[11px] text-[#64748B]">History of holds applied or released.</p>
                </div>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                <div>
                  <label className="text-[11px] font-bold text-[#475569] block mb-1">Search</label>
                  <input
                    type="text"
                    value={blockSearch}
                    onChange={(e) => setBlockSearch(e.target.value)}
                    placeholder="Reason, Fisher Name, NIC..."
                    className="w-full text-xs px-3 py-2 rounded-xl border border-[#E5E7EB] focus:outline-none focus:border-[#F5B942]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#475569] block mb-1">Status</label>
                  <select
                    value={blockStatus}
                    onChange={(e) => setBlockStatus(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-[#E5E7EB] focus:outline-none focus:border-[#F5B942]"
                  >
                    <option value="">All Holds</option>
                    <option value="ACTIVE">ACTIVE HOLDS ONLY</option>
                    <option value="RELEASED">RELEASED HOLDS ONLY</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Export Action Buttons */}
            <div className="pt-3 border-t border-[#E5E7EB] flex items-center justify-end gap-2">
              <button
                disabled={downloadingModule === 'block-history-pdf'}
                onClick={() => handleExport('block-history', 'pdf', exportService.exportBlockHistory, { search: blockSearch, status: blockStatus })}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{downloadingModule === 'block-history-pdf' ? 'Generating PDF...' : 'PDF'}</span>
              </button>
              <button
                disabled={downloadingModule === 'block-history-excel'}
                onClick={() => handleExport('block-history', 'excel', exportService.exportBlockHistory, { search: blockSearch, status: blockStatus })}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{downloadingModule === 'block-history-excel' ? 'Exporting...' : 'Excel (.xlsx)'}</span>
              </button>
              <button
                disabled={downloadingModule === 'block-history-csv'}
                onClick={() => handleExport('block-history', 'csv', exportService.exportBlockHistory, { search: blockSearch, status: blockStatus })}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 2: BATCH FISHER IMPORT */}
      {/* ==================================================== */}
      {activeTab === 'import' && (
        <div className="space-y-6">
          {/* Step 1 & 2: Template & Upload Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Step 1: Download Template Card */}
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-7 h-7 rounded-xl bg-[#FFF7D6] flex items-center justify-center font-black text-xs text-[#111827]">
                    1
                  </div>
                  <h3 className="text-sm font-extrabold text-[#111827]">Download Template</h3>
                </div>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  Excel template with standard column headers: Full Name, NIC, Phone Number, Boat Number, Address, Status, Notes.
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-[#E5E7EB]">
                <button
                  onClick={handleDownloadTemplate}
                  className="w-full py-2.5 rounded-xl bg-[#FFF7D6] border border-[#FFD978] text-[#111827] text-xs font-bold hover:bg-[#FFEFA6] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-[#F5B942]" />
                  <span>Download Template (.xlsx)</span>
                </button>
              </div>
            </div>

            {/* Step 2: Upload File Card */}
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-7 h-7 rounded-xl bg-[#FFF7D6] flex items-center justify-center font-black text-xs text-[#111827]">
                    2
                  </div>
                  <h3 className="text-sm font-extrabold text-[#111827]">Upload Spreadsheet</h3>
                </div>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  Select `.xlsx`, `.xls`, or `.csv` file for automated NIC and phone validation.
                </p>
              </div>

              <div className="mt-4 space-y-3">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  className="block w-full text-xs text-[#64748B] file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#F5F6F8] file:text-[#111827] hover:file:bg-[#E5E7EB] cursor-pointer"
                />

                <button
                  disabled={!selectedFile || isUploading}
                  onClick={handlePreviewUpload}
                  className="w-full py-2.5 rounded-xl bg-[#111827] text-white text-xs font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isUploading ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-[#F5B942]" />
                  ) : (
                    <FileCheck className="w-4 h-4 text-[#F5B942]" />
                  )}
                  <span>{isUploading ? 'Validating...' : 'Validate & Preview'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Step 3: Preview Table & Validation Summary */}
          {previewResult && (
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-2xs space-y-5 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E7EB] pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-[#111827]">Import Preview</h3>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Review validated rows before final database commit.
                  </p>
                </div>

                {/* Validation Metrics Badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1 rounded-xl bg-slate-100 text-slate-800 font-bold text-xs border border-slate-200">
                    Total: {previewResult.totalRows}
                  </span>
                  <span className="px-3 py-1 rounded-xl bg-emerald-50 text-emerald-800 font-bold text-xs border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Valid: {previewResult.validCount}
                  </span>
                  {previewResult.invalidCount > 0 && (
                    <span className="px-3 py-1 rounded-xl bg-red-50 text-red-800 font-bold text-xs border border-red-200 flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5 text-red-600" />
                      Invalid: {previewResult.invalidCount}
                    </span>
                  )}
                  {previewResult.duplicateCount > 0 && (
                    <span className="px-3 py-1 rounded-xl bg-amber-50 text-amber-800 font-bold text-xs border border-amber-200 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      Duplicates: {previewResult.duplicateCount}
                    </span>
                  )}
                </div>
              </div>

              {/* Table Controls & Filter */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-bold text-[#475569]">Filter Preview:</span>
                  <div className="flex bg-[#F5F6F8] p-0.5 rounded-lg border border-[#E5E7EB]">
                    <button
                      onClick={() => setPreviewFilter('ALL')}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                        previewFilter === 'ALL' ? 'bg-white text-[#111827] shadow-2xs' : 'text-[#64748B]'
                      }`}
                    >
                      All ({previewResult.previewRows.length})
                    </button>
                    <button
                      onClick={() => setPreviewFilter('VALID')}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                        previewFilter === 'VALID' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-[#64748B]'
                      }`}
                    >
                      Valid Only ({previewResult.validCount})
                    </button>
                    <button
                      onClick={() => setPreviewFilter('INVALID')}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                        previewFilter === 'INVALID' ? 'bg-white text-red-700 shadow-2xs' : 'text-[#64748B]'
                      }`}
                    >
                      Errors / Duplicates ({previewResult.invalidCount + previewResult.duplicateCount})
                    </button>
                  </div>
                </div>

                {/* Download Errors Button if any errors exist */}
                {(previewResult.invalidCount > 0 || previewResult.duplicateCount > 0) && (
                  <button
                    onClick={handleDownloadErrors}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Error Report (.csv)</span>
                  </button>
                )}
              </div>

              {/* Preview Table */}
              <div className="overflow-x-auto rounded-xl border border-[#E5E7EB]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8FAFC] text-[#475569] font-extrabold uppercase border-b border-[#E5E7EB]">
                    <tr>
                      <th className="px-4 py-3">Row #</th>
                      <th className="px-4 py-3">Full Name</th>
                      <th className="px-4 py-3">NIC</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3">Boat No.</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB]">
                    {filteredPreviewRows.map((item) => (
                      <tr
                        key={item.rowIndex}
                        className={
                          item.status === 'VALID'
                            ? 'hover:bg-emerald-50/40'
                            : item.status === 'DUPLICATE'
                            ? 'bg-amber-50/30 hover:bg-amber-50/60'
                            : 'bg-red-50/30 hover:bg-red-50/60'
                        }
                      >
                        <td className="px-4 py-3 font-mono font-bold text-slate-500">{item.rowIndex}</td>
                        <td className="px-4 py-3 font-bold text-[#111827]">{item.validatedData?.full_name || '-'}</td>
                        <td className="px-4 py-3 font-mono font-semibold">{item.validatedData?.nic || item.rawData?.NIC || '-'}</td>
                        <td className="px-4 py-3">{item.validatedData?.phone || '-'}</td>
                        <td className="px-4 py-3">{item.validatedData?.boat_no || '-'}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-800">
                            {item.validatedData?.status || 'ACTIVE'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {item.status === 'VALID' ? (
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded text-[11px]">
                              <CheckCircle2 className="w-3 h-3" /> Ready for Import
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              <span
                                className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded text-[11px] ${
                                  item.status === 'DUPLICATE'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                <XCircle className="w-3 h-3" /> {item.status}
                              </span>
                              <p className="text-[10px] text-red-600 font-medium">
                                {Array.isArray(item.errors) ? item.errors.join('; ') : item.errors}
                              </p>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-[#E5E7EB]">
                <button
                  onClick={() => {
                    setPreviewResult(null);
                    setSelectedFile(null);
                  }}
                  className="px-4 py-2 text-xs font-bold rounded-xl border border-[#E5E7EB] text-[#475569] hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  disabled={previewResult.validCount === 0 || isImporting}
                  onClick={handleConfirmImport}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  {isImporting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  <span>{isImporting ? 'Importing...' : `Import ${previewResult.validCount} Fishers`}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImportExportPage;
