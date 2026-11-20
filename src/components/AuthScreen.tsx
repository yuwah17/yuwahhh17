import React, { useState } from 'react';
import { Lock, UserPlus, LogIn, Eye, EyeOff } from 'lucide-react';
import { AccountProfile, DirectThreadMeta } from '../types/chat';
import { LocalIdentity } from '../lib/crypto';
import { loginAccount, registerAccount } from '../lib/authClient';

interface AuthScreenProps {
  onAuthenticated: (result: {
    token: string;
    user: AccountProfile;
    identity: LocalIdentity;
    dms: DirectThreadMeta[];
  }) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      if (mode === 'register') {
        const res = await registerAccount({
          username: username.trim(),
          password,
          displayName: displayName.trim() || username.trim(),
        });
        onAuthenticated(res);
      } else {
        const res = await loginAccount({
          username: username.trim(),
          password,
        });
        onAuthenticated(res);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan autentikasi.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-[#0b0f17] p-4 sm:p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111824] p-7 space-y-6">
        {/* Brand Header with Uploaded App Icon */}
        <div className="flex flex-col items-center text-center space-y-3">
          {!logoError ? (
            <img
              src="/assets/aistudio/Glossy_Blue_Yuhu_Calling_Icon_da168689.png"
              alt="Logo Aplikasi Yuhu SandiChat"
              onError={() => setLogoError(true)}
              className="w-16 h-16 rounded-full object-cover shadow-sm"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-teal-700 flex items-center justify-center text-white">
              <Lock className="w-7 h-7" />
            </div>
          )}

          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50 tracking-tight font-display">
              SandiChat
            </h1>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Komunikasi teks & suara terenkripsi end-to-end dengan akun username pribadi.
            </p>
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-colors ${
              mode === 'login'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Masuk</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-colors ${
              mode === 'register'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Daftar Akun</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="auth-username"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Username
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono text-slate-400">
                @
              </span>
              <input
                id="auth-username"
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="misal: budi_santoso"
                className="w-full pl-8 pr-3 py-2.5 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              3–24 karakter (huruf kecil, angka, titik, atau garis bawah). Rekan Anda dapat mencari dan menghubungi Anda menggunakan username ini.
            </p>
          </div>

          {mode === 'register' && (
            <div>
              <label
                htmlFor="auth-displayname"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Nama Tampilan
              </label>
              <input
                id="auth-displayname"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Nama lengkap atau panggilan"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="auth-password"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Kata Sandi
            </label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full pl-3 pr-10 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg transition-colors disabled:opacity-60"
          >
            {isLoading
              ? mode === 'register'
                ? 'Membuat Akun & Kunci ECDH...'
                : 'Memverifikasi & Membuka Kunci...'
              : mode === 'register'
                ? 'Daftar & Buat Kunci Aman'
                : 'Masuk ke Ruang Aman'}
          </button>
        </form>

        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 text-center">
          Kunci privat ECDH P-256 Anda dienkripsi dengan kata sandi sebelum dicadangkan agar server tidak pernah dapat membaca pesan Anda.
        </div>
      </div>
    </div>
  );
};
