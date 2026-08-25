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
  devOtp?: boolean;
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
  devOtp,
}) => {
  const [mode, setMode] = useState<AuthMode>(initialMode ?? 'signin');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // OTP verification state (set after a successful signup or password reset).
  const [otpScreen, setOtpScreen] = useState<{ identity: string; email: string; purpose: 'signup' | 'reset' } | null>(
    devOtp ? { identity: 'dev@test.com', email: 'dev@test.com', purpose: 'reset' } : null,
  );
  const [otp, setOtp] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpMsg, setOtpMsg] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Password reset state (after OTP verified in reset mode).
  const [resetScreen, setResetScreen] = useState<{ identity: string; otp: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  type OtpStage = 'idle' | 'success' | 'failure';
  const [otpStage, setOtpStage] = useState<OtpStage>('idle');

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
      // Push the mail outbox drainer so the OTP email is sent right away.
      try {
        await sendVerificationEmail();
      } catch {
        // Email sending is non-fatal for signup.
      }
      soundEffects.playSuccessChime();
      setOtpScreen({ identity: res.student.regNo, email: res.student.email });
      setCooldown(60);
      setOtp('');
      setOtpError(null);
      setOtpMsg(null);
    } catch (err) {
      soundEffects.playError();
      setError(err instanceof ApiError ? err.message : 'Unable to create account');
    } finally {
      setBusy(false);
    }
  };

  const handleOtpBoxChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = otp.split('');
    next[index] = digit;
    setOtp(next.join(''));
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpBoxKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) otpRefs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpBoxPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!digits) return;
    const filled = digits;
    setOtp(filled);
    otpRefs.current[Math.min(filled.length, 5)]?.focus();
  };

  const [shakeKey, setShakeKey] = useState(0);

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpScreen || otp.length !== 6) return;
    setOtpError(null);
    setOtpMsg(null);
    setOtpBusy(true);

    // For password reset, just verify the OTP via reset-password endpoint... 
    // Actually we need a separate verify endpoint. For now, verify via the existing
    // flow then route to reset screen on success.
    if (otpScreen.purpose === 'reset') {
      try {
        // Verify the OTP by calling forgot-password won't work — we need to just
        // store the OTP and pass it to the reset-password form.
        setResetScreen({ identity: otpScreen.identity, otp });
        setOtpBusy(false);
        return;
      } catch {
        // fallthrough
      }
    }

    const apiPromise = authApi.verifyOtp(otpScreen.identity, otp);

    let ok = false;
    let res: Awaited<ReturnType<typeof authApi.verifyOtp>> | null = null;
    let err: unknown = null;
    try {
      res = await apiPromise;
      ok = true;
    } catch (caught) {
      err = caught;
    }

    if (ok && res) {
      setOtpStage('success');
      setToken(res.token);
      onAuthSuccess(res.student);
    } else {
      setOtpStage('failure');
      soundEffects.playError();
      setOtpError(
        err instanceof ApiError ? err.message : 'Verification failed. Try again.',
      );
      // Show the red X briefly, then slide the boxes back in with a shake.
      window.setTimeout(() => {
        setOtpStage('idle');
        setOtp('');
        setOtpBusy(false);
        setShakeKey((k) => k + 1);
        otpRefs.current[0]?.focus();
      }, 1500);
    }
  };

  const handleResendOtp = async () => {
    if (!otpScreen) return;
    setResending(true);
    setOtpError(null);
    setOtpMsg(null);
    try {
      const res = await authApi.resendOtp(otpScreen.identity);
      if (res.cooldown) {
        setCooldown(res.cooldown);
        setOtpMsg(`Please wait ${res.cooldown}s before resending.`);
      } else if (res.sent) {
        setCooldown(60);
        try {
          await sendVerificationEmail();
        } catch {
          // ignore
        }
        setOtpMsg('A new code has been sent to your inbox.');
        setOtp('');
      } else {
        setOtpMsg('No pending signup found for this account. Please sign up again.');
      }
    } catch (err) {
      setOtpError(err instanceof ApiError ? err.message : 'Could not resend the code.');
    } finally {
      setResending(false);
    }
  };

  const handleSignInResend = async () => {
    if (!signInEmailOrRegNo.trim()) {
      setError('Enter your email or registration number to resend the code.');
      return;
    }
    setResending(true);
    setError(null);
    try {
      const res = await authApi.resendOtp(signInEmailOrRegNo.trim());
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
        setError('A new verification code has been sent to your inbox.');
      } else {
        setError('No pending signup found for this account. Please sign up first.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resend the code.');
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
      setOtpScreen({ identity, email: identity, purpose: 'reset' });
      setCooldown(60);
      setOtp('');
      setOtpError(null);
      setOtpMsg('A password reset code has been sent to your email.');
    } catch (err) {
      soundEffects.playError();
      setError(err instanceof ApiError ? err.message : 'Could not send reset code');
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetScreen) return;
    setResetError(null);
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match.');
      return;
    }
    setResetBusy(true);
    try {
      await authApi.resetPassword(resetScreen.identity, resetScreen.otp, newPassword);
      soundEffects.playSuccessChime();
      setResetSuccess(true);
      setResetScreen(null);
      setOtpScreen(null);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      soundEffects.playError();
      setResetError(err instanceof ApiError ? err.message : 'Could not reset password');
    } finally {
      setResetBusy(false);
    }
  };

  // ---- New Password Screen (after OTP verified in reset mode) ----
  if (resetScreen) {
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
              onClick={() => { setResetScreen(null); setOtpScreen(null); setNewPassword(''); setConfirmPassword(''); setResetError(null); }}
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

  if (otpScreen) {
    return (
      <div className="min-h-dvh bg-slate-100 dark:bg-black flex flex-col items-center justify-center p-4 sm:p-6 text-slate-900 dark:text-slate-100">
        <div className="relative w-full max-w-md bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-700 overflow-hidden">
          <div className="p-6 bg-slate-900 text-white space-y-1">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black text-lg shadow-sm">
              W
            </div>
            <h3 className="text-xl font-extrabold tracking-tight mt-2">
              {otpScreen.purpose === 'reset' ? 'Password reset code' : 'Enter verification code'}
            </h3>
            <p className="text-xs text-slate-400">
              {otpScreen.purpose === 'reset'
                ? <>We sent a 6-digit code to <strong className="text-slate-200">{otpScreen.email}</strong>. It expires in 10 minutes.</>
                : <>We sent a 6-digit code to <strong className="text-slate-200">{otpScreen.email}</strong>. It expires in 10 minutes.</>}
            </p>
          </div>

          <form onSubmit={handleVerifyOtp} className="p-6 space-y-4">
            {otpStage === 'idle' && otpError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{otpError}</span>
              </div>
            )}
            {otpStage === 'idle' && otpMsg && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{otpMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-3">
                Verification code
              </label>

              <div className="relative">
                <motion.div
                  key={shakeKey}
                  initial={false}
                  animate={shakeKey > 0 ? { x: [0, -10, 10, -6, 6, 0] } : { x: 0 }}
                  transition={{ duration: 0.45, ease: 'easeInOut' }}
                  className="relative"
                >
                  <div className="flex justify-between gap-1.5 sm:gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <input
                        key={i}
                        ref={(el) => { otpRefs.current[i] = el; }}
                        type="text"
                        inputMode="numeric"
                        required
                        autoFocus={i === 0}
                        maxLength={1}
                        disabled={otpBusy || otpStage !== 'idle'}
                        value={otp[i] ?? ''}
                        onChange={(e) => handleOtpBoxChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpBoxKeyDown(i, e)}
                        onPaste={handleOtpBoxPaste}
                        aria-label={`Digit ${i + 1}`}
                        className={`flex-1 min-w-0 h-12 sm:h-14 rounded-xl border text-center text-xl sm:text-2xl font-mono font-black focus:outline-indigo-600 focus:border-indigo-500 bg-slate-50 dark:bg-neutral-800 dark:text-slate-100 ${
                          otpStage === 'success'
                            ? 'border-emerald-500 dark:border-emerald-500 text-emerald-600 dark:text-emerald-400'
                            : otpStage === 'failure'
                              ? 'border-rose-500 dark:border-rose-500 text-rose-600 dark:text-rose-400'
                              : 'border-slate-200 dark:border-neutral-700'
                        }`}
                      />
                    ))}
                  </div>
                </motion.div>
              </div>

              {otpStage !== 'idle' ? (
                <p className="mt-3 text-center text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  {otpStage === 'success'
                    ? 'Account activated — taking you in…'
                    : otpStage === 'failure'
                      ? 'Incorrect code — try again'
                      : 'Verifying your code…'}
                </p>
              ) : (
                <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500 text-center">
                  Didn't receive it? Tap "Resend code" below.
                </p>
              )}
            </div>

            {otpStage === 'idle' && (
              <>
                <button
                  type="submit"
                  disabled={otpBusy || otp.length !== 6}
                  className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-200 transition-all cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{otpScreen.purpose === 'reset' ? 'Verify Code' : 'Verify & Activate Account'}</span>
                </button>

                <button
                  type="button"
                  onClick={otpScreen.purpose === 'reset' ? handleForgotPassword : handleResendOtp}
                  disabled={resending || cooldown > 0}
                  className="w-full text-center text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {cooldown > 0
                    ? `Resend in ${cooldown}s`
                    : resending
                      ? 'Sending…'
                      : "Didn't get it? Resend code"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOtpScreen(null);
                    setError(null);
                  }}
                  className="w-full text-center text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3 inline mr-1 -mt-0.5" />
                  Change details
                </button>
              </>
            )}
          </form>
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
            Your password has been updated. You can now sign in with your new password.
          </p>
          <button
            onClick={() => { setResetSuccess(false); setSignInPassword(''); }}
            className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-200 transition-all cursor-pointer"
          >
            Sign In
            <ArrowRight className="w-4 h-4" />
          </button>
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
                    : 'Resend verification code'}
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
                <span>{busy ? 'Creating account…' : 'Create Account & Get Code'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">
                We'll email you a 6-digit code to activate your account.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};