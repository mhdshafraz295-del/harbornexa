import React, { useState } from 'react';
import {
  HelpCircle,
  Search,
  UserPlus,
  Users,
  CreditCard,
  Receipt,
  ShieldCheck,
  ShieldAlert,
  Ban,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Sparkles,
  Info,
  Check,
  X,
  FileText,
} from 'lucide-react';

export const HowToUsePage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('ALL');

  const filterTags = [
    { label: 'All Guides', value: 'ALL' },
    { label: 'Fisher', value: 'FISHER' },
    { label: 'Payment', value: 'PAYMENT' },
    { label: 'Clearance', value: 'CLEARANCE' },
    { label: 'Hold', value: 'HOLD' },
    { label: 'Import/Export', value: 'IMPORT_EXPORT' },
  ];

  const guideCards = [
    {
      id: 'add-fisher',
      title: 'Add a Fisher',
      category: 'FISHER',
      icon: UserPlus,
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      flow: ['Fishers', 'Add Fisher', 'Enter Fisher Details', 'Save'],
      warning: 'NIC must be unique across all registered fishers.',
      tamil: 'ஒரே NIC-ஐ இரண்டு முறை சேர்க்க வேண்டாம்.',
      keywords: ['add', 'fisher', 'register', 'nic', 'boat', 'new'],
    },
    {
      id: 'search-fisher',
      title: 'Find a Fisher Quickly',
      category: 'FISHER',
      icon: Search,
      color: 'bg-blue-50 text-blue-700 border-blue-200',
      flow: ['Fishers', 'Search', 'Enter Name / NIC / Fisher ID / Phone / Boat No', 'Open Fisher'],
      description: 'Instant server-side search across 3,000+ registered fishers.',
      tamil: '3000+ Fisher இருந்தாலும் Search பயன்படுத்தி உடனே கண்டுபிடிக்கலாம்.',
      keywords: ['search', 'find', 'lookup', 'name', 'nic', 'phone', 'boat'],
    },
    {
      id: 'add-charge',
      title: 'Add New Charge / Debt',
      category: 'PAYMENT',
      icon: CreditCard,
      color: 'bg-purple-50 text-purple-700 border-purple-200',
      flow: ['Fishers', 'Open Fisher', 'Add New Charge', 'Select Charge Type', 'Check Amount', 'Confirm'],
      warning: 'Adding a new unpaid charge may automatically change Fisher status to BLOCKED.',
      tamil: 'புதிய கட்டணம் செலுத்தப்படாமல் இருந்தால் Fisher BLOCKED ஆகலாம்.',
      keywords: ['charge', 'debt', 'fee', 'port fee', 'unpaid', 'add charge'],
    },
    {
      id: 'record-payment',
      title: 'Record Payment',
      category: 'PAYMENT',
      icon: Receipt,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      flow: ['Debt & Payments', 'Select Debt', 'Pay', 'Enter Payment Details', 'Confirm'],
      description: 'Idempotency protected payment processing.',
      tamil: 'முழு பணமும் செலுத்தப்பட்டு வேறு Hold இல்லையெனில் Fisher மீண்டும் ACTIVE ஆகலாம்.',
      keywords: ['pay', 'payment', 'receipt', 'settle', 'clear debt'],
    },
    {
      id: 'check-status',
      title: 'Check Fisher Status',
      category: 'CLEARANCE',
      icon: ShieldCheck,
      color: 'bg-[#FFF7D6] text-[#111827] border-[#FFD978]',
      flow: ['Search Fisher', 'Open Fisher', 'Check Effective Status'],
      details: [
        { label: 'ACTIVE', text: 'Fisher can proceed to departure' },
        { label: 'BLOCKED', text: 'Check outstanding debt / manual hold / admin block' },
        { label: 'PENDING', text: 'Admin identity review required' },
      ],
      tamil: 'BLOCKED என்றால் காரணத்தை பார்த்து சரிசெய்யவும்.',
      keywords: ['status', 'check', 'effective', 'cleared', 'hold', 'pending'],
    },
    {
      id: 'add-manual-hold',
      title: 'Add Manual Hold',
      category: 'HOLD',
      icon: Ban,
      color: 'bg-red-50 text-red-700 border-red-200',
      flow: ['Fisher Details', 'Manage Hold', 'Add Hold', 'Select Reason', 'Enter Notes', 'Confirm'],
      description: 'Apply administrative restriction (Document Issue, Payment Issue, Management Decision).',
      tamil: 'காரணம் உள்ளிடாமல் Hold சேர்க்க வேண்டாம்.',
      keywords: ['hold', 'manual hold', 'block', 'restrict', 'document issue'],
    },
    {
      id: 'release-manual-hold',
      title: 'Release Manual Hold',
      category: 'HOLD',
      icon: CheckCircle2,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      flow: ['Block History', 'Active Manual Holds', 'Select Fisher', 'Release Hold', 'Enter Release Notes', 'Confirm'],
      warning: 'Releasing a Manual Hold does NOT automatically clear outstanding debt.',
      tamil: 'Hold நீக்கப்பட்டாலும் மீதிக் கடன் இருந்தால் Fisher இன்னும் BLOCKED ஆக இருப்பார்.',
      keywords: ['release', 'unblock', 'remove hold', 'release notes'],
    },
    {
      id: 'grant-clearance',
      title: 'Grant Harbor Clearance',
      category: 'CLEARANCE',
      icon: ShieldCheck,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      flow: ['Clearance', 'Search Fisher', 'Check Effective Status', 'Confirm CLEARED TO PROCEED', 'Grant Clearance'],
      warning: 'Do NOT grant clearance when status is BLOCKED or PENDING.',
      note: 'Official CLR-xxxxxx clearance token is generated and permanently stored.',
      tamil: 'CLEARED TO PROCEED இருந்தால் மட்டும் Clearance வழங்கவும்.',
      keywords: ['grant', 'clearance', 'depart', 'harbor departure', 'token'],
    },
    {
      id: 'clearance-history',
      title: 'Check Clearance History',
      category: 'CLEARANCE',
      icon: Clock,
      color: 'bg-blue-50 text-blue-700 border-blue-200',
      flow: ['Clearance', 'Search Fisher', 'Clearance History (or Today\'s Clearances)'],
      description: 'Audit log of official departure tokens granted to fishers.',
      tamil: 'வழங்கப்பட்ட Clearance பதிவுகள் History-ல் நிரந்தரமாக இருக்கும்.',
      keywords: ['history', 'today', 'clearance history', 'past clearance'],
    },
    {
      id: 'block-history',
      title: 'Check Block History',
      category: 'HOLD',
      icon: Ban,
      color: 'bg-slate-100 text-slate-700 border-slate-200',
      flow: ['Block History', 'Select View: Active Holds / Hold History / Debt Holds / Admin Blocks'],
      description: 'Debt Hold is automatic when debt > 0. Manual Hold is Admin controlled.',
      tamil: 'மீதிக் கடன் இருந்தால் Debt Hold தானாக வரும்.',
      keywords: ['block history', 'hold history', 'debt hold', 'admin block'],
    },
    {
      id: 'import-fishers',
      title: 'Import Fisher Data',
      category: 'IMPORT_EXPORT',
      icon: FileSpreadsheet,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      flow: ['Import / Export', 'Download Template', 'Fill Excel / CSV', 'Upload', 'Preview', 'Check Invalid / Duplicate Rows', 'Import Valid Records'],
      warning: 'Always review the preview before confirming import.',
      tamil: 'Preview பார்த்த பிறகே Import செய்யவும்.',
      keywords: ['import', 'excel', 'csv', 'template', 'batch upload', 'preview'],
    },
    {
      id: 'export-reports',
      title: 'Export Reports & Active/Blocked Lists',
      category: 'IMPORT_EXPORT',
      icon: Download,
      color: 'bg-purple-50 text-purple-700 border-purple-200',
      flow: ['Import / Export', 'Select Report', 'Choose PDF / CSV', 'Download'],
      details: [
        { label: 'Active Fishers Report', text: 'Exports all fishers with effectiveStatus = CLEARED' },
        { label: 'Blocked Fishers (BCL) Report', text: 'Exports all fishers with effectiveStatus = HOLD' },
      ],
      description: 'Screen pagination (10 rows) does NOT limit export. PDF / CSV exports ALL matching records.',
      tamil: 'Blocked Fishers report-ல் Debt Hold, Manual Hold, Admin Block காரணமாக HOLD ஆனவர்கள் வருவார்கள்.',
      keywords: ['export', 'pdf', 'csv', 'report', 'active report', 'blocked report', 'bcl report'],
    },
  ];

  // Filter Cards based on tag & search text
  const filteredCards = guideCards.filter((card) => {
    const matchesTag = selectedTag === 'ALL' || card.category === selectedTag;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return matchesTag;

    const matchesSearch =
      card.title.toLowerCase().includes(query) ||
      card.keywords.some((k) => k.toLowerCase().includes(query)) ||
      (card.description && card.description.toLowerCase().includes(query)) ||
      (card.warning && card.warning.toLowerCase().includes(query)) ||
      (card.tamil && card.tamil.includes(query));

    return matchesTag && matchesSearch;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Header Banner */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#FFF7D6] border border-[#FFD978] flex items-center justify-center text-[#111827] shrink-0 mt-0.5">
              <HelpCircle className="w-6 h-6 text-[#F5B942]" />
            </div>
            <div>
              <h1 className="text-xl font-black text-[#111827] tracking-tight">How to Use</h1>
              <p className="text-xs text-[#64748B] mt-1 font-medium leading-relaxed">
                Simple step-by-step guide to use the Valachchenai Harbor Fisher Clearance Management System.
              </p>
              <p className="text-xs font-bold text-[#D9A441] mt-1 bg-[#FFF7D6] inline-block px-2.5 py-1 rounded-lg border border-[#FFD978]">
                இந்த வழிகாட்டி முக்கிய செயல்களை எளிதாகப் புரிந்து பயன்படுத்த உதவும்.
              </p>
            </div>
          </div>
        </div>

        {/* Search Guide Input Bar */}
        <div className="mt-6 pt-5 border-t border-[#E5E7EB] space-y-3">
          <div className="relative max-w-2xl">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search help... (e.g. fisher, payment, clearance, hold, import, export)"
              className="w-full text-xs font-medium pl-10 pr-4 py-2.5 rounded-xl border border-[#E5E7EB] focus:outline-none focus:border-[#F5B942] focus:ring-1 focus:ring-[#F5B942] transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {filterTags.map((tag) => (
              <button
                key={tag.value}
                onClick={() => setSelectedTag(tag.value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  selectedTag === tag.value
                    ? 'bg-[#111827] text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Top Highlights: Quick Start & Status Meaning & DO / DO NOT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Start Card */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-2xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2.5 border-b border-[#E5E7EB] pb-3">
              <div className="p-2 rounded-xl bg-[#FFF7D6] text-[#111827]">
                <Sparkles className="w-5 h-5 text-[#F5B942]" />
              </div>
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider text-[#111827]">QUICK START WORKFLOW</h2>
                <p className="text-[11px] text-[#64748B]">Core administrative process</p>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-xs font-bold text-slate-800">
              <div className="flex items-center gap-2 flex-wrap bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px]">1</span> Add/Search Fisher
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px]">2</span> Check Status
              </div>
              <div className="flex items-center gap-2 flex-wrap bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px]">3</span> Add Charge / Pay
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px]">4</span> Resolve Holds
              </div>
              <div className="flex items-center gap-2 flex-wrap bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
                <span className="px-2 py-0.5 rounded bg-emerald-200 text-emerald-900 text-[10px]">5</span> Confirm CLEARED
                <ArrowRight className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px]">6</span> Grant Clearance
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#E5E7EB] text-[11px] text-[#D9A441] font-bold">
            Fisher-ன் நிலையை சரிபார்த்து, எல்லா பிரச்சினைகளும் தீர்ந்த பிறகே Clearance வழங்கவும்.
          </div>
        </div>

        {/* Status Meaning Card */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-2xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2.5 border-b border-[#E5E7EB] pb-3">
              <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
                <Info className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider text-[#111827]">STATUS MEANING</h2>
                <p className="text-[11px] text-[#64748B]">Effective clearance states</p>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-xs">
              <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                <div className="font-extrabold text-emerald-900 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  ACTIVE – Can Proceed
                </div>
                <span className="text-[10px] font-bold text-emerald-800">செயலில் உள்ளது – செல்லலாம்</span>
              </div>

              <div className="p-2 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
                <div className="font-extrabold text-red-900 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                  BLOCKED – Cannot Proceed
                </div>
                <span className="text-[10px] font-bold text-red-800">தடைசெய்யப்பட்டுள்ளது – செல்ல முடியாது</span>
              </div>

              <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                <div className="font-extrabold text-amber-900 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                  PENDING – Admin Review
                </div>
                <span className="text-[10px] font-bold text-amber-800">நிலுவையில் – சரிபார்க்க வேண்டும்</span>
              </div>

              <div className="p-2 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between">
                <div className="font-extrabold text-slate-700 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" />
                  ARCHIVED – Not Eligible
                </div>
                <span className="text-[10px] font-bold text-slate-600">காப்பகப்படுத்தப்பட்டது</span>
              </div>
            </div>
          </div>

          <div className="pt-2 text-[11px] text-slate-500 font-medium">
            System status is calculated automatically from base status, debts, and holds.
          </div>
        </div>

        {/* Important DO / DO NOT Card */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-2xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2.5 border-b border-[#E5E7EB] pb-3">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider text-[#111827]">IMPORTANT RULES</h2>
                <p className="text-[11px] text-[#64748B]">Best operational practices</p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
              {/* DO List */}
              <div className="space-y-1.5">
                <div className="font-black text-emerald-700 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> DO
                </div>
                <ul className="space-y-1 text-slate-700 font-medium">
                  <li>• Search before adding</li>
                  <li>• Verify status before clearance</li>
                  <li>• Add clear hold notes</li>
                  <li>• Check import preview</li>
                </ul>
              </div>

              {/* DO NOT List */}
              <div className="space-y-1.5">
                <div className="font-black text-red-700 flex items-center gap-1">
                  <X className="w-3.5 h-3.5" /> DO NOT
                </div>
                <ul className="space-y-1 text-slate-700 font-medium">
                  <li>• No duplicate NICs</li>
                  <li>• No fake records</li>
                  <li>• No clearance when BLOCKED</li>
                  <li>• No hard data deletion</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#E5E7EB] text-[11px] text-red-700 font-bold">
            முக்கிய பதிவுகளை சரிபார்க்காமல் Confirm செய்ய வேண்டாம்.
          </div>
        </div>
      </div>

      {/* 3. Detailed Guide Cards Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-wider">
            STEP-BY-STEP INSTRUCTIONS ({filteredCards.length})
          </h2>
          {searchQuery && (
            <span className="text-xs font-bold text-[#F5B942]">
              Showing results for "{searchQuery}"
            </span>
          )}
        </div>

        {filteredCards.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 text-center text-slate-500 text-xs font-medium">
            No guide card matches your search query. Try searching for "fisher", "payment", "clearance", "hold", "import", or "export".
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredCards.map((card) => {
              const IconComp = card.icon;
              return (
                <div
                  key={card.id}
                  className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-2xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors"
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-center gap-3 border-b border-[#E5E7EB] pb-3">
                      <div className={`p-2 rounded-xl border ${card.color}`}>
                        <IconComp className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-extrabold text-[#111827]">{card.title}</h3>
                        {card.description && (
                          <p className="text-[11px] text-[#64748B]">{card.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Step Flow */}
                    <div className="mt-4">
                      <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-2">
                        ACTION FLOW
                      </label>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-800">
                        {card.flow.map((step, idx) => (
                          <React.Fragment key={idx}>
                            <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200">
                              {step}
                            </span>
                            {idx < card.flow.length - 1 && (
                              <ArrowRight className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>

                    {/* Extra Details */}
                    {card.details && (
                      <div className="mt-3 space-y-1 text-xs">
                        {card.details.map((d, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-slate-700">
                            <span className="font-bold text-[#111827] shrink-0">• {d.label}:</span>
                            <span className="text-slate-600">{d.text}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Warning or Note */}
                    {card.warning && (
                      <div className="mt-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>{card.warning}</span>
                      </div>
                    )}

                    {card.note && (
                      <div className="mt-3 p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-bold flex items-center gap-2">
                        <Info className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>{card.note}</span>
                      </div>
                    )}
                  </div>

                  {/* Tamil Helper */}
                  {card.tamil && (
                    <div className="pt-3 border-t border-[#E5E7EB] text-xs font-bold text-[#D9A441] bg-[#FFF7D6]/50 p-2 rounded-xl border border-[#FFD978]">
                      💡 {card.tamil}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default HowToUsePage;
