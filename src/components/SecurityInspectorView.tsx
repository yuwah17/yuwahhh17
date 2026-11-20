import React, { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { LocalIdentity } from '../lib/crypto';
import { RoomParticipant, VaultRoomMeta } from '../types/chat';
import { Identicon } from './Identicon';

interface SecurityInspectorViewProps {
  identity: LocalIdentity | null;
  activeRoom: VaultRoomMeta | null;
  participants: RoomParticipant[];
  onRotateIdentity: () => Promise<void>;
  onUpdateRoomSecret: (roomId: string, newSecret: string) => void;
  onUpdateDisplayName: (newName: string) => void;
  displayName: string;
}

export const SecurityInspectorView: React.FC<SecurityInspectorViewProps> = ({
  identity,
  activeRoom,
  participants,
  onRotateIdentity,
  onUpdateRoomSecret,
  onUpdateDisplayName,
  displayName,
}) => {
  const [copiedKey, setCopiedKey] = useState<'fingerprint' | 'invite' | null>(null);
  const [editedSecret, setEditedSecret] = useState(activeRoom?.secret || '');
  const [editedName, setEditedName] = useState(displayName);
  const [isRotating, setIsRotating] = useState(false);

  useEffect(() => {
    setEditedSecret(activeRoom?.secret || '');
  }, [activeRoom?.id, activeRoom?.secret]);

  const handleCopy = async (text: string, type: 'fingerprint' | 'invite') => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(type);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const inviteUrl = activeRoom
    ? `${window.location.origin}/#room=${encodeURIComponent(activeRoom.id)}&name=${encodeURIComponent(activeRoom.name)}&k=${encodeURIComponent(activeRoom.secret)}`
    : '';

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8 max-w-5xl mx-auto w-full space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight">
          Kunci Identitas & Verifikasi Keamanan
        </h1>
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
          Seluruh pasangan kunci kriptografi dibuat dan disimpan secara lokal di peramban Anda. Bandingkan sidik jari kunci dengan rekan bicara untuk memastikan tidak ada penyadapan.
        </p>
      </div>

      {/* Local Identity Section */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111824] p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3.5">
            {identity && <Identicon fingerprint={identity.fingerprint} size={44} />}
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Identitas Perangkat Lokal
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                ECDH P-256 · Tersimpan lokal di IndexedDB peramban
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isRotating}
            onClick={async () => {
              setIsRotating(true);
              try {
                await onRotateIdentity();
              } finally {
                setIsRotating(false);
              }
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} />
            <span>{isRotating ? 'Membuat Kunci Baru...' : 'Putar Kunci Identitas'}</span>
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label
              htmlFor="local-display-name"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Nama Tampilan Lokal
            </label>
            <div className="flex gap-2">
              <input
                id="local-display-name"
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <button
                type="button"
                onClick={() => onUpdateDisplayName(editedName.trim() || 'Pengguna SandiChat')}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg transition-colors whitespace-nowrap"
              >
                Simpan
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Sidik Jari Kunci Publik (SHA-256)
              </span>
              {identity && (
                <button
                  type="button"
                  onClick={() => handleCopy(identity.fingerprint, 'fingerprint')}
                  className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
                >
                  {copiedKey === 'fingerprint' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin</span>
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 font-mono text-xs tracking-wider text-slate-800 dark:text-slate-200 select-all">
              {identity?.fingerprint || 'Menghasilkan sidik jari...'}
            </div>
          </div>
        </div>
      </section>

      {/* Active Room Secret & Zero-Knowledge Invite Link */}
      {activeRoom && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111824] p-6 space-y-5">
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <KeyRound className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Kunci Ruang Aktif: {activeRoom.name}
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {activeRoom.id}
            </span>
          </div>

          {activeRoom.kind === 'dm' && activeRoom.peer ? (
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-2">
              <div className="flex items-center gap-3">
                <Identicon fingerprint={activeRoom.peer.fingerprint} size={32} />
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {activeRoom.peer.displayName} (@{activeRoom.peer.username})
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Pertukaran Kunci Otomatis ECDH P-256 + HKDF-SHA256
                  </div>
                </div>
              </div>
              <div className="pt-1 font-mono text-xs text-slate-700 dark:text-slate-300 break-all">
                Sidik Jari Rekan: {activeRoom.peer.fingerprint}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label
                  htmlFor="active-room-secret"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Passphrase Enkripsi Ruang (AES-256-GCM)
                </label>
                <div className="flex gap-2">
                  <input
                    id="active-room-secret"
                    type="text"
                    value={editedSecret}
                    onChange={(e) => setEditedSecret(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (editedSecret.trim()) {
                        onUpdateRoomSecret(activeRoom.id, editedSecret.trim());
                      }
                    }}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Terapkan
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Tautan Undangan Zero-Knowledge
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(inviteUrl, 'invite')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
                  >
                    {copiedKey === 'invite' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Tautan Disalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Tautan</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 font-mono text-[11px] text-slate-600 dark:text-slate-400 truncate">
                  {inviteUrl}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Bagian #k=... tidak pernah dikirim ke server HTTP sesuai spesifikasi URL fragment peramban.
                </p>
              </div>
            </div>
          )}

          <div className="pt-2">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">
              Peserta Terhubung di Ruang Ini ({participants.length})
            </h3>
            {participants.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Belum ada peserta aktif lainnya di ruang ini.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {participants.map((p) => (
                  <div
                    key={p.clientId}
                    className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Identicon fingerprint={p.fingerprint || p.clientId} size={30} />
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {p.displayName}
                          {identity?.clientId === p.clientId ? ' (Anda)' : ''}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {p.fingerprint || 'Menunggu sidik jari'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-teal-700 dark:text-teal-400 shrink-0">
                      <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                      <span>Terverifikasi</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
