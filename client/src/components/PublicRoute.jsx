import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Anchor } from 'lucide-react';

export const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center text-[#111827] p-4">
        <div className="relative flex items-center justify-center mb-4">
          <div className="w-16 h-16 rounded-full border-4 border-[#FFD978]/40 border-t-[#F5B942] animate-spin"></div>
          <Anchor className="w-6 h-6 text-[#F5B942] absolute" />
        </div>
        <p className="text-sm font-semibold tracking-wide text-[#64748B] animate-pulse">
          Verifying Valachchenai Harbor Credentials...
        </p>
      </div>
    );
  }

  // If already authenticated, redirect logged-in Admin to dashboard
  if (isAuthenticated) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return children;
};
