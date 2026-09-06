import React from 'react';
import { Construction } from 'lucide-react';

export const PlaceholderPage = ({ title }) => {
  return (
    <div className="space-y-6">
      <div className="border-b border-[#E5E7EB] pb-5">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight">
          {title}
        </h1>
        <p className="text-xs sm:text-sm font-medium text-[#64748B] mt-1">
          Valachchenai Harbor Fisher Clearance Management System
        </p>
      </div>

      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-8 sm:p-16 text-center shadow-xs">
        <div className="w-16 h-16 rounded-full bg-[#FFF7D6] border border-[#FFD978] flex items-center justify-center mx-auto mb-4 text-[#F5B942]">
          <Construction className="w-8 h-8" />
        </div>

        <h2 className="text-lg sm:text-xl font-bold text-[#111827] mb-2">
          Module Under Development
        </h2>

        <p className="text-sm text-[#64748B] max-w-md mx-auto leading-relaxed">
          This module will be available in the next development phase.
        </p>

        <div className="mt-6 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFF7D6] border border-[#FFD978] text-xs text-[#111827] font-bold">
          <span className="w-2 h-2 rounded-full bg-[#F5B942] animate-pulse" />
          <span>Phase 1 Scope Completed</span>
        </div>
      </div>
    </div>
  );
};
