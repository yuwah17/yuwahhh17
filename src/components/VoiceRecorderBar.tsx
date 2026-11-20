import React, { useEffect, useState } from 'react';
import { Mic, Square, Trash2, Send } from 'lucide-react';
import { ActiveRecorderSession } from '../lib/audio';

interface VoiceRecorderBarProps {
  session: ActiveRecorderSession;
  onCancel: () => void;
  onFinishAndSend: () => void;
  isSending: boolean;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const VoiceRecorderBar: React.FC<VoiceRecorderBarProps> = ({
  session,
  onCancel,
  onFinishAndSend,
  isSending,
}) => {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [peaks, setPeaks] = useState<number[]>(() => Array(24).fill(0.12));

  useEffect(() => {
    const start = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000));
      setPeaks(session.getLivePeaks());
    }, 90);

    return () => {
      window.clearInterval(timer);
    };
  }, [session]);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-rose-300 dark:border-rose-800/70 bg-rose-50/80 dark:bg-rose-950/30">
      <div className="flex items-center gap-2 shrink-0">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" aria-hidden="true" />
        <Mic className="w-4 h-4 text-rose-600 dark:text-rose-400" aria-hidden="true" />
        <span className="text-xs font-mono font-semibold tabular-nums text-rose-700 dark:text-rose-300 min-w-[40px]">
          {formatDuration(elapsedSec)}
        </span>
      </div>

      <div className="flex-1 flex items-center gap-1 h-7 overflow-hidden" aria-hidden="true">
        {peaks.map((peak, idx) => (
          <span
            key={idx}
            style={{ height: `${Math.max(16, Math.round(peak * 100))}%` }}
            className="flex-1 rounded-full bg-rose-600/80 dark:bg-rose-400/80 transition-[height] duration-75"
          />
        ))}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
        >
          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Batal</span>
        </button>

        <button
          type="button"
          onClick={onFinishAndSend}
          disabled={isSending}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg transition-colors whitespace-nowrap disabled:opacity-60"
        >
          {isSending ? <Square className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
          <span>{isSending ? 'Mengenkripsi...' : 'Enkripsi & Kirim'}</span>
        </button>
      </div>
    </div>
  );
};
