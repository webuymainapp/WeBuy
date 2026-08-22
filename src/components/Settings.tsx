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
  ShieldCheck,
  AlertCircle,
  Loader2,
  BadgeCheck,
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
  const fileRef = useRef<HTMLInputElement>(null);

  const toggleTheme = () => {
    soundEffects.playTap();
    onUpdateSettings({ ...settings, theme: settings.theme === 'light' ? 'dark' : 'light' });
  };

  const toggleSound = () => {
    soundEffects.playTap();
    onUpdateSettings({ ...settings, soundEnabled: !settings.soundEnabled });
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
      setTimeout(() => setPasswordSuccess(false), 3000);
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
    const value = phone.replace(/\D/g, '');
    if (value.length < 10) {
      setPhoneError('Enter a valid 10–11 digit phone number.');
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

  const inputClass =
    'w-1/2 min-w-[10rem] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-semibold focus:outline-indigo-600 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-slate-100';

  return (
    <div className="space-y-0">
      {/* Page header — flush strip */}
      <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 py-3 border-b border-slate-200/60 dark:border-neutral-800 flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-xl hover:bg-slate-200/60 dark:hover:bg-neutral-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Settings
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Preferences for your Webuy portal
          </p>
        </div>
      </div>

      <div className="divide-y divide-slate-200/70 dark:divide-neutral-800">
        {/* Theme Toggle */}
        <div className="flex items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
              {settings.theme === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </div>
            <div>
              <p className="font-bold text-xs">Appearance</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">{settings.theme} mode</p>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            role="switch"
            aria-checked={settings.theme === 'dark'}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${
              settings.theme === 'dark' ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition duration-200 ${
                settings.theme === 'dark' ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Sound Toggle */}
        <div className="flex items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300 flex items-center justify-center">
              {settings.soundEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            </div>
            <div>
              <p className="font-bold text-xs">Sound Effects</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {settings.soundEnabled ? 'Enabled' : 'Muted'}
              </p>
            </div>
          </div>
          <button
            onClick={toggleSound}
            role="switch"
            aria-checked={settings.soundEnabled}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 ${
              settings.soundEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition duration-200 ${
                settings.soundEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Account */}
        <div className="py-4 space-y-2">
          <div className="flex items-center gap-2">
            <BadgeCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
            <p className="font-bold text-xs">Account</p>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{profile.email}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {profile.emailVerified ? (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <BadgeCheck className="w-3.5 h-3.5" /> Email verified
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-3.5 h-3.5" /> Email not yet verified
              </span>
            )}
          </p>
        </div>

        {/* Phone number — required to generate the funding account */}
        <form
          onSubmit={handlePhoneSubmit}
          className="py-4 space-y-2.5"
        >
          <div>
            <p className="font-bold text-xs flex items-center gap-1.5">
              Phone Number
              <span className="text-[9px] font-extrabold uppercase text-amber-600 dark:text-amber-400">
                {profile.phone ? 'Saved' : 'Required'}
              </span>
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              PocketFi needs your phone to create your personal funding account.
            </p>
            {profile.phone && (
              <p className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 mt-1.5">
                Changing your phone number costs 200 points.
              </p>
            )}
          </div>
          <input
            type="tel"
            required
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^\d\s+]/g, ''))}
            placeholder="0803 000 0000"
            className={inputClass}
          />
          {phoneError && (
            <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{phoneError}</p>
          )}
          {phoneSuccess && (
            <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <Check className="w-3 h-3" /> Phone number saved
            </p>
          )}
          <button
            type="submit"
            disabled={phoneBusy}
            className="w-1/2 min-w-[10rem] py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {phoneBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {profile.phone ? 'Change Phone Number (200 pts)' : 'Save Phone Number'}
          </button>
        </form>

        {/* Profile Picture */}
        <div className="py-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <img
                src={profile.avatarUrl}
                alt={profile.fullName}
                className="w-12 h-12 rounded-2xl object-cover ring-2 ring-slate-200 dark:ring-slate-700"
                referrerPolicy="no-referrer"
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-md border-2 border-white dark:border-neutral-800 cursor-pointer"
                aria-label="Change profile picture"
              >
                <Camera className="w-3 h-3" />
              </button>
            </div>
            <div>
              <p className="font-bold text-xs">Profile Picture</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Upload a photo for your account</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleProfilePicture}
            />
          </div>
        </div>

        {/* Change Password */}
        <form
          onSubmit={handlePasswordSubmit}
          className="py-4 space-y-3"
        >
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
            <p className="font-bold text-xs">Change Password</p>
          </div>

          <input
            type="password"
            required
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputClass}
          />
          <input
            type="password"
            required
            placeholder="New password (min 8 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
          />
          <input
            type="password"
            required
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
          />

          {passwordError && (
            <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{passwordError}</p>
          )}
          {passwordSuccess && (
            <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <Check className="w-3 h-3" /> Password updated successfully
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-1/2 min-w-[10rem] py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Update Password
          </button>
        </form>

        {/* Security note */}
        <div className="py-4 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <p className="font-bold text-xs">Security</p>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Your password and payment data are handled by the Webuy backend. We never store your
            password in this app.
          </p>
        </div>
      </div>
    </div>
  );
};