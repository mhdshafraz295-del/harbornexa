import React, { useState } from 'react';
import { UserCog, KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { updateProfile, changePassword } from '../../services/authService';

const inputCls =
  'w-full px-3.5 py-2 bg-white border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#111827] focus:outline-none focus:border-[#F5B942]';
const labelCls = 'block text-xs font-bold text-[#111827] mb-1.5';

const Alert = ({ type, text }) =>
  text ? (
    <div
      className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
        type === 'error'
          ? 'bg-red-50 border-red-200 text-red-800'
          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
      }`}
    >
      {type === 'error' ? (
        <AlertCircle className="w-4 h-4 shrink-0" />
      ) : (
        <CheckCircle2 className="w-4 h-4 shrink-0" />
      )}
      <span>{text}</span>
    </div>
  ) : null;

export const AccountSettings = () => {
  const { admin, checkAuth } = useAuth();

  // Profile (name + login email)
  const [name, setName] = useState(admin?.name || '');
  const [email, setEmail] = useState(admin?.email || '');
  const [profilePassword, setProfilePassword] = useState('');
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' });
  const [profileBusy, setProfileBusy] = useState(false);

  // Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState({ type: '', text: '' });
  const [pwdBusy, setPwdBusy] = useState(false);

  const handleProfile = async (e) => {
    e.preventDefault();
    setProfileMsg({ type: '', text: '' });
    try {
      setProfileBusy(true);
      const res = await updateProfile({ name, email, currentPassword: profilePassword });
      setProfileMsg({ type: 'success', text: res.message || 'Profile updated.' });
      setProfilePassword('');
      await checkAuth();
    } catch (err) {
      setProfileMsg({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Failed to update profile.',
      });
    } finally {
      setProfileBusy(false);
    }
  };

  const handlePassword = async (e) => {
    e.preventDefault();
    setPwdMsg({ type: '', text: '' });

    if (newPassword.length < 8) {
      setPwdMsg({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdMsg({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    try {
      setPwdBusy(true);
      const res = await changePassword(currentPassword, newPassword);
      setPwdMsg({ type: 'success', text: res.message || 'Password changed.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwdMsg({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Failed to change password.',
      });
    } finally {
      setPwdBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Profile card */}
      <div className="bg-white rounded-3xl border border-[#E5E7EB] p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-2.5 border-b border-[#E5E7EB] pb-4">
          <div className="p-2 rounded-xl bg-[#FFF7D6]">
            <UserCog className="w-5 h-5 text-[#F5B942]" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-[#111827]">Username / Profile</h2>
            <p className="text-xs text-[#64748B]">Change your display name and login email.</p>
          </div>
        </div>

        <Alert type={profileMsg.type} text={profileMsg.text} />

        <form onSubmit={handleProfile} className="space-y-4">
          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className={labelCls}>Login Email (Username)</label>
            <input
              type="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelCls}>Current Password (to confirm)</label>
            <input
              type="password"
              className={inputCls}
              value={profilePassword}
              onChange={(e) => setProfilePassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={profileBusy}
              className="px-5 py-2 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] text-xs font-extrabold rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              {profileBusy ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>

      {/* Password card */}
      <div className="bg-white rounded-3xl border border-[#E5E7EB] p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-2.5 border-b border-[#E5E7EB] pb-4">
          <div className="p-2 rounded-xl bg-[#FFF7D6]">
            <KeyRound className="w-5 h-5 text-[#F5B942]" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-[#111827]">Change Password</h2>
            <p className="text-xs text-[#64748B]">Use at least 8 characters.</p>
          </div>
        </div>

        <Alert type={pwdMsg.type} text={pwdMsg.text} />

        <form onSubmit={handlePassword} className="space-y-4">
          <div>
            <label className={labelCls}>Current Password</label>
            <input
              type="password"
              className={inputCls}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div>
            <label className={labelCls}>New Password</label>
            <input
              type="password"
              className={inputCls}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div>
            <label className={labelCls}>Confirm New Password</label>
            <input
              type="password"
              className={inputCls}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pwdBusy}
              className="px-5 py-2 bg-[#FFD978] hover:bg-[#F5B942] text-[#111827] text-xs font-extrabold rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              {pwdBusy ? 'Updating...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AccountSettings;
