import React, { useState, useEffect } from 'react';
import {
  Mail,
  RefreshCw,
  FileText,
  GripVertical,
  CheckCircle2,
  Download,
  Zap,
  Clock,
  Search,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  ExternalLink,
  Inbox,
  ShieldCheck,
  Filter,
  PlusCircle,
  Key,
  Info,
  User,
  Paperclip,
  Check,
} from 'lucide-react';
import { getEmailManifests, downloadAttachmentBlob, getAttachmentAsFile } from '../../services/emailService';

export const EmailInboxDrawer = ({
  onDirectCheckAttachment,
  onAddFilesToBatch,
  isProcessingParent,
}) => {
  const [emails, setEmails] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);
  const [loadingAttachmentId, setLoadingAttachmentId] = useState(null);
  const [activeTab, setActiveTab] = useState('manifests'); // 'manifests' | 'all'
  const [expandedEmailId, setExpandedEmailId] = useState(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [addedIds, setAddedIds] = useState(new Set());

  const fetchEmails = async () => {
    try {
      setIsLoading(true);
      setStatusMessage('');
      const data = await getEmailManifests(25);
      setEmails(data.emails || []);
      setIsConfigured(Boolean(data.configured));
      if (data.message) {
        setStatusMessage(data.message);
      }
    } catch (err) {
      console.error('Failed to fetch manifest emails:', err);
      setStatusMessage('Unable to load emails. Check server email configuration.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, []);

  const handleDragStart = (e, attachment, email) => {
    const payload = {
      type: 'harbornexa-email-attachment',
      attachment: {
        id: attachment.id,
        filename: attachment.filename,
        size: attachment.size,
        contentType: attachment.contentType,
        url: attachment.url,
      },
      emailSubject: email.subject,
      sender: email.from,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    e.dataTransfer.setData('text/plain', attachment.filename);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDownload = async (attachment, e) => {
    e.stopPropagation();
    try {
      setDownloadingId(attachment.id);
      const blob = await downloadAttachmentBlob(attachment.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', attachment.filename || 'manifest.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      alert('Failed to download PDF attachment.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDirectCheck = async (attachment, e) => {
    e.stopPropagation();
    if (onDirectCheckAttachment) {
      setLoadingAttachmentId(attachment.id);
      try {
        await onDirectCheckAttachment(attachment);
      } finally {
        setLoadingAttachmentId(null);
      }
    }
  };

  const handleAddAllPdfsToBatch = async () => {
    if (!onAddFilesToBatch) return;
    const allAttachments = emails
      .filter((m) => m.attachments && m.attachments.length > 0)
      .flatMap((m) => m.attachments);

    if (allAttachments.length === 0) return;

    try {
      setIsLoading(true);
      const files = [];
      for (const att of allAttachments.slice(0, 5)) {
        const file = await getAttachmentAsFile(att);
        files.push(file);
      }
      onAddFilesToBatch(files);
      const newSet = new Set(addedIds);
      allAttachments.forEach((a) => newSet.add(a.id));
      setAddedIds(newSet);
    } catch (e) {
      console.error('Error adding all attachments:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter emails by Tab & Search query
  const manifestEmails = emails.filter((e) => e.hasPdf || (e.attachments && e.attachments.length > 0));
  const displayedEmails = (activeTab === 'manifests' ? manifestEmails : emails).filter((email) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (email.subject && email.subject.toLowerCase().includes(q)) ||
      (email.from && email.from.toLowerCase().includes(q)) ||
      (email.fromName && email.fromName.toLowerCase().includes(q)) ||
      (email.preview && email.preview.toLowerCase().includes(q)) ||
      (email.attachments &&
        email.attachments.some((a) => a.filename && a.filename.toLowerCase().includes(q)))
    );
  });

  const totalPdfCount = emails.reduce((acc, email) => acc + (email.attachments?.length || 0), 0);

  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-2xs overflow-hidden transition-all duration-200">
      {/* Header bar */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-white via-[#FFFDF5] to-white border-b border-[#E5E7EB] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#FFF7D6] border border-[#FFD978] flex items-center justify-center text-[#111827] shrink-0">
            <Mail className="w-5 h-5 text-[#B45309]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-extrabold text-[#111827] tracking-tight">
                Departure Manifest Email Inbox
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FFF7D6] text-[#B45309] border border-[#FFD978] flex items-center gap-1">
                <Paperclip className="w-3 h-3 text-[#B45309]" />
                {totalPdfCount} {totalPdfCount === 1 ? 'PDF Manifest' : 'PDF Manifests'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                {emails.length} Emails
              </span>
            </div>
            <p className="text-xs text-[#64748B] font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>Mailbox:</span>
              <span className="font-bold text-[#111827] bg-[#F1F5F9] px-1.5 py-0.5 rounded">sfn1825@gmail.com</span>
              <span className="hidden sm:inline">•</span>
              <span className="text-[11px] text-[#475569]">Drag PDF pills into the dropzone below or click ⚡ Check</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => setShowSetupGuide(!showSetupGuide)}
            type="button"
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
              showSetupGuide
                ? 'bg-[#FFF7D6] border-[#FFD978] text-[#B45309]'
                : 'border-[#E5E7EB] hover:bg-[#F5F6F8] text-[#64748B] hover:text-[#111827]'
            }`}
            title="How to connect live Gmail with 2-Step Verification"
          >
            <Key className="w-3.5 h-3.5 text-[#B45309]" />
            <span className="hidden sm:inline">Gmail Setup</span>
          </button>

          <button
            onClick={fetchEmails}
            disabled={isLoading || isProcessingParent}
            title="Refresh Inbox"
            className="p-2 px-3 rounded-xl border border-[#E5E7EB] hover:bg-[#F5F6F8] text-[#64748B] hover:text-[#111827] text-xs font-bold transition-all duration-150 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#F5B942]' : ''}`} />
            <span className="text-xs">Refresh</span>
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 rounded-xl border border-[#E5E7EB] hover:bg-[#F5F6F8] text-[#64748B] hover:text-[#111827] transition-colors cursor-pointer"
            title={isExpanded ? 'Collapse Inbox' : 'Expand Inbox'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Collapsible Content Body */}
      {isExpanded && (
        <div className="p-4 sm:p-5 space-y-4">
          {/* Gmail Setup Help Guide Box */}
          {showSetupGuide && (
            <div className="p-4 rounded-xl bg-[#FFFDF5] border border-[#FFD978] text-xs text-[#111827] space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-black text-xs text-[#B45309]">
                  <Key className="w-4 h-4 text-[#B45309]" />
                  <span>Google App Passwords Setup for sfn1825@gmail.com</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSetupGuide(false)}
                  className="text-slate-400 hover:text-slate-700 font-bold text-xs"
                >
                  ✕ Close
                </button>
              </div>
              <p className="text-[12px] text-[#475569] leading-relaxed">
                Google-ல் <span className="font-semibold text-rose-700">"The setting that you are looking for is not available"</span> என்று வந்தால், உங்கள் கூகுள் கணக்கில் <strong>2-Step Verification</strong> இன்னும் ஆன் செய்யப்படவில்லை என்று அர்த்தம்.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <div className="p-3 bg-white rounded-lg border border-[#E5E7EB]">
                  <span className="w-5 h-5 rounded-full bg-[#FFF7D6] text-[#B45309] font-black inline-flex items-center justify-center text-[11px] mb-1">1</span>
                  <h4 className="font-bold text-xs text-[#111827]">2-Step Verification ON</h4>
                  <p className="text-[11px] text-[#64748B] mt-0.5">
                    <a
                      href="https://myaccount.google.com/signinoptions/two-step-verification"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1 font-semibold"
                    >
                      Turn ON 2FA <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>
                </div>
                <div className="p-3 bg-white rounded-lg border border-[#E5E7EB]">
                  <span className="w-5 h-5 rounded-full bg-[#FFF7D6] text-[#B45309] font-black inline-flex items-center justify-center text-[11px] mb-1">2</span>
                  <h4 className="font-bold text-xs text-[#111827]">App Password எடுக்கவும்</h4>
                  <p className="text-[11px] text-[#64748B] mt-0.5">
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1 font-semibold"
                    >
                      App Passwords பக்கம் <ExternalLink className="w-3 h-3" />
                    </a>
                    <br />App Name: "Harbornexa" என கொடுத்து 16 எழுத்து password எடுக்கவும்.
                  </p>
                </div>
                <div className="p-3 bg-white rounded-lg border border-[#E5E7EB]">
                  <span className="w-5 h-5 rounded-full bg-[#FFF7D6] text-[#B45309] font-black inline-flex items-center justify-center text-[11px] mb-1">3</span>
                  <h4 className="font-bold text-xs text-[#111827]">Sync & Enjoy</h4>
                  <p className="text-[11px] text-[#64748B] mt-0.5">
                    இப்போது உங்கள் Gmail-ல் வரும் புதிய PDF manifest-கள் தானாகவே இங்கு live-ஆக காண்பிக்கப்படும்!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Tabs & Search Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E7EB] pb-3">
            {/* Tabs */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('manifests')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'manifests'
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'bg-[#F1F5F9] text-[#64748B] hover:text-[#111827] hover:bg-[#E2E8F0]'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>With PDF Manifests</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'manifests' ? 'bg-[#FFD978] text-[#111827]' : 'bg-slate-200 text-slate-700'
                }`}>
                  {manifestEmails.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'all'
                    ? 'bg-[#111827] text-white shadow-xs'
                    : 'bg-[#F1F5F9] text-[#64748B] hover:text-[#111827] hover:bg-[#E2E8F0]'
                }`}
              >
                <Inbox className="w-3.5 h-3.5" />
                <span>All Inbox Emails</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'all' ? 'bg-[#FFD978] text-[#111827]' : 'bg-slate-200 text-slate-700'
                }`}>
                  {emails.length}
                </span>
              </button>
            </div>

            {/* Search Box */}
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search subject, sender, PDF..."
                className="w-full pl-8.5 pr-4 py-1.5 text-xs rounded-xl bg-[#F5F6F8] border border-[#E5E7EB] text-[#111827] placeholder:text-[#94A3B8] focus:outline-hidden focus:border-[#F5B942] focus:bg-white transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-700 font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Loading Indicator */}
          {isLoading && emails.length === 0 && (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-[#64748B]">
              <RefreshCw className="w-5 h-5 animate-spin text-[#F5B942]" />
              <p className="text-xs font-bold">Connecting to sfn1825@gmail.com mailbox & checking for PDFs...</p>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && displayedEmails.length === 0 && (
            <div className="py-8 text-center border-2 border-dashed border-[#E5E7EB] rounded-2xl p-6 bg-[#F8FAFC]/50">
              <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-[#111827]">
                {searchQuery ? 'No matching emails found' : 'No emails found in this category'}
              </p>
              <p className="text-[11px] text-[#64748B] mt-1 max-w-sm mx-auto">
                {searchQuery ? 'Try clearing your search query.' : 'Switch to the "All Inbox Emails" tab to see your full inbox messages.'}
              </p>
            </div>
          )}

          {/* Email List Cards */}
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {displayedEmails.map((email) => {
              const formattedDate = new Date(email.date).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                month: 'short',
                day: 'numeric',
              });
              const isItemExpanded = expandedEmailId === email.id;
              const hasAttachments = email.attachments && email.attachments.length > 0;

              return (
                <div
                  key={email.id}
                  className={`rounded-xl border transition-all duration-150 overflow-hidden ${
                    hasAttachments
                      ? 'border-[#E5E7EB] hover:border-[#FFD978] bg-white hover:bg-[#FFFDF7]'
                      : 'border-[#E2E8F0] hover:border-slate-300 bg-white hover:bg-[#F8FAFC]'
                  } shadow-2xs`}
                >
                  {/* Main Card Header / Click to Expand */}
                  <div
                    onClick={() => setExpandedEmailId(isItemExpanded ? null : email.id)}
                    className="p-3 sm:p-3.5 flex items-start justify-between gap-2.5 cursor-pointer select-none"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {hasAttachments ? (
                          <span className="w-2 h-2 rounded-full bg-[#F5B942] shrink-0" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                        )}

                        <span className="text-xs font-black text-[#111827] truncate max-w-sm sm:max-w-md" title={email.subject}>
                          {email.subject}
                        </span>

                        {hasAttachments && (
                          <span className="px-1.5 py-0.2 rounded-md bg-[#FFF7D6] text-[#B45309] font-black text-[10px] border border-[#FFD978] shrink-0 flex items-center gap-1">
                            <FileText className="w-2.5 h-2.5" />
                            {email.attachments.length} PDF
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-[#64748B] font-medium truncate mt-1">
                        <span className="font-bold text-[#334155] truncate">{email.fromName || email.from}</span>
                        <span className="text-slate-300">•</span>
                        <span className="truncate text-slate-500">{email.preview}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1 text-[10px] text-[#64748B] font-semibold bg-[#F5F6F8] px-2 py-1 rounded-lg">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{formattedDate}</span>
                      </div>
                      <span className="text-slate-400 text-xs">
                        {isItemExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Detail View */}
                  {isItemExpanded && (
                    <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100 bg-[#FAFAFA] text-xs text-slate-700 space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span><strong>Sender Address:</strong> {email.from}</span>
                        <span><strong>Date:</strong> {new Date(email.date).toLocaleString()}</span>
                      </div>
                      <p className="text-xs text-slate-800 bg-white p-2.5 rounded-lg border border-slate-200 leading-relaxed font-normal">
                        {email.preview}
                      </p>
                    </div>
                  )}

                  {/* Attachment Cards - Draggable Pills */}
                  {hasAttachments && (
                    <div className="px-3 sm:px-3.5 pb-3 pt-0 flex flex-wrap gap-2">
                      {email.attachments.map((att) => {
                        const isAdded = addedIds.has(att.id);
                        return (
                          <div
                            key={att.id}
                            draggable={true}
                            onDragStart={(e) => handleDragStart(e, att, email)}
                            title="Drag this into the upload box OR click ⚡ Check to verify directly"
                            className="group/chip inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#F8FAFC] hover:bg-[#FFF7D6] border border-[#E2E8F0] hover:border-[#FFD978] text-xs font-bold text-[#111827] cursor-grab active:cursor-grabbing transition-all duration-150 shadow-2xs"
                          >
                            <GripVertical className="w-3.5 h-3.5 text-slate-400 group-hover/chip:text-[#B45309] shrink-0" />
                            <FileText className="w-4 h-4 text-[#B45309] shrink-0" />
                            <div className="min-w-0 max-w-[190px] sm:max-w-[240px]">
                              <p className="truncate text-xs font-bold text-[#111827]">
                                {att.filename}
                              </p>
                              <p className="text-[10px] text-[#64748B] font-medium">
                                {(att.size / 1024).toFixed(0)} KB • Drag or ⚡ Check
                              </p>
                            </div>

                            {/* Quick Action Buttons */}
                            <div className="flex items-center gap-1 ml-1 border-l border-[#CBD5E1] pl-2">
                              {/* 1-Click Direct Verify */}
                              <button
                                type="button"
                                onClick={(e) => handleDirectCheck(att, e)}
                                disabled={isProcessingParent || loadingAttachmentId === att.id}
                                title="Directly verify this manifest with Departure Checker"
                                className="px-2 py-1 rounded-lg bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] text-[11px] font-black flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                {loadingAttachmentId === att.id ? (
                                  <RefreshCw className="w-3 h-3 animate-spin text-[#111827]" />
                                ) : (
                                  <Zap className="w-3 h-3 text-[#111827] fill-[#111827]" />
                                )}
                                <span>Check</span>
                              </button>

                              {/* Download PDF */}
                              <button
                                type="button"
                                onClick={(e) => handleDownload(att, e)}
                                disabled={downloadingId === att.id}
                                title="Download PDF to computer"
                                className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                              >
                                {downloadingId === att.id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Download className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailInboxDrawer;

