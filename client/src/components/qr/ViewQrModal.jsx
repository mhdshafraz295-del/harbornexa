import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Printer, Download, RotateCcw, Ship, CreditCard, User, AlertCircle, ShieldCheck } from 'lucide-react';

export const ViewQrModal = ({ isOpen, onClose, fisher, rawToken, onReissue }) => {
  const cardRef = useRef(null);

  if (!isOpen || !fisher || !rawToken) return null;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Fisher QR Card - ${fisher.full_name}</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background-color: #f8fafc;
            }
            .card {
              width: 320px;
              padding: 24px;
              background: #ffffff;
              border: 2px solid #e2e8f0;
              border-radius: 16px;
              text-align: center;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            }
            .header {
              font-size: 16px;
              font-weight: 800;
              color: #0f172a;
              margin-bottom: 2px;
            }
            .subheader {
              font-size: 11px;
              font-weight: 700;
              color: #D9A441;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              margin-bottom: 16px;
            }
            .fisher-name {
              font-size: 18px;
              font-weight: 800;
              color: #0f172a;
              margin-bottom: 4px;
            }
            .fisher-id {
              font-size: 12px;
              font-weight: 800;
              color: #64748b;
              margin-bottom: 16px;
              letter-spacing: 0.05em;
            }
            .boat-no {
              font-size: 12px;
              font-weight: 700;
              color: #334155;
              background: #f1f5f9;
              padding: 4px 12px;
              border-radius: 8px;
              display: inline-block;
              margin-bottom: 20px;
            }
            .qr-container {
              display: flex;
              justify-content: center;
              margin-bottom: 16px;
            }
            .footer-text {
              font-size: 10px;
              font-weight: 600;
              color: #64748b;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">Valachchenai Harbor</div>
            <div class="subheader">Fisher Identification Card</div>
            <div class="fisher-name">${fisher.full_name}</div>
            <div class="fisher-id">${fisher.fisher_id}</div>
            ${fisher.boat_no ? `<div class="boat-no">Boat: ${fisher.boat_no}</div>` : ''}
            <div class="qr-container">
              ${document.getElementById('fisher-qr-code-svg')?.outerHTML || ''}
            </div>
            <div class="footer-text">Present this QR for harbor clearance verification.</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownload = () => {
    const svgElement = document.getElementById('fisher-qr-code-svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width + 40;
      canvas.height = img.height + 40;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 20, 20);

      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `QR_${fisher.fisher_id}_${fisher.full_name.replace(/\s+/g, '_')}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] bg-[#F5F6F8]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#F5B942]" />
            <h2 className="text-base font-extrabold text-[#111827]">Fisher QR Card</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-[#111827] hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Card Body */}
        <div className="p-6 space-y-5 text-center">
          
          <div ref={cardRef} className="p-5 border border-[#E5E7EB] rounded-2xl bg-white shadow-2xs space-y-3">
            <div className="space-y-0.5">
              <span className="text-[10px] font-extrabold text-[#F5B942] uppercase tracking-wider">
                Valachchenai Harbor
              </span>
              <h3 className="text-lg font-extrabold text-[#111827] line-clamp-1">
                {fisher.full_name}
              </h3>
              <p className="text-xs font-extrabold text-[#64748B] tracking-wider">
                {fisher.fisher_id}
              </p>
            </div>

            {fisher.boat_no && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#F5F6F8] border border-[#E5E7EB] rounded-lg text-xs font-extrabold text-[#111827]">
                <Ship className="w-3.5 h-3.5 text-slate-400" />
                <span>Boat: {fisher.boat_no}</span>
              </div>
            )}

            {/* Opaque QR Code */}
            <div className="flex justify-center py-2">
              <div className="p-3 bg-white border border-[#E5E7EB] rounded-xl shadow-2xs">
                <QRCodeSVG
                  id="fisher-qr-code-svg"
                  value={rawToken}
                  size={160}
                  level="H"
                  includeMargin={false}
                />
              </div>
            </div>

            <p className="text-[10px] font-semibold text-[#64748B]">
              Present this QR for harbor clearance verification.
            </p>
          </div>

          {/* Security Notice */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-left text-[11px] text-slate-600 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Opaque Token Protection</span>
            </div>
            <p>
              This QR encodes a secure random token only. Personal data and financial state are retrieved live upon Admin scan.
            </p>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] rounded-xl text-xs font-extrabold transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Card</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-[#E5E7EB] hover:bg-slate-50 text-[#111827] rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </button>
          </div>

          {onReissue && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onReissue();
              }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-red-200 hover:bg-red-50 text-red-700 rounded-xl text-xs font-extrabold transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reissue QR (Revokes Current)</span>
            </button>
          )}

        </div>

      </div>
    </div>
  );
};
