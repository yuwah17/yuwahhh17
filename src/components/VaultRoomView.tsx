import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Mic,
  Send,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { ActiveRecorderSession, startVoiceRecording } from '../lib/audio';
import { LocalIdentity } from '../lib/crypto';
import {
  DecryptedVaultMessage,
  RoomParticipant,
  VaultRoomMeta,
} from '../types/chat';
import { Identicon } from './Identicon';
import { LiveVoiceCallPanel, WebRtcSignalEvent } from './LiveVoiceCallPanel';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { VoiceRecorderBar } from './VoiceRecorderBar';

interface VaultRoomViewProps {
  room: VaultRoomMeta;
  identity: LocalIdentity | null;
  displayName: string;
  wsStatus: 'connecting' | 'connected' | 'disconnected';
  participants: RoomParticipant[];
  messages: DecryptedVaultMessage[];
  remoteActivity: { clientId: string; displayName: string; activity: 'typing' | 'recording' } | null;
  incomingWebRtcSignal: WebRtcSignalEvent | null;
  onSendText: (plaintext: string) => Promise<void>;
  onSendVoice: (payload: {
    buffer: ArrayBuffer;
    mimeType: string;
    durationSec: number;
    peaks: number[];
  }) => Promise<void>;
  onDeleteMessage: (messageId: string) => void;
  onEmitActivity: (activity: 'typing' | 'recording' | 'idle') => void;
  onSendWebRtcSignal: (signal: {
    targetClientId?: string;
    signalType: 'offer' | 'answer' | 'ice-candidate' | 'hangup' | 'ring';
    payload: unknown;
  }) => void;
  onOpenSecurity: () => void;
}

function formatMessageTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTtl(sec: number): string {
  if (!sec) return 'Permanen selama sesi';
  if (sec < 60) return `Hapus otomatis ${sec}d`;
  if (sec < 3600) return `Hapus otomatis ${Math.round(sec / 60)}m`;
  return `Hapus otomatis ${Math.round(sec / 3600)}j`;
}

export const VaultRoomView: React.FC<VaultRoomViewProps> = ({
  room,
  identity,
  displayName,
  wsStatus,
  participants,
  messages,
  remoteActivity,
  incomingWebRtcSignal,
  onSendText,
  onSendVoice,
  onDeleteMessage,
  onEmitActivity,
  onSendWebRtcSignal,
  onOpenSecurity,
}) => {
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [privacyBlur, setPrivacyBlur] = useState(false);
  const [showCiphertextMap, setShowCiphertextMap] = useState<Record<string, boolean>>({});
  const [recorderSession, setRecorderSession] = useState<ActiveRecorderSession | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [imgError, setImgError] = useState(false);

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    return () => {
      recorderSession?.cancel();
    };
  }, [recorderSession]);

  const handleDraftChange = (val: string) => {
    setDraft(val);
    onEmitActivity(val.trim() ? 'typing' : 'idle');
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      onEmitActivity('idle');
    }, 2000);
  };

  const handleSendTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = draft.trim();
    if (!clean || isSending) return;
    setIsSending(true);
    try {
      await onSendText(clean);
      setDraft('');
      onEmitActivity('idle');
    } finally {
      setIsSending(false);
    }
  };

  const handleStartRecording = async () => {
    setMicError(null);
    try {
      const session = await startVoiceRecording();
      setRecorderSession(session);
      onEmitActivity('recording');
    } catch (err) {
      setMicError(
        err instanceof Error ? err.message : 'Tidak dapat mengakses mikrofon perangkat.',
      );
    }
  };

  const handleCancelRecording = () => {
    recorderSession?.cancel();
    setRecorderSession(null);
    onEmitActivity('idle');
  };

  const handleFinishRecording = async () => {
    if (!recorderSession || isSending) return;
    setIsSending(true);
    try {
      const audio = await recorderSession.stop();
      setRecorderSession(null);
      onEmitActivity('idle');
      await onSendVoice(audio);
    } catch (err) {
      setMicError(err instanceof Error ? err.message : 'Gagal mengenkripsi pesan suara.');
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyInvite = async () => {
    const url = `${window.location.origin}/#room=${encodeURIComponent(room.id)}&name=${encodeURIComponent(room.name)}&k=${encodeURIComponent(room.secret)}`;
    await navigator.clipboard.writeText(url);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-slate-50 dark:bg-[#0b0f17]">
      {/* Room Header Bar */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1520]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" aria-hidden="true" />
            <h1 className="text-base font-semibold text-slate-900 dark:text-slate-50 truncate">
              {room.kind === 'dm' && room.peer
                ? `${room.peer.displayName} (@${room.peer.username})`
                : room.name}
            </h1>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-mono">
              {room.kind === 'dm' ? 'ECDH P-256 · AES-256-GCM' : 'AES-256-GCM'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{participants.length} peserta aktif</span>
            <span aria-hidden="true">·</span>
            <span>{formatTtl(room.ttlSeconds)}</span>
            <span aria-hidden="true">·</span>
            <span>
              {wsStatus === 'connected'
                ? 'Relay Terhubung'
                : wsStatus === 'connecting'
                  ? 'Menghubungkan...'
                  : 'Terputus'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LiveVoiceCallPanel
            roomId={room.id}
            localClientId={identity?.clientId || ''}
            localDisplayName={displayName}
            participantCount={participants.length}
            incomingSignal={incomingWebRtcSignal}
            onSendSignal={onSendWebRtcSignal}
          />

          {room.kind !== 'dm' && (
            <button
              type="button"
              onClick={handleCopyInvite}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              {copiedInvite ? (
                <>
                  <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>Tautan Disalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Undangan</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setPrivacyBlur((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            title="Samarkan isi layar dari pengamat sekitar"
          >
            {privacyBlur ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{privacyBlur ? 'Buka Layar' : 'Samarkan'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenSecurity}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            Verifikasi Kunci
          </button>
        </div>
      </div>

      {/* Messages Viewport */}
      <div
        className={`flex-1 overflow-y-auto px-5 py-6 space-y-4 transition-[filter] duration-150 ${
          privacyBlur ? 'blur-md select-none pointer-events-none' : ''
        }`}
      >
        {messages.length === 0 ? (
          <div className="max-w-lg mx-auto my-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111824] p-6 text-center space-y-4">
            {!imgError && (
              <div className="w-full h-44 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
                <img
                  src="/src/assets/images/vault_privacy_emblem_1795138406750.jpg"
                  alt="Ruang komunikasi terenkripsi end-to-end"
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {room.kind === 'dm' && room.peer
                  ? `Obrolan Langsung Terenkripsi dengan @${room.peer.username}`
                  : 'Ruang Terenkripsi Siap Digunakan'}
              </h2>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {room.kind === 'dm' && room.peer
                  ? 'Kunci sesi diturunkan otomatis melalui pertukaran ECDH P-256 antara kunci Anda dan kunci publik rekan Anda. Ketik pesan atau rekam pesan suara di bawah.'
                  : 'Teks dan rekaman suara di ruang ini dienkripsi di perangkat Anda dengan AES-256-GCM sebelum dikirim. Bagikan tautan undangan kepada rekan Anda agar mereka dapat bergabung dan mendekripsi secara langsung.'}
              </p>
            </div>
            {room.kind !== 'dm' && (
              <div className="flex items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg transition-colors"
                >
                  {copiedInvite ? 'Tautan Undangan Disalin' : 'Salin Tautan Undangan Aman'}
                </button>
              </div>
            )}
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = identity?.clientId === msg.senderId;
            const showCipher = !!showCiphertextMap[msg.id];

            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-2xl ${isOwn ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
              >
                <Identicon fingerprint={msg.senderFingerprint || msg.senderId} size={32} />

                <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} min-w-0`}>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {isOwn ? `${msg.senderName} (Anda)` : msg.senderName}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{formatMessageTime(msg.createdAt)}</span>
                    {msg.expiresAt && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">Sementara</span>
                      </>
                    )}
                  </div>

                  <div
                    className={`rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.decryptionFailed
                        ? 'border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200'
                        : isOwn
                          ? 'bg-teal-700 dark:bg-teal-600 text-white'
                          : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131b29] text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {msg.decryptionFailed ? (
                      <div className="flex items-start gap-2 text-xs">
                        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>
                          Pesan terenkripsi tidak dapat didekripsi dengan passphrase ruang saat ini. Periksa kunci ruang di menu Verifikasi Kunci.
                        </span>
                      </div>
                    ) : msg.messageType === 'voice' && msg.audioUrl ? (
                      <VoiceMessagePlayer
                        audioUrl={msg.audioUrl}
                        durationSec={msg.durationSec}
                        peaks={msg.peaks}
                        isOwn={isOwn}
                      />
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{msg.decryptedText}</p>
                    )}
                  </div>

                  <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                    <button
                      type="button"
                      onClick={() =>
                        setShowCiphertextMap((prev) => ({
                          ...prev,
                          [msg.id]: !prev[msg.id],
                        }))
                      }
                      className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      <Code2 className="w-3 h-3" aria-hidden="true" />
                      <span>{showCipher ? 'Tutup Ciphertext' : 'Inspeksi Ciphertext'}</span>
                    </button>

                    {isOwn && (
                      <button
                        type="button"
                        onClick={() => onDeleteMessage(msg.id)}
                        className="inline-flex items-center gap-1 hover:text-rose-600 dark:hover:text-rose-400"
                      >
                        <Trash2 className="w-3 h-3" aria-hidden="true" />
                        <span>Hapus</span>
                      </button>
                    )}
                  </div>

                  {showCipher && (
                    <div className="mt-1.5 w-full max-w-md p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/90 font-mono text-[10px] text-slate-600 dark:text-slate-400 break-all space-y-1">
                      <div>IV (96-bit): {msg.rawIv}</div>
                      <div>
                        Ciphertext AES-GCM:{' '}
                        {msg.rawCiphertext.length > 180
                          ? msg.rawCiphertext.slice(0, 180) + '...'
                          : msg.rawCiphertext}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {remoteActivity && (
          <div className="text-xs text-slate-500 dark:text-slate-400 pl-11">
            {remoteActivity.displayName}{' '}
            {remoteActivity.activity === 'recording'
              ? 'sedang merekam pesan suara terenkripsi...'
              : 'sedang mengetik pesan terenkripsi...'}
          </div>
        )}

        <div ref={listEndRef} />
      </div>

      {/* Composer Area */}
      <div className="shrink-0 p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1520]">
        {micError && (
          <div className="mb-2.5 px-3 py-2 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-700 dark:text-rose-300">
            {micError}
          </div>
        )}

        {recorderSession ? (
          <VoiceRecorderBar
            session={recorderSession}
            onCancel={handleCancelRecording}
            onFinishAndSend={handleFinishRecording}
            isSending={isSending}
          />
        ) : (
          <form onSubmit={handleSendTextSubmit} className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleStartRecording}
              aria-label="Rekam pesan suara terenkripsi"
              title="Rekam pesan suara terenkripsi"
              className="w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              <Mic className="w-4 h-4" />
            </button>

            <input
              type="text"
              value={draft}
              onChange={(e) => handleDraftChange(e.target.value)}
              placeholder={`Kirim pesan terenkripsi ke ${room.name}...`}
              className="flex-1 h-10 px-3.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />

            <button
              type="submit"
              disabled={!draft.trim() || isSending}
              className="h-10 px-4 inline-flex items-center gap-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg transition-colors shrink-0 disabled:opacity-50 whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Kirim</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
