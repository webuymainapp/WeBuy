import React, { useEffect, useState } from 'react';
import { Textbook, StudentProfile } from '../types';
import QRCode from 'qrcode';
import {
  X,
  QrCode,
  MapPin,
  User,
  CheckCircle2,
  Copy,
  Check,
  ShieldCheck,
  Hash,
} from 'lucide-react';
import { soundEffects } from '../utils/audio';

interface QrPassModalProps {
  textbook: Textbook | null;
  profile: StudentProfile;
  onClose: () => void;
}

export const QrPassModal: React.FC<QrPassModalProps> = ({ textbook, profile, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const passToken = textbook?.passToken ?? '';

  useEffect(() => {
    if (!textbook || !passToken) return;
    QRCode.toDataURL(passToken, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [textbook, passToken]);

  if (!textbook) return null;

  const isCollected = textbook.status === 'collected';
  const passCode = passToken || 'Not available';

  const handleCopy = () => {
    soundEffects.playTap();
    navigator.clipboard?.writeText(passCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-sm bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-800 overflow-hidden text-slate-900 dark:text-slate-100 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold tracking-tight">QR Pickup Pass</h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {isCollected ? 'Already collected' : 'Ready for pickup'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-600 dark:text-slate-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Ticket body */}
          <div className="rounded-2xl border border-slate-200 dark:border-neutral-700 overflow-hidden">
            {/* QR area */}
            <div className="bg-white p-5 flex flex-col items-center">
              {isCollected ? (
                <div className="w-44 h-44 flex flex-col items-center justify-center bg-slate-100 dark:bg-neutral-800 rounded-2xl border border-slate-200 dark:border-neutral-700">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                  <p className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300 mt-2">
                    Pass Used
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Collected at pickup
                  </p>
                </div>
              ) : qrDataUrl ? (
                <img src={qrDataUrl} alt="QR Pass" className="w-44 h-44 rounded-2xl" />
              ) : passToken ? (
                <div className="w-44 h-44 rounded-2xl bg-slate-100 dark:bg-neutral-800 animate-pulse" />
              ) : (
                <div className="w-44 h-44 flex flex-col items-center justify-center bg-slate-100 dark:bg-neutral-800 rounded-2xl border border-slate-200 dark:border-neutral-700">
                  <ShieldCheck className="w-8 h-8 text-slate-400" />
                  <p className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 mt-2">
                    Pass not issued yet
                  </p>
                </div>
              )}
              <div className="mt-3 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Webuy Verified Pass
                </span>
              </div>
            </div>

            {/* Perforation */}
            <div className="border-t border-dashed border-slate-300 dark:border-slate-600 mx-4" />

            {/* Pass details */}
            <div className="p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-mono">
                  {textbook.courseCode}
                </span>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 font-mono">
                  {textbook.transactionRef}
                </span>
              </div>
              <p className="font-extrabold text-sm leading-snug text-slate-900 dark:text-slate-100">
                {textbook.bookTitle}
              </p>
              <div className="space-y-1.5 text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{profile.fullName}</span>
                  <span className="font-mono text-slate-400 dark:text-slate-500">{profile.regNo}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{textbook.pickupLocation}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">
                    Ref: <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{textbook.transactionRef}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {!isCollected && (
            <button
              onClick={handleCopy}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Pass code copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy pass code
                </>
              )}
            </button>
          )}

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed text-center">
            {isCollected
              ? 'This pass has already been verified and your textbook handed out.'
              : `Show this QR to ${textbook.classRepName} at the pickup point to collect your textbook.`}
          </p>
        </div>
      </div>
    </div>
  );
};
