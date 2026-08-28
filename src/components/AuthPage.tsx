import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ArrowLeft, Lock, Mail, User, GraduationCap, Building2, AtSign, KeyRound, AlertCircle, ShieldCheck, Loader2, RotateCcw } from 'lucide-react';
import { soundEffects } from '../utils/audio';
import { authApi, sendVerificationEmail, ApiError, setToken, type AuthStudent } from '../lib/api';
import { PasswordInput } from './PasswordInput';

interface AuthPageProps {
  onClose: () => void;
  onAuthSuccess: (student: AuthStudent) => void;
  initialMode?: AuthMode;
  onBack?: () => void;
  resetToken?: string | null;
  onResetCleared?: () => void;
  initialError?: string | null;
}

type AuthMode = 'signin' | 'signup';

const DEPARTMENTS = [
  'Computer & Electrical Engineering',
  'Computer Science',
  'Faculty of Law',
  'Medicine & Surgery',
  'Business Administration',
  'General Studies',
];

export const AuthPage: React.FC<AuthPageProps> = ({
  onClose,
  onAuthSuccess,
  initialMode,
  onBack,
  resetToken,
  onResetCleared,
  initialError,
}) => {
  const [mode, setMode] = useState<AuthMode>(initialMode ?? 'signin');
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);

  // "Check your inbox" screen shown after signup (activate via emailed link) or
  // after requesting a password reset.
  const [verifyScreen, setVerifyScreen] = useState<{ identity: string; email: string; purpose: 'signup' | 'reset' } | null>(null);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  // Password reset state. The user reaches this screen by clicking the emailed
  // reset link (?reset=TOKEN), so the token comes in from App as `resetToken`.
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  // Stash the fresh session from the reset endpoint so the success screen can
  // auto-sign-in and drop the user onto their dashboard without any tap.
  const resetResultRef = useRef<{ token: string; student: AuthStudent } | null>(null);

  // Auto-redirect: after showing the reset success screen, sign in and go
  // straight to the dashboard.
  useEffect(() => {
    if (!resetSuccess) return;
    const t = window.setTimeout(() => {
      const res = resetResultRef.current;
      if (res) {
        setToken(res.token);
        onAuthSuccess(res.student);
      }
    }, 2200);
    return () => clearTimeout(t);
  }, [resetSuccess, onAuthSuccess]);

  // Countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Sign In fields
  const [signInEmailOrRegNo, setSignInEmailOrRegNo] = useState('');
  const [signInPassword, setSignInPassword] = useState('');

  // Sign Up fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [regNo, setRegNo] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await authApi.signin({
        emailOrRegNo: signInEmailOrRegNo.trim(),
        password: signInPassword,
      });
      setToken(res.token);
      soundEffects.playSuccessChime();
      onAuthSuccess(res.student);
    } catch (err) {
      soundEffects.playError();
      setError(err instanceof ApiError ? err.message : 'Unable to sign in');
    } finally {
      setBusy(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await authApi.signup({
        regNo: regNo.trim().toUpperCase(),
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        inviteCode: inviteCode.trim().toUpperCase(),
      });
      // Push the mail outbox drainer so the verification email is sent right away.
      try {
        await sendVerificationEmail();
      } catch {
        // Email sending is non-fatal for signup.
      }
      soundEffects.playSuccessChime();
      setVerifyScreen({ identity: res.student.regNo, email: res.student.email, purpose: 'signup' });
      setCooldown(60);
      setVerifyMsg(null);
    } catch (err) {
      soundEffects.playError();
      setError(err instanceof ApiError ? err.message : 'Unable to create account');
    } finally {
      setBusy(false);
    }
  };

  const handleResendVerification = async () => {
    if (!verifyScreen) return;
    setResending(true);
    setVerifyMsg(null);
    try {
      if (verifyScreen.purpose === 'signup') {
        const res = await authApi.resendVerification(verifyScreen.identity);
        if (res.cooldown) {
          setCooldown(res.cooldown);
          setVerifyMsg(`Please wait ${res.cooldown}s before resending.`);
        } else if (res.sent) {
          setCooldown(60);
          try {
            await sendVerificationEmail();
          } catch {
            // ignore
          }
          setVerifyMsg('A new verification link has been sent to your inbox.');
        } else {
          setVerifyMsg('No pending signup found for this account. Please sign up again.');
        }
      } else {
        // Reset: forgot-password regenerates + emails a fresh reset link.
        await authApi.forgotPassword(verifyScreen.identity);
        setCooldown(60);
        try {
          await sendVerificationEmail();
        } catch {
          // ignore
        }
        setVerifyMsg('A new reset link has been sent to your inbox.');
      }
    } catch (err) {
      setVerifyMsg(err instanceof ApiError ? err.message : 'Could not resend the link.');
    } finally {
      setResending(false);
    }
  };

  const handleSignInResend = async () => {
    if (!signInEmailOrRegNo.trim()) {
      setError('Enter your email or registration number to resend the link.');
      return;
    }
    setResending(true);
    setError(null);
    try {
      const res = await authApi.resendVerification(signInEmailOrRegNo.trim());
      if (res.cooldown) {
        setCooldown(res.cooldown);
        setError(`Please wait ${res.cooldown}s before resending.`);
      } else if (res.sent) {
        setCooldown(60);
        try {
          await sendVerificationEmail();
        } catch {
          // ignore
        }
        setError('A new verification link has been sent to your inbox.');
      } else {
        setError('No pending signup found for this account. Please sign up first.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resend the link.');
    } finally {
      setResending(false);
    }
  };

  const handleForgotPassword = async () => {
    const identity = signInEmailOrRegNo.trim();
    if (!identity) {
      setError('Enter your email or registration number first.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await authApi.forgotPassword(identity);
      soundEffects.playSuccessChime();
      setVerifyScreen({ identity, email: identity, purpose: 'reset' });
      setCooldown(60);
      setVerifyMsg('A password reset link has been sent to your email.');
    } catch (err) {
      soundEffects.playError();
      setError(err instanceof ApiError ? err.message : 'Could not send reset link');
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetToken) return;
    setResetError(null);
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match.');
      return;
    }
    setResetBusy(true);
    try {
      const res = await authApi.resetPassword(resetToken, newPassword);
      soundEffects.playSuccessChime();
      resetResultRef.current = { token: res.token, student: res.student };
      setResetSuccess(true);
      onResetCleared?.();
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      soundEffects.playError();
      setResetError(err instanceof ApiError ? err.message : 'Could not reset password');
    } finally {
      setResetBusy(false);
    }
  };

  // ---- New Password Screen (from the emailed reset link) ----
  if (resetToken) {
    return (
      <div className="min-h-dvh bg-slate-100 dark:bg-black flex flex-col items-center justify-center p-4 sm:p-6 text-slate-900 dark:text-slate-100">
        <div className="relative w-full max-w-md bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-700 overflow-hidden">
          <div className="p-6 bg-slate-900 text-white space-y-1">
            <img src="/icons/logo.png" alt="WeBuy" className="w-9 h-9 rounded-xl object-cover shadow-sm" />
            <h3 className="text-xl font-extrabold tracking-tight mt-2">Set new password</h3>
            <p className="text-xs text-slate-400">Choose a strong password for your account.</p>
          </div>

          <form onSubmit={handleResetPassword} className="p-6 space-y-4">
            {resetError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{resetError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">New Password</label>
                <PasswordInput
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                  leftIcon={<Lock className="w-4 h-4" />}
                  className="py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-mono bg-slate-50 dark:bg-neutral-800 dark:text-slate-100 focus:outline-indigo-600"
                />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Confirm Password</label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Re-enter your password"
                  required
                  minLength={8}
                  leftIcon={<Lock className="w-4 h-4" />}
                  className="py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-mono bg-slate-50 dark:bg-neutral-800 dark:text-slate-100 focus:outline-indigo-600"
                />
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 mt-1">Passwords do not match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={resetBusy || !newPassword || !confirmPassword || newPassword !== confirmPassword}
              className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-200 transition-all cursor-pointer"
            >
              {resetBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>Reset Password</span>
            </button>

            <button
              type="button"
              onClick={() => { setNewPassword(''); setConfirmPassword(''); setResetError(null); onResetCleared?.(); }}
              className="w-full text-center text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 inline mr-1 -mt-0.5" />
              Back to sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ---- Check your inbox Screen (signup verification or password reset) ----
  if (verifyScreen) {
    return (
      <div className="min-h-dvh bg-slate-100 dark:bg-black flex flex-col items-center justify-center p-4 sm:p-6 text-slate-900 dark:text-slate-100">
        <div className="relative w-full max-w-md bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-700 overflow-hidden">
          <div className="p-6 bg-slate-900 text-white space-y-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 flex items-center justify-center mx-auto">
              <Mail className="w-7 h-7 text-indigo-400" />
            </div>
            <h3 className="text-xl font-extrabold tracking-tight">
              {verifyScreen.purpose === 'reset' ? 'Check your email' : 'Almost there!'}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {verifyScreen.purpose === 'reset'
                ? <>We sent a password reset link to <strong className="text-slate-200">{verifyScreen.email}</strong>. Click it to set a new password.</>
                : <>We sent a verification link to <strong className="text-slate-200">{verifyScreen.email}</strong>. Click it to activate your account.</>}
            </p>
          </div>

          <div className="p-6 space-y-4">
            {verifyMsg && (
              <div className={`flex items-start gap-2 p-3 rounded-xl border text-xs font-semibold ${
                verifyMsg.includes('sent')
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
              }`}>
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{verifyMsg}</span>
              </div>
            )}

            <div className="rounded-xl bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 p-3.5 text-center">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {verifyScreen.purpose === 'reset'
                  ? 'The link opens a secure page to choose a new password.'
                  : 'The link activates your account and signs you straight in.'}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">The link expires in 24 hours.</p>
            </div>

            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resending || cooldown > 0}
              className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-200 transition-all cursor-pointer"
            >
              {resending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : cooldown > 0 ? (
                `Resend link in ${cooldown}s`
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  Resend verification link
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setVerifyScreen(null);
                setError(null);
                setVerifyMsg(null);
              }}
              className="w-full text-center text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              {verifyScreen.purpose === 'reset' ? 'Back to sign in' : 'Change details'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Password Reset Success Screen ----
  if (resetSuccess) {
    return (
      <div className="min-h-dvh bg-slate-100 dark:bg-black flex flex-col items-center justify-center p-4 sm:p-6 text-slate-900 dark:text-slate-100">
        <div className="relative w-full max-w-md bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-700 overflow-hidden text-center p-8 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-xl font-extrabold tracking-tight">Password reset successful</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Your password has been updated. Redirecting you to your dashboard…
          </p>
          <div className="flex items-center justify-center gap-2 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-[11px] font-semibold">Taking you there now</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-100 dark:bg-black flex flex-col items-center justify-center p-4 sm:p-6 text-slate-900 dark:text-slate-100">
      <div className="relative w-full max-w-md bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-700 overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white space-y-1">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1 text-[11px] font-bold text-slate-300 hover:text-white mb-3 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to home
            </button>
          )}
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black text-lg shadow-sm">
            W
          </div>
          <h3 className="text-xl font-extrabold tracking-tight mt-2">
            {mode === 'signin' ? 'Student Portal Sign In' : 'Create Student Account'}
          </h3>
          <p className="text-xs text-slate-400">
            {mode === 'signin'
              ? 'Sign in with your registration number (or email) and password'
              : 'Register with your institutional details to access the portal'}
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="px-6 pt-5">
          <div className="flex items-center p-1 bg-slate-100 dark:bg-neutral-800 rounded-xl border border-slate-200 dark:border-neutral-700">
            <button
              type="button"
              onClick={() => {
                soundEffects.playTap();
                setMode('signin');
                setError(null);
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mode === 'signin'
                  ? 'bg-white dark:bg-neutral-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                soundEffects.playTap();
                setMode('signup');
                setError(null);
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mode === 'signup'
                  ? 'bg-white dark:bg-neutral-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              Sign Up
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'signin' ? (
            <form onSubmit={handleSignIn} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Registration Number or Email
                </label>
                <div className="relative">
                  <AtSign className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={signInEmailOrRegNo}
                    onChange={(e) => setSignInEmailOrRegNo(e.target.value)}
                    placeholder="e.g. ENG/2022/88219 or you@uni.edu.ng"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-mono font-bold focus:outline-indigo-600 bg-slate-50 dark:bg-neutral-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Password
                </label>
                <PasswordInput
                  value={signInPassword}
                  onChange={setSignInPassword}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  leftIcon={<Lock className="w-4 h-4" />}
                  className="py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-mono bg-slate-50 dark:bg-neutral-800 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={busy}
                  className="mt-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Forgot Password?
                </button>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-200 transition-all cursor-pointer mt-2"
              >
                <span>{busy ? 'Signing in…' : 'Sign In to Webuy Portal'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleSignInResend}
                disabled={resending || cooldown > 0}
                className="w-full text-center text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors cursor-pointer mt-1 disabled:opacity-50"
              >
                {cooldown > 0
                  ? `Resend in ${cooldown}s`
                  : resending
                    ? 'Sending…'
                    : 'Resend verification link'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Class Invite Code <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Ask your class chief for this code"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-mono font-bold focus:outline-indigo-600 bg-slate-50 dark:bg-neutral-800 dark:text-slate-100 uppercase"
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                  This code places you in your level/class. Don't have one? Ask your class chief.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Full Student Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Ada Obi"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-semibold focus:outline-indigo-600 bg-slate-50 dark:bg-neutral-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Registration Number
                  </label>
                  <div className="relative">
                    <AtSign className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={regNo}
                      onChange={(e) => setRegNo(e.target.value)}
                      placeholder="ENG/2022/88219"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-mono font-bold focus:outline-indigo-600 bg-slate-50 dark:bg-neutral-800 dark:text-slate-100 uppercase"
                    />
                  </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@university.edu.ng"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-semibold focus:outline-indigo-600 bg-slate-50 dark:bg-neutral-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Phone Number
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="08030000000"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-semibold focus:outline-indigo-600 bg-slate-50 dark:bg-neutral-800 dark:text-slate-100"
                  />
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  11 digits (0XXXXXXXXXX). +234 is accepted and converted automatically.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Create Password
                </label>
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  leftIcon={<Lock className="w-4 h-4" />}
                  className="py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-mono bg-slate-50 dark:bg-neutral-800 dark:text-slate-100"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-200 transition-all cursor-pointer mt-2"
              >
                <span>{busy ? 'Creating account…' : 'Create Account'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">
                We'll email you a link to activate your account.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};