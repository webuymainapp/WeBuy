import React, { useRef, useState } from 'react';
import { AppSettings, StudentProfile } from '../types';
import {
  ArrowLeft,
  Moon,
  Sun,
  Bell,
  BellOff,
  Lock,
  Camera,
  Check,
  Copy,
  ShieldCheck,
  AlertCircle,
  Loader2,
  BadgeCheck,
  Users,
  Pencil,
  X,
  ChevronRight,
  User,
  Mail,
  Phone,
  Contrast,
} from 'lucide-react';
import { soundEffects } from '../utils/audio';
import { authApi, walletApi, ApiError } from '../lib/api';

interface SettingsPageProps {
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  profile: StudentProfile;
  onUpdateProfile: (profile: StudentProfile) => void;
  onBack: () => void;
}

export const Settings: React.FC<SettingsPageProps> = ({
  settings,
  onUpdateSettings,
  profile,
  onUpdateProfile,
  onBack,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneSuccess, setPhoneSuccess] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [modalRegNo, setModalRegNo] = useState('');
  const [modalDepartment, setModalDepartment] = useState('');
  const [modalLevel, setModalLevel] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggleTheme = () => {
    soundEffects.playTap();
    onUpdateSettings({ ...settings, theme: settings.theme === 'light' ? 'dark' : 'light' });
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    setBusy(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(true);
      soundEffects.playSuccessChime();
      setTimeout(() => { setPasswordSuccess(false); setShowPasswordSection(false); }, 2000);
    } catch (err) {
      soundEffects.playError();
      setPasswordError(err instanceof ApiError ? err.message : 'Could not change password');
    } finally {
      setBusy(false);
    }
  };

  const handleProfilePicture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      soundEffects.playSuccessChime();
      onUpdateProfile({ ...profile, avatarUrl: String(reader.result) });
    };
    reader.readAsDataURL(file);
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError(null);
    setPhoneSuccess(false);
    const value = phone.trim();
    if (!value) {
      setPhoneError('Enter your phone number.');
      return;
    }
    setPhoneBusy(true);
    try {
      const res = await walletApi.updatePhone(value);
      onUpdateProfile({ ...profile, phone: res.phone });
      soundEffects.playSuccessChime();
      setPhoneSuccess(true);
      setTimeout(() => setPhoneSuccess(false), 3000);
    } catch (err) {
      soundEffects.playError();
      setPhoneError(err instanceof ApiError ? err.message : 'Could not update phone number');
    } finally {
      setPhoneBusy(false);
    }
  };

  const openEditModal = () => {
    setModalRegNo(profile.regNo);
    setModalDepartment(profile.department);
    setModalLevel((profile.level ?? '').replace(' Level', ''));
    setEditError(null);
    setEditSuccess(false);
    setShowEditModal(true);
  };

  const saveProfileEdit = async () => {
    const trimmedRegNo = modalRegNo.trim();
    const trimmedDept = modalDepartment.trim();
    const trimmedLevel = modalLevel.trim();

    if (!trimmedRegNo || !trimmedDept || !trimmedLevel) {
      setEditError('All fields are required.');
      return;
    }

    setEditBusy(true);
    setEditError(null);
    try {
      const res = await authApi.updateMe({
        regNo: trimmedRegNo,
        department: trimmedDept,
        level: trimmedLevel,
      });
      onUpdateProfile({
        ...profile,
        regNo: res.student.regNo,
        department: res.student.department,
        level: res.student.level,
      });
      soundEffects.playSuccessChime();
      setEditSuccess(true);
      setTimeout(() => {
        setShowEditModal(false);
        setEditSuccess(false);
      }, 1500);
    } catch (err) {
      soundEffects.playError();
      setEditError(err instanceof ApiError ? err.message : 'Could not update profile');
    } finally {
      setEditBusy(false);
    }
  };

  const sectionHeading = 'text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wider';
  const cardClass = 'bg-white dark:bg-[#1a1a1a] rounded-xl p-4 flex items-center justify-between border border-slate-200 dark:border-[#333333]';

  return (
    <div className="space-y-0">
      {/* Page header */}
      <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 py-3 border-b border-slate-200/60 dark:border-[#333333] flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-xl hover:bg-slate-200/60 dark:hover:bg-neutral-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Account Preferences
          </h2>
        </div>
      </div>

      <div className="py-6 space-y-8">
        {/* Chief admin invite code */}
        {profile.inviteCode && (
          <div className="bg-white dark:bg-[#1a1a1a] rounded-xl p-4 flex items-center gap-3 border border-slate-200 dark:border-[#333333]">
            <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-xs text-slate-900 dark:text-slate-100">
                {profile.className || 'Your Class'}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Share this code with students to join
              </p>
            </div>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard?.writeText(profile.inviteCode!);
                } catch { /* ignore */ }
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> {profile.inviteCode}</>}
            </button>
          </div>
        )}

        {/* Profile Photo Section */}
        <section className="flex items-center gap-4">
          <div className="relative shrink-0">
            <img
              src={profile.avatarUrl}
              alt={profile.fullName}
              className="w-16 h-16 rounded-full object-cover border border-slate-200 dark:border-[#333333]"
              referrerPolicy="no-referrer"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-0 right-0 bg-purple-600 text-white p-1 rounded-full border-2 border-white dark:border-black flex items-center justify-center shadow-sm cursor-pointer"
              aria-label="Change profile picture"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleProfilePicture}
            />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Profile Photo</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Upload a photo for your account</p>
          </div>
        </section>

        {/* Account Section */}
        <section>
          <h3 className={sectionHeading}>Account</h3>
          <div className="flex flex-col gap-3">
            {/* Username */}
            <div className={cardClass}>
              <div className="flex items-center gap-3">
                <div className="text-slate-400 w-6 flex justify-center"><User className="w-5 h-5" /></div>
                <div>
                  <p className="text-xs font-medium text-slate-900 dark:text-white mb-0.5">Username</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{profile.fullName}</p>
                </div>
              </div>
              <button
                onClick={openEditModal}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <Pencil className="w-5 h-5" />
              </button>
            </div>

            {/* Email */}
            <div className={cardClass}>
              <div className="flex items-center gap-3">
                <div className="text-slate-400 w-6 flex justify-center"><Mail className="w-5 h-5" /></div>
                <div>
                  <p className="text-xs font-medium text-slate-900 dark:text-white mb-0.5">Email address</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 truncate max-w-[180px]">{profile.email}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {profile.emailVerified ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    <BadgeCheck className="w-3.5 h-3.5" /> verified
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                    <AlertCircle className="w-3.5 h-3.5" /> not verified
                  </span>
                )}
              </div>
            </div>

            {/* Phone */}
            <form onSubmit={handlePhoneSubmit} className={cardClass + ' flex-col !items-stretch gap-3'}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-slate-400 w-6 flex justify-center"><Phone className="w-5 h-5" /></div>
                  <div>
                    <p className="text-xs font-medium text-slate-900 dark:text-white mb-0.5">Phone No</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{profile.phone || 'Not set'}</p>
                  </div>
                </div>
                {profile.phone && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">saved</span>
                )}
              </div>
              {/* Inline phone edit */}
              <div className="space-y-2">
                <input
                  type="tel"
                  required
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08030000000"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-neutral-700 text-xs font-semibold bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-slate-100 focus:outline-purple-600"
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  11 digits (0XXXXXXXXXX). +234 is accepted and converted automatically.
                </p>
                {phoneError && <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{phoneError}</p>}
                {phoneSuccess && (
                  <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Phone number saved
                  </p>
                )}
                <button
                  type="submit"
                  disabled={phoneBusy}
                  className="w-full py-2 px-4 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  {phoneBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {profile.phone ? 'Change Phone Number (200 pts)' : 'Save Phone Number'}
                </button>
              </div>
            </form>
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 leading-relaxed">
            PocketFi needs your phone number to create your personal funding account.{' '}
            <span className="text-rose-600 dark:text-rose-400 font-medium">Changing phone number will cost 200 points</span>
          </p>
        </section>

        {/* App Settings Section */}
        <section>
          <h3 className={sectionHeading}>App Settings</h3>
          <div className="flex flex-col gap-3">
            {/* Appearance */}
            <div className={cardClass}>
              <div className="flex items-center gap-3">
                <div className="text-slate-400 w-6 flex justify-center"><Contrast className="w-5 h-5" /></div>
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white mb-0.5">Appearance</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{settings.theme} mode</p>
                </div>
              </div>
              <button
                onClick={toggleTheme}
                role="switch"
                aria-checked={settings.theme === 'dark'}
                className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  settings.theme === 'dark' ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow absolute top-1 transition duration-200 ${
                    settings.theme === 'dark' ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Password */}
            <button
              onClick={() => setShowPasswordSection(!showPasswordSection)}
              className={cardClass + ' cursor-pointer hover:bg-slate-50 dark:hover:bg-[#1e1e1e] transition-colors'}
            >
              <div className="flex items-center gap-3">
                <div className="text-slate-400 w-6 flex justify-center"><Lock className="w-5 h-5" /></div>
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-900 dark:text-white mb-0.5">Password</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Tap to change password</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400" />
            </button>

            {/* Password Change Form (expandable) */}
            {showPasswordSection && (
              <form onSubmit={handlePasswordSubmit} className="bg-white dark:bg-[#1a1a1a] rounded-xl p-4 border border-slate-200 dark:border-[#333333] space-y-3">
                <input
                  type="password"
                  required
                  placeholder="Current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-neutral-700 text-xs font-semibold bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-slate-100 focus:outline-purple-600"
                />
                <input
                  type="password"
                  required
                  placeholder="New password (min 8 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-neutral-700 text-xs font-semibold bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-slate-100 focus:outline-purple-600"
                />
                <input
                  type="password"
                  required
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-neutral-700 text-xs font-semibold bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-slate-100 focus:outline-purple-600"
                />
                {passwordError && <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{passwordError}</p>}
                {passwordSuccess && (
                  <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Password updated successfully
                  </p>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Update Password
                </button>
              </form>
            )}
          </div>
        </section>

        {/* Security note */}
        <div className="flex items-start gap-2 px-1">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Your password and payment data are handled by the Webuy backend. We never store your
            password in plain text.
          </p>
        </div>
      </div>

      {/* Edit Profile Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-xl border border-slate-200 dark:border-neutral-800">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/60 dark:border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300 flex items-center justify-center">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-900 dark:text-slate-100">Edit Profile</p>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                    {profile.freeProfileEditUsed ? 'Costs 100 points' : 'First edit is free'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 rounded-xl hover:bg-slate-200/60 dark:hover:bg-neutral-800 text-slate-400 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  Full Name <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase">Read only</span>
                </label>
                <input
                  readOnly
                  value={profile.fullName}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-semibold bg-slate-100 dark:bg-neutral-800 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-500">Name is tied to your funding account and cannot be changed.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Reg No</label>
                <input
                  value={modalRegNo}
                  onChange={(e) => setModalRegNo(e.target.value)}
                  placeholder="e.g. CSC/2024/001"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-semibold focus:outline-purple-600 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Department</label>
                <input
                  value={modalDepartment}
                  onChange={(e) => setModalDepartment(e.target.value)}
                  placeholder="e.g. Computer Science"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-semibold focus:outline-purple-600 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Level</label>
                <input
                  value={modalLevel}
                  onChange={(e) => setModalLevel(e.target.value)}
                  placeholder="e.g. 300"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-semibold focus:outline-purple-600 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              {editError && <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{editError}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={saveProfileEdit}
                  disabled={editBusy || editSuccess}
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {editBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editSuccess ? <Check className="w-3.5 h-3.5" /> : null}
                  {editSuccess ? 'Saved' : profile.freeProfileEditUsed ? 'Save Changes (100 pts)' : 'Save Changes (Free)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
