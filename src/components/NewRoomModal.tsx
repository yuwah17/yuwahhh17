import React, { useState } from 'react';
import { Lock, RefreshCw, X } from 'lucide-react';
import { generateRandomRoomSecret } from '../lib/crypto';

interface NewRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateOrJoin: (params: {
    roomId: string;
    name: string;
    secret: string;
    ttlSeconds: number;
  }) => void;
}

export const NewRoomModal: React.FC<NewRoomModalProps> = ({
  isOpen,
  onClose,
  onCreateOrJoin,
}) => {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [secret, setSecret] = useState(() => generateRandomRoomSecret());
  const [ttlSeconds, setTtlSeconds] = useState(0);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'create') {
      const cleanName = name.trim() || 'Ruang Privat Baru';
      const id =
        'vault-' +
        Math.random().toString(36).slice(2, 6) +
        '-' +
        Math.random().toString(36).slice(2, 6);
      onCreateOrJoin({
        roomId: id,
        name: cleanName,
        secret: secret.trim() || generateRandomRoomSecret(),
        ttlSeconds,
      });
    } else {
      const cleanId = joinRoomId.trim();
      if (!cleanId) return;
      onCreateOrJoin({
        roomId: cleanId,
        name: name.trim() || `Ruang ${cleanId}`,
        secret: secret.trim(),
        ttlSeconds,
      });
    }
    setName('');
    setJoinRoomId('');
    setSecret(generateRandomRoomSecret());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-room-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111824] p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
            <h2
              id="new-room-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Ruang Komunikasi Terenkripsi
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setMode('create');
              setSecret(generateRandomRoomSecret());
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'create'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Buat Ruang Baru
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('join');
              setSecret('');
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'join'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Gabung via ID Ruang
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {mode === 'join' && (
            <div>
              <label
                htmlFor="join-room-id"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                ID Ruang Target
              </label>
              <input
                id="join-room-id"
                type="text"
                required
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                placeholder="Contoh: vault-a7k2-m9p4"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="room-name"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Nama Ruang {mode === 'join' ? '(Opsional)' : ''}
            </label>
            <input
              id="room-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === 'create' ? 'Contoh: Tim Keamanan Produk' : 'Label lokal ruang'}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="room-secret"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Kunci Rahasia Ruang (Passphrase AES-256)
              </label>
              {mode === 'create' && (
                <button
                  type="button"
                  onClick={() => setSecret(generateRandomRoomSecret())}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 dark:text-teal-400 hover:underline"
                >
                  <RefreshCw className="w-3 h-3" aria-hidden="true" />
                  <span>Acak Ulang</span>
                </button>
              )}
            </div>
            <input
              id="room-secret"
              type="text"
              required
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Masukkan kata sandi ruang yang disepakati"
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              Kunci ini diturunkan secara lokal dengan PBKDF2-SHA256 dan tidak pernah dikirim ke server.
            </p>
          </div>

          <div>
            <label
              htmlFor="room-ttl"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Pesan Sementara (Hapus Otomatis)
            </label>
            <select
              id="room-ttl"
              value={ttlSeconds}
              onChange={(e) => setTtlSeconds(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              <option value={0}>Mati — Simpan selama sesi aktif</option>
              <option value={30}>30 detik</option>
              <option value={300}>5 menit</option>
              <option value={3600}>1 jam</option>
            </select>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg transition-colors"
            >
              {mode === 'create' ? 'Buat Ruang Aman' : 'Gabung Sekarang'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
