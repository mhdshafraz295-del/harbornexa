import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Mail, Lock, Eye, EyeOff, ShieldAlert, CheckSquare, Square, Info, X } from 'lucide-react';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(true);

  const { loginUser } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef(null);

  useEffect(() => {
    // Attempt auto-play video safely without blocking UI rendering
    if (videoRef.current) {
      videoRef.current.play().catch((err) => {
        console.warn('Background video autoplay fallback active:', err.message);
        setVideoLoaded(false);
      });
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    try {
      setIsSubmitting(true);
      await loginUser(email, password);
      navigate('/admin/dashboard', { replace: true });
    } catch (err) {
      setErrorMsg(err.message || 'Invalid email or password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-slate-900 overflow-x-hidden p-4">
      
      {/* Background Layer 1 & 2: Clear Harbor Video + Subtle Light Dark Overlay */}
      <div className="absolute inset-0 w-full h-full overflow-hidden z-0 bg-slate-900">
        <video
          ref={videoRef}
          className={`w-full h-full object-cover transition-opacity duration-700 ${
            videoLoaded ? 'opacity-90' : 'opacity-0'
          }`}
          autoPlay
          muted
          loop
          playsInline
          onError={() => setVideoLoaded(false)}
        >
          <source src="/assets/videos/loginpage.bg.mp4" type="video/mp4" />
          <source src="/assests/videos/loginpage.bg.mp4" type="video/mp4" />
        </video>
        {/* Layer 2: Subtle Light Overlay (bg-black/20) keeping video clear */}
        <div className="absolute inset-0 z-10 bg-black/20" />
      </div>

      {/* Background Layer 3: Compact Professional White Login Card (max-w-[400px]) */}
      <div className="relative z-20 w-full max-w-[400px] mx-auto my-auto">
        <div className="bg-white/95 backdrop-blur-md border border-[#E5E7EB] rounded-2xl p-6 sm:p-7 shadow-2xl transition-all duration-300">
          
          {/* Header & Logo - Sit directly above title with clean spacing and no box/border/shadow/plate */}
          <div className="flex flex-col items-center text-center mb-6">
            <img
              src="/assets/images/logo.png"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/assests/images/logo.png';
              }}
              alt="Valachchenai Harbor Logo"
              className="h-14 sm:h-16 w-auto object-contain mb-3"
            />
            
            <h1 className="text-xl font-extrabold tracking-tight text-[#111827] font-sans">
              Valachchenai Harbor
            </h1>
            <p className="text-xs font-semibold text-[#64748B] tracking-wide mt-0.5">
              Fisher Clearance Management System
            </p>
            <div className="w-12 h-1 bg-[#FFD978] rounded-full mt-3" />
          </div>

          {/* Error Message Banner */}
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-red-700 text-xs font-medium">
              <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMsg}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Email Field */}
            <div>
              <label htmlFor="admin-email" className="block text-xs font-semibold text-[#374151] mb-1">
                Email Address
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  id="admin-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@harbor.gov.lk"
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-[#D1D5DB] rounded-xl text-sm text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978] focus:border-[#F5B942] transition-all duration-200"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="admin-password" className="block text-xs font-semibold text-[#374151] mb-1">
                Password
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-10 py-2.5 bg-white border border-[#D1D5DB] rounded-xl text-sm text-[#111827] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FFD978] focus:border-[#F5B942] transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password Options */}
            <div className="flex items-center justify-between pt-1 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer text-[#374151] hover:text-[#111827] select-none font-medium">
                <button
                  type="button"
                  onClick={() => setRememberMe(!rememberMe)}
                  className="text-[#F5B942] focus:outline-none"
                >
                  {rememberMe ? (
                    <CheckSquare className="w-4 h-4 text-[#F5B942] fill-[#FFF7D6]" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400 hover:text-slate-500" />
                  )}
                </button>
                <span>Remember Me</span>
              </label>

              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                className="text-[#D9A441] hover:text-[#F5B942] hover:underline font-semibold focus:outline-none transition-colors"
              >
                Forgot Password?
              </button>
            </div>

            {/* Primary Sign In Button (Light Yellow) */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 mt-2 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] font-bold text-sm rounded-xl shadow-md focus:outline-none focus:ring-2 focus:ring-[#FFD978] focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.99] flex items-center justify-center cursor-pointer"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-[#111827]/30 border-t-[#111827] rounded-full animate-spin" />
                  <span>Signing In...</span>
                </div>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          {/* Footer Note */}
          <div className="mt-5 pt-3 border-t border-[#E5E7EB] text-center">
            <p className="text-[11px] font-medium text-[#64748B]">
              Authorized Personnel Only • Valachchenai Harbor Authority
            </p>
          </div>

        </div>
      </div>

      {/* Forgot Password Modal (Light Theme) */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 max-w-sm w-full shadow-2xl relative text-[#111827]">
            <button
              onClick={() => setShowForgotModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 text-[#F5B942] mb-3">
              <Info className="w-5 h-5 shrink-0" />
              <h3 className="text-base font-bold text-[#111827]">Password Recovery</h3>
            </div>

            <p className="text-xs text-[#374151] leading-relaxed mb-5">
              Password resets are managed directly by Harbor Systems Administration. Please contact your system administrator to recover or reset your account credentials.
            </p>

            <button
              onClick={() => setShowForgotModal(false)}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-[#111827] font-semibold text-xs rounded-xl border border-slate-300 transition-colors cursor-pointer"
            >
              Understand & Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
