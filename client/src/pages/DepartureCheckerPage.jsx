import React, { useState } from 'react';
import {
  FileCheck,
  Upload,
  X,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  FileText,
  RefreshCw,
  ShieldAlert,
  Cpu,
} from 'lucide-react';
import { checkDeparturePdfs } from '../services/departureCheckerService';

export const DepartureCheckerPage = () => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [batchResult, setBatchResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    setErrorMessage('');

    if (files.length === 0) return;

    // Filter only PDF files
    const validPdfFiles = files.filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );

    if (validPdfFiles.length < files.length) {
      setErrorMessage('Some non-PDF files were excluded. Only PDF files are supported.');
    }

    if (selectedFiles.length + validPdfFiles.length > 5) {
      setErrorMessage('Maximum 5 PDF files are allowed per batch.');
      const allowedCount = 5 - selectedFiles.length;
      if (allowedCount > 0) {
        setSelectedFiles((prev) => [...prev, ...validPdfFiles.slice(0, allowedCount)]);
      }
    } else {
      setSelectedFiles((prev) => [...prev, ...validPdfFiles]);
    }

    // Reset file input value
    e.target.value = '';
  };

  const handleRemoveFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setErrorMessage('');
  };

  const handleClearAll = () => {
    setSelectedFiles([]);
    setBatchResult(null);
    setErrorMessage('');
    setProcessingStep('');
  };

  const handleUploadAndCheck = async () => {
    if (selectedFiles.length === 0) return;

    if (selectedFiles.length > 5) {
      setErrorMessage('Maximum 5 PDF files per batch allowed.');
      return;
    }

    try {
      setIsProcessing(true);
      setErrorMessage('');
      
      setProcessingStep('Reading PDFs & Extracting NICs...');
      await new Promise((r) => setTimeout(r, 200));

      setProcessingStep('Checking Live BLC Status in Database...');
      const data = await checkDeparturePdfs(selectedFiles);

      setProcessingStep('Completed');
      setBatchResult(data);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to process Departure PDFs.');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] shadow-2xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#FFF7D6] text-[#F5B942]">
              <FileCheck className="w-5 h-5 text-[#111827]" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-[#111827] tracking-tight">Departure PDF Checker</h1>
              <p className="text-xs text-[#64748B] font-medium mt-0.5">
                Upload up to 5 DFAR Departure Manifest PDFs to automatically verify Fisher BLC & clearance status.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
            <Cpu className="w-4 h-4 text-emerald-600" />
            <span>In-Memory Batch Processing</span>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-start gap-3 text-xs font-bold animate-fadeIn">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
          <div className="flex-1">{errorMessage}</div>
          <button onClick={() => setErrorMessage('')} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Upload Box */}
      <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] shadow-2xs space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-[#111827] flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#F5B942]" />
            <span>Upload Departure PDFs (1 to 5 PDFs)</span>
          </h2>

          {selectedFiles.length > 0 && (
            <button
              onClick={handleClearAll}
              disabled={isProcessing}
              className="text-xs font-bold text-slate-500 hover:text-red-600 transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Dropzone */}
        {selectedFiles.length < 5 && (
          <label className="border-2 border-dashed border-[#E5E7EB] hover:border-[#F5B942] bg-[#F5F6F8]/50 hover:bg-[#FFFDF3] rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 text-center">
            <div className="w-12 h-12 rounded-full bg-[#FFF7D6] border border-[#FFD978] flex items-center justify-center text-[#111827] mb-3">
              <FileText className="w-6 h-6 text-[#111827]" />
            </div>
            <p className="text-sm font-bold text-[#111827]">
              Click to select or drag & drop Departure PDFs
            </p>
            <p className="text-xs text-[#64748B] mt-1 font-medium">
              Only PDF files accepted. Maximum 5 PDF files per batch.
            </p>
            <input
              type="file"
              accept="application/pdf,.pdf"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              disabled={isProcessing}
            />
          </label>
        )}

        {/* Selected Files List */}
        {selectedFiles.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-[#64748B]">Selected Files ({selectedFiles.length}/5):</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {selectedFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-xl bg-[#F5F6F8] border border-[#E5E7EB] text-xs font-bold text-[#111827]"
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <FileText className="w-4 h-4 text-[#F5B942] shrink-0" />
                    <span className="truncate">{file.name}</span>
                    <span className="text-[10px] text-[#64748B] font-medium shrink-0">
                      ({(file.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                  {!isProcessing && (
                    <button
                      onClick={() => handleRemoveFile(idx)}
                      className="text-slate-400 hover:text-red-600 transition-colors p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Processing Steps Status */}
            {isProcessing && (
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold flex items-center gap-2 animate-pulse">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                <span>{processingStep}</span>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleUploadAndCheck}
                disabled={isProcessing}
                className="px-6 py-2.5 rounded-xl bg-[#FFD978] hover:bg-[#F5B942] border border-[#F5B942] text-[#111827] text-xs font-extrabold shadow-2xs transition-all duration-200 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-[#111827]" />
                    <span>Processing Batch...</span>
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4 text-[#111827]" />
                    <span>Check All PDFs</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Results Section */}
      {batchResult && (
        <div className="space-y-6 animate-fadeIn">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-2xs">
              <p className="text-xs font-bold text-[#64748B]">PDFs Checked</p>
              <p className="text-2xl font-black text-[#111827] mt-1">
                {batchResult.summary?.pdfCount || batchResult.summary?.totalFiles}
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-2xs">
              <p className="text-xs font-bold text-[#64748B]">NICs Extracted</p>
              <p className="text-2xl font-black text-[#111827] mt-1">
                {batchResult.summary?.nicCount}
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-2xs">
              <p className="text-xs font-bold text-[#64748B]">Approved</p>
              <p className="text-2xl font-black text-emerald-600 mt-1">
                {batchResult.summary?.approved || batchResult.summary?.totalApproved}
              </p>
              <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">✅ NOT BLC</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-2xs">
              <p className="text-xs font-bold text-[#64748B]">BLC / Blocked</p>
              <p className="text-2xl font-black text-red-600 mt-1">
                {batchResult.summary?.blocked || batchResult.summary?.totalBlc}
              </p>
              <p className="text-[10px] text-red-700 font-semibold mt-0.5">❌ HOLD ACTIVE</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-2xs">
              <p className="text-xs font-bold text-[#64748B]">Not Found</p>
              <p className="text-2xl font-black text-amber-600 mt-1">
                {batchResult.summary?.notFound || batchResult.summary?.totalNotFound}
              </p>
              <p className="text-[10px] text-amber-700 font-semibold mt-0.5">⚠ UNREGISTERED</p>
            </div>
          </div>

          {/* Detailed Per-PDF Results */}
          <div className="space-y-4">
            <h3 className="text-sm font-extrabold text-[#111827] flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-[#F5B942]" />
              <span>PDF Results Breakdown</span>
            </h3>

            {batchResult.files?.map((fileRes, fIdx) => {
              const hasBlc = fileRes.results?.some((r) => r.status === 'BLC' || r.outcome === 'BLC');
              return (
                <div
                  key={fIdx}
                  className={`bg-white rounded-2xl border ${
                    hasBlc ? 'border-red-300 ring-1 ring-red-200' : 'border-[#E5E7EB]'
                  } shadow-2xs overflow-hidden transition-all`}
                >
                  {/* File Header */}
                  <div
                    className={`p-4 ${
                      hasBlc ? 'bg-red-50/60' : 'bg-[#F5F6F8]'
                    } border-b border-[#E5E7EB] flex flex-col md:flex-row md:items-center justify-between gap-3`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className={`w-5 h-5 ${hasBlc ? 'text-red-600' : 'text-[#F5B942]'} shrink-0`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs sm:text-sm font-extrabold text-[#111827]">
                            PDF {fIdx + 1} — {fileRes.filename}
                          </h4>
                          {hasBlc && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 border border-red-300 text-red-800 text-[10px] font-black">
                              <ShieldAlert className="w-3 h-3 text-red-600" />
                              <span>CONTAINS BLC FISHER</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-xs font-bold text-[#64748B]">
                      NICs Found: <span className="text-[#111827] font-extrabold">{fileRes.results?.length || 0}</span>
                    </div>
                  </div>

                  {/* NIC Results Table */}
                  <div className="p-4 overflow-x-auto">
                    {fileRes.status === 'FAILED' ? (
                      <div className="p-4 rounded-xl bg-red-50 text-red-800 text-xs font-bold flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-600" />
                        <span>⚠ Unable to read PDF: {fileRes.error}</span>
                      </div>
                    ) : fileRes.results?.length === 0 ? (
                      <div className="p-4 rounded-xl bg-amber-50 text-amber-800 text-xs font-bold flex items-center gap-2">
                        <HelpCircle className="w-4 h-4 text-amber-600" />
                        <span>No valid Sri Lankan Fisher NICs detected in this PDF document.</span>
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[#E5E7EB] text-[#64748B] font-bold">
                            <th className="py-2.5 px-3">NIC Number</th>
                            <th className="py-2.5 px-3">Fisher ID</th>
                            <th className="py-2.5 px-3">Fisher Name</th>
                            <th className="py-2.5 px-3">Boat No</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Details / Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5E7EB] font-medium text-[#111827]">
                          {fileRes.results.map((r, rIdx) => {
                            const isApproved = r.status === 'APPROVED' || r.outcome === 'APPROVED';
                            const isBlc = r.status === 'BLC' || r.outcome === 'BLC';
                            const isNotFound = r.status === 'NOT_FOUND' || r.outcome === 'NOT_FOUND';

                            return (
                              <tr key={rIdx} className={isBlc ? 'bg-red-50/30 hover:bg-red-50/50' : 'hover:bg-[#F5F6F8]/50'}>
                                <td className="py-3 px-3 font-mono font-extrabold">{r.nic}</td>
                                <td className="py-3 px-3 font-bold text-slate-700">{r.fisherId || '—'}</td>
                                <td className="py-3 px-3 font-bold">{r.fisherName || '—'}</td>
                                <td className="py-3 px-3 font-semibold">{r.boatNo || '—'}</td>
                                <td className="py-3 px-3">
                                  {isApproved && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-extrabold text-[11px]">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>✅ APPROVED / NOT BLC</span>
                                    </span>
                                  )}
                                  {isBlc && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-800 font-extrabold text-[11px]">
                                      <XCircle className="w-3.5 h-3.5 text-red-600" />
                                      <span>❌ BLC / BLOCKED</span>
                                    </span>
                                  )}
                                  {isNotFound && (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-extrabold text-[11px]">
                                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                      <span>⚠ NOT FOUND</span>
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3">
                                  <div className="space-y-1">
                                    <p className="font-semibold text-slate-700">{r.details}</p>
                                    {r.reasons?.map((rsn, rsnIdx) => (
                                      <div
                                        key={rsnIdx}
                                        className="text-[11px] text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200 font-bold inline-block mr-1"
                                      >
                                        Reason: {rsn.label} {rsn.amount ? `(Rs. ${rsn.amount})` : ''}
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default DepartureCheckerPage;
