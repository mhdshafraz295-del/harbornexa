import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { verifyQrToken } from '../services/qrService';
import { getFishers } from '../services/fisherService';
import { getFisherClearance } from '../services/clearanceService';
import {
  QrCode,
  Camera,
  Square,
  RefreshCw,
  AlertOctagon,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Search,
  User,
  CreditCard,
  Phone,
  Ship,
  Coins,
  ChevronRight,
  Archive,
  ArrowRight,
} from 'lucide-react';

export const QrScannerPage = () => {
  const navigate = useNavigate();

  // Scanner State
  const [isScanning, setIsScanning] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const [loadingVerify, setLoadingVerify] = useState(false);

  // Result State
  const [scanResult, setScanResult] = useState(null);
  const [verifyError, setVerifyError] = useState('');

  // Fallback Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  const html5QrcodeRef = useRef(null);
  const scannerRegionId = 'qr-reader-container';

  // Clean up scanner on unmount
  useEffect(() => {
    return () => {
      if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
        html5QrcodeRef.current
          .stop()
          .catch((err) => console.warn('Scanner cleanup warning:', err));
      }
    };
  }, []);

  // Debounced Fallback Quick Search
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearchLoading(true);
        const data = await getFishers({ search: trimmed, limit: 5 });
        if (data && data.success) {
          setSearchResults(data.items || []);
          setShowSearchDropdown(true);
        }
      } catch (err) {
        console.error('Fallback search error:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Start Camera QR Scanner
  const handleStartScanner = async () => {
    setScannerError('');
    setCameraPermissionDenied(false);
    setScanResult(null);
    setVerifyError('');

    try {
      const html5QrCode = new Html5Qrcode(scannerRegionId);
      html5QrcodeRef.current = html5QrCode;

      const config = { fps: 10, qrbox: { width: 240, height: 240 } };

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        onScanSuccess,
        onScanFailure
      );

      setIsScanning(true);
    } catch (err) {
      console.error('Camera start error:', err);
      if (err?.name === 'NotAllowedError' || String(err).includes('Permission')) {
        setCameraPermissionDenied(true);
        setScannerError('Camera permission was denied. Allow camera access in your browser or use Fisher Search.');
      } else if (err?.name === 'NotFoundError') {
        setScannerError('No camera found on this device.');
      } else {
        setScannerError(err?.message || 'Unable to access device camera.');
      }
      setIsScanning(false);
    }
  };

  // Stop Camera QR Scanner
  const handleStopScanner = async () => {
    if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
      try {
        await html5QrcodeRef.current.stop();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
    }
    setIsScanning(false);
  };

  // On QR Code Successfully Decoded
  const onScanSuccess = async (decodedText) => {
    // DUPLICATE SCAN CONTROL: Immediately stop scanning to prevent API spam
    await handleStopScanner();

    if (!decodedText) return;
    processTokenVerification(decodedText);
  };

  const onScanFailure = () => {
    // Silence frame decoding noise
  };

  // Process Token Verification API
  const processTokenVerification = async (tokenString) => {
    try {
      setLoadingVerify(true);
      setVerifyError('');
      setScanResult(null);

      const data = await verifyQrToken(tokenString);
      if (data && data.success) {
        setScanResult(data);
      } else {
        setVerifyError(data.message || 'Invalid Fisher QR.');
      }
    } catch (err) {
      setVerifyError(err.message || 'Failed to verify Fisher QR token.');
    } finally {
      setLoadingVerify(false);
    }
  };

  // Handle Search Result Fallback Selection
  const handleSelectSearchFisher = async (fisher) => {
    setShowSearchDropdown(false);
    setSearchQuery('');
    setVerifyError('');

    try {
      setLoadingVerify(true);
      setScanResult(null);
      const data = await getFisherClearance(fisher.id);
      if (data && data.success) {
        setScanResult({
          fisher,
          financialSummary: data.financialSummary,
          clearanceStatus: data.clearanceStatus,
        });
      }
    } catch (err) {
      setVerifyError(err.message || 'Failed to retrieve fisher clearance status.');
    } finally {
      setLoadingVerify(false);
    }
  };

  // Reset and Scan Another Fisher
  const handleReset = async () => {
    setScanResult(null);
    setVerifyError('');
    await handleStartScanner();
  };

  const clearance = scanResult?.clearanceStatus;
  const fisher = scanResult?.fisher;
  const summary = scanResult?.financialSummary;

  const getResultStatusDisplay = () => {
    if (fisher?.is_archived || clearance?.status === 'NOT_ELIGIBLE') {
      return {
        badgeBg: 'bg-slate-100 border-slate-300 text-slate-700',
        title: 'NOT ELIGIBLE',
        icon: Archive,
        boxBg: 'bg-slate-50 border-slate-200 text-slate-800',
      };
    }
    if (clearance?.status === 'HOLD') {
      return {
        badgeBg: 'bg-red-100 border-red-300 text-red-800',
        title: 'HOLD – DO NOT PROCEED',
        icon: ShieldAlert,
        boxBg: 'bg-red-50 border-red-200 text-red-900',
      };
    }
    if (clearance?.status === 'PENDING') {
      return {
        badgeBg: 'bg-amber-100 border-amber-300 text-amber-800',
        title: 'PENDING VERIFICATION',
        icon: AlertTriangle,
        boxBg: 'bg-amber-50 border-amber-200 text-amber-900',
      };
    }
    return {
      badgeBg: 'bg-emerald-100 border-emerald-300 text-emerald-800',
      title: 'CLEARED TO PROCEED',
      icon: ShieldCheck,
      boxBg: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    };
  };

  const statusConfig = scanResult ? getResultStatusDisplay() : null;
  const StatusIcon = statusConfig?.icon;

  return (
    <div className="space-y-6 pb-12">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5E7EB] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-xl bg-[#FFF7D6] border border-[#FFD978] text-[#F5B942]">
              <QrCode className="w-6 h-6 text-[#111827]" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight">
              Admin QR Scanner
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-[11px] font-extrabold text-slate-700">
              Admin Protected
            </span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-[#64748B]">
            Scan a Fisher's secure QR card to verify real-time harbor clearance status.
          </p>
        </div>

        {/* Action Toggle */}
        <div className="flex items-center gap-3">
          {!isScanning ? (
            <button
              onClick={handleStartScanner}
              disabled={loadingVerify}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] rounded-xl text-xs font-extrabold transition-all shadow-2xs cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Start Scanner</span>
            </button>
          ) : (
            <button
              onClick={handleStopScanner}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-100 hover:bg-red-200 text-red-800 border border-red-300 rounded-xl text-xs font-extrabold transition-all cursor-pointer"
            >
              <Square className="w-4 h-4" />
              <span>Stop Scanner</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Left Scanner & Search, Right Verification Result */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Camera Viewfinder & Fallback Search (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Camera Viewfinder Card */}
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-[#111827] uppercase tracking-wider flex items-center gap-2">
                <Camera className="w-4 h-4 text-slate-500" />
                <span>Live Viewfinder</span>
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                isScanning ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}>
                {isScanning ? 'Scanner Active' : 'Scanner Idle'}
              </span>
            </div>

            {/* Container for html5-qrcode reader */}
            <div className="relative overflow-hidden bg-slate-900 rounded-2xl border border-slate-800 min-h-64 flex flex-col items-center justify-center p-4">
              <div id={scannerRegionId} className="w-full max-w-sm rounded-xl overflow-hidden" />

              {!isScanning && !loadingVerify && (
                <div className="text-center p-6 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto text-slate-400 shadow-2xs">
                    <QrCode className="w-6 h-6 text-[#FFD978]" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-white">Scan a Fisher QR to check current clearance status.</p>
                    <p className="text-[11px] font-semibold text-slate-400">
                      Click "Start Scanner" above to enable your device camera.
                    </p>
                  </div>
                  <button
                    onClick={handleStartScanner}
                    className="mt-2 px-4 py-2 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] rounded-xl text-xs font-extrabold transition-all cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Enable Camera</span>
                  </button>
                </div>
              )}

              {loadingVerify && (
                <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-xs flex flex-col items-center justify-center text-white space-y-3">
                  <RefreshCw className="w-8 h-8 text-[#FFD978] animate-spin" />
                  <p className="text-xs font-extrabold">Verifying Fisher QR Token...</p>
                </div>
              )}
            </div>

            {/* Camera Error Banner */}
            {scannerError && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs font-medium space-y-1">
                <div className="flex items-center gap-2 font-bold text-red-800">
                  <AlertOctagon className="w-4 h-4 shrink-0 text-red-600" />
                  <span>Camera Access Notice</span>
                </div>
                <p>{scannerError}</p>
              </div>
            )}
          </div>

          {/* Search Fallback Card */}
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-2xs space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-[#111827]">Can't scan QR?</h3>
              <p className="text-xs font-medium text-[#64748B]">
                Use Fisher search fallback by Name, NIC, Phone, Fisher ID, or Boat No.
              </p>
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Name, NIC, Phone, Fisher ID..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#D1D5DB] rounded-xl text-xs font-semibold text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978]"
              />

              {searchLoading && (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                </div>
              )}

              {/* Search Dropdown */}
              {showSearchDropdown && searchResults.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-[#E5E7EB] rounded-xl shadow-xl overflow-hidden divide-y divide-slate-100 max-h-60 overflow-y-auto">
                  {searchResults.map((f) => (
                    <div
                      key={f.id}
                      onClick={() => handleSelectSearchFisher(f)}
                      className="p-3 hover:bg-[#FFF7D6]/40 cursor-pointer transition-colors flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-extrabold text-[#111827]">{f.full_name}</div>
                        <div className="text-[10px] font-bold text-slate-400">
                          {f.fisher_id} • NIC: {f.nic} {f.boat_no ? `• Boat: ${f.boat_no}` : ''}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right Column: Scan Result & Real-Time Status Card (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-2xs space-y-5">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <h2 className="text-sm font-extrabold text-[#111827] uppercase tracking-wider">
                Verification Result
              </h2>
              {scanResult && (
                <button
                  onClick={handleReset}
                  className="text-xs font-bold text-[#F5B942] hover:text-[#111827] transition-colors cursor-pointer"
                >
                  Scan Another
                </button>
              )}
            </div>

            {/* Error Banner */}
            {verifyError && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs font-medium space-y-2">
                <div className="flex items-center gap-2 font-bold text-red-800 text-sm">
                  <AlertOctagon className="w-5 h-5 text-red-600 shrink-0" />
                  <span>Scan Verification Failed</span>
                </div>
                <p className="font-bold">{verifyError}</p>
                <p className="text-[11px] text-red-700">
                  Ensure the QR token is active, valid, and has not been revoked by Admin.
                </p>
              </div>
            )}

            {/* Scan Result Details Card */}
            {scanResult ? (
              <div className="space-y-5">
                
                {/* Authoritative Clearance Status Banner */}
                <div className={`p-4 rounded-2xl border ${statusConfig.boxBg} space-y-2`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">
                      Real-Time Clearance Status
                    </span>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-extrabold border ${statusConfig.badgeBg} flex items-center gap-1`}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      <span>{clearance?.status}</span>
                    </span>
                  </div>

                  <div className="text-lg font-black tracking-tight flex items-center gap-2">
                    <StatusIcon className="w-6 h-6 shrink-0" />
                    <span>{statusConfig.title}</span>
                  </div>
                </div>

                {/* Restrictive Reasons if on HOLD */}
                {clearance?.status === 'HOLD' && clearance?.reasons?.length > 0 && (
                  <div className="p-4 rounded-2xl bg-red-50 border border-red-200 space-y-2 text-xs text-red-900">
                    <div className="flex items-center gap-2 font-extrabold text-red-800">
                      <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                      <span>Hold Reasons:</span>
                    </div>
                    <ul className="list-disc pl-5 space-y-1 font-semibold text-[11px]">
                      {clearance.reasons.map((r, i) => (
                        <li key={i}>{r.label}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Fisher Identity */}
                <div className="bg-[#F5F6F8] border border-[#E5E7EB] rounded-2xl p-4 space-y-3 text-xs">
                  <span className="text-[10px] font-extrabold text-[#64748B] uppercase tracking-wider block">
                    Fisher Identity
                  </span>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-[#E5E7EB]">
                      <span className="font-semibold text-slate-500">Name:</span>
                      <span className="font-extrabold text-[#111827]">{fisher.full_name}</span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-[#E5E7EB]">
                      <span className="font-semibold text-slate-500">Fisher ID:</span>
                      <span className="font-extrabold text-[#111827]">{fisher.fisher_id}</span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-[#E5E7EB]">
                      <span className="font-semibold text-slate-500">NIC:</span>
                      <span className="font-extrabold text-[#111827]">{fisher.nic}</span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-[#E5E7EB]">
                      <span className="font-semibold text-slate-500">Boat No:</span>
                      <span className="font-extrabold text-[#111827]">{fisher.boat_no || 'Not assigned'}</span>
                    </div>
                  </div>
                </div>

                {/* Financial Outstanding Debt Summary */}
                <div className="bg-[#F5F6F8] border border-[#E5E7EB] rounded-2xl p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold text-[#64748B] uppercase tracking-wider">
                      மீதிக் கடன் Snapshot
                    </span>
                    <Coins className="w-4 h-4 text-amber-600" />
                  </div>

                  <div className="p-3 rounded-xl bg-white border border-[#E5E7EB] flex items-center justify-between">
                    <span className="font-bold text-slate-600">Outstanding Debt:</span>
                    <span className={`text-base font-extrabold ${
                      summary?.outstandingDebt > 0 ? 'text-red-700' : 'text-emerald-700'
                    }`}>
                      Rs. {summary?.outstandingDebt || '0.00'}
                    </span>
                  </div>
                </div>

                {/* Navigation / Clearance Action */}
                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => navigate(`/admin/clearance?fisherId=${fisher.id}`)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] rounded-xl text-xs font-extrabold transition-all cursor-pointer shadow-2xs"
                  >
                    <span>View / Manage Clearance Page</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    onClick={handleReset}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-[#E5E7EB] hover:bg-slate-50 text-[#111827] rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Scan Another Fisher</span>
                  </button>
                </div>

              </div>
            ) : (
              !verifyError && (
                <div className="p-8 border border-dashed border-[#E5E7EB] rounded-2xl bg-[#F5F6F8] text-center space-y-2">
                  <QrCode className="w-8 h-8 text-slate-400 mx-auto mb-1" />
                  <p className="text-xs font-bold text-[#111827]">No scan result yet.</p>
                  <p className="text-[11px] text-[#64748B]">
                    Scan a Fisher's QR code or select a fisher using the search fallback to verify clearance status.
                  </p>
                </div>
              )
            )}

          </div>

        </div>

      </div>

    </div>
  );
};

export default QrScannerPage;
