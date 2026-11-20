import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { PendingGoogleChatMutation } from '../types/chat';

interface ConfirmMutationModalProps {
  pending: PendingGoogleChatMutation | null;
  onClose: () => void;
}

export const ConfirmMutationModal: React.FC<ConfirmMutationModalProps> = ({
  pending,
  onClose,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!pending) return null;

  const isDestructive = pending.kind === 'delete_message';

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await pending.onConfirm();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-mutation-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111824] p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                isDestructive
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                  : 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
              }`}
            >
              <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="confirm-mutation-title"
                className="text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                {pending.title}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {pending.targetLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Tutup dialog"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {pending.description}
        </p>

        {pending.payloadPreview && (
          <div className="mt-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Pratinjau Data yang Dikirim
            </div>
            <p className="text-xs font-mono text-slate-800 dark:text-slate-200 break-all line-clamp-4">
              {pending.payloadPreview}
            </p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className={`px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors whitespace-nowrap disabled:opacity-60 ${
              isDestructive
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500'
            }`}
          >
            {isSubmitting
              ? 'Memproses...'
              : isDestructive
                ? 'Ya, Hapus Permanen'
                : 'Konfirmasi & Lanjutkan'}
          </button>
        </div>
      </div>
    </div>
  );
};
