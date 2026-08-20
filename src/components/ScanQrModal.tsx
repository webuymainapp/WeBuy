import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QrCode, X, ScanLine, Keyboard, CheckCircle2, AlertCircle } from 'lucide-react';
import { soundEffects } from '../utils/audio';

interface ScanQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDecoded: (rawToken: string) => Promise<'ok' | 'not_found' | 'already' | 'error'>;
}

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

type ScanResult = 'ok' | 'not_found' | 'already' | 'error' | null;

export const ScanQrModal: React.FC<ScanQrModalProps> = ({ isOpen, onClose, onDecoded }) => {
  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult>(null);
  const [scanning, setScanning] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const handledRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    handledRef.current = false;
  }, []);

  // Cleanup camera on close/unmount
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setScanResult(null);
      setCameraError(null);
      setManualError(null);
      setManualInput('');
    }
    return () => stopCamera();
  }, [isOpen, stopCamera]);

  const handleDetected = useCallback(
    async (rawValue: string) => {
      if (handledRef.current) return;
      handledRef.current = true;
      try {
        const result = await onDecoded(rawValue);
        setScanResult(result);
        if (result === 'ok') {
          soundEffects.playSuccessChime();
          stopCamera();
          setTimeout(() => onClose(), 1200);
        } else if (result === 'error') {
          setManualError('Verification failed. Try again.');
          soundEffects.playError();
        } else {
          soundEffects.playError();
          setTimeout(() => {
            setScanResult(null);
            handledRef.current = false;
          }, 1600);
        }
      } catch {
        setScanResult(null);
        handledRef.current = false;
      }
    },
    [onDecoded, onClose, stopCamera]
  );

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setScanning(true);
    handledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      const BD = (window as unknown as { BarcodeDetector?: new () => BarcodeDetectorLike }).BarcodeDetector;
      if (BD) {
        detectorRef.current = new BD();
      }

      const tick = async () => {
        const videoEl = videoRef.current;
        const detector = detectorRef.current;
        if (videoEl && videoEl.readyState >= 2 && detector) {
          try {
            const codes = await detector.detect(videoEl);
            for (const code of codes) {
              if (code.rawValue) {
                handleDetected(code.rawValue);
                return;
              }
            }
          } catch {
            // detection frame error, keep going
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setCameraError('Camera unavailable. Use "Enter pass code" below instead.');
      setScanning(false);
    }
  }, [handleDetected]);

  // Start camera when opened on camera tab
  useEffect(() => {
    if (isOpen && mode === 'camera') {
      startCamera();
    } else {
      stopCamera();
      setScanning(false);
    }
  }, [isOpen, mode, startCamera, stopCamera]);

  const handleManualVerify = async () => {
    setManualError(null);
    const raw = manualInput.trim();
    if (!raw) {
      soundEffects.playError();
      setManualError('Paste the pass code you copied from the student app.');
      return;
    }
    const result = await onDecoded(raw);
    setScanResult(result);
    if (result === 'ok') {
      soundEffects.playSuccessChime();
      setTimeout(() => {
        onClose();
        setManualInput('');
      }, 1200);
    } else if (result === 'error') {
      setManualError('Verification failed. Try again.');
      soundEffects.playError();
    } else {
      soundEffects.playError();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-neutral-700 overflow-hidden text-slate-900 dark:text-slate-100 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
              <ScanLine className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold tracking-tight">Scan QR Pickup Pass</h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Verify a student&apos;s pass and mark as collected
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

        {/* Mode Tabs */}
        <div className="px-5 pt-4">
          <div className="flex items-center p-1 bg-slate-100 dark:bg-neutral-800 rounded-xl border border-slate-200 dark:border-neutral-700">
            <button
              onClick={() => setMode('camera')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === 'camera'
                  ? 'bg-white dark:bg-neutral-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              Camera
            </button>
            <button
              onClick={() => setMode('manual')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === 'manual'
                  ? 'bg-white dark:bg-neutral-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Keyboard className="w-3.5 h-3.5" />
              Enter code
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {scanResult === 'ok' && (
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <p className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300 mt-1">
                Pass verified — marked as collected!
              </p>
            </div>
          )}

          {scanResult === 'not_found' && (
            <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 text-center">
              <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
              <p className="text-sm font-extrabold text-amber-700 dark:text-amber-300 mt-1">
                No matching paid record found
              </p>
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                Check the student&apos;s course and registration number.
              </p>
            </div>
          )}

          {scanResult === 'already' && (
            <div className="rounded-2xl border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 p-4 text-center">
              <CheckCircle2 className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-sm font-extrabold text-slate-700 dark:text-slate-300 mt-1">
                This pass was already collected
              </p>
            </div>
          )}

          {mode === 'camera' && !scanResult && (
            <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-square max-h-72 flex items-center justify-center">
              {scanning ? (
                <>
                  <video
                    ref={videoRef}
                    className="absolute inset-0 w-full h-full object-cover"
                    playsInline
                    muted
                  />
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-40 border-2 border-indigo-400/80 rounded-2xl animate-pulse" />
                  </div>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] font-bold px-3 py-1.5 rounded-full backdrop-blur-xs whitespace-nowrap">
                    Align the pass QR inside the frame
                  </div>
                </>
              ) : cameraError ? (
                <div className="text-center px-6">
                  <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                  <p className="text-xs text-slate-200 mt-2 font-semibold">{cameraError}</p>
                </div>
              ) : (
                <div className="w-10 h-10 border-4 border-slate-600 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
          )}

          {mode === 'manual' && (
            <div className="space-y-3">
              <textarea
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                rows={3}
                placeholder="Paste the full pass code copied from the student app here"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-xs font-mono focus:outline-indigo-600 bg-slate-50 dark:bg-neutral-800 dark:text-slate-100 resize-none"
              />
              {manualError && (
                <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {manualError}
                </p>
              )}
              <button
                onClick={handleManualVerify}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all cursor-pointer"
              >
                Verify Pass Code
              </button>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                In the student app, open the QR pass and tap{" "}
                <strong>Copy pass code</strong>, then paste it here. This is a fallback when the
                camera is unavailable.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
