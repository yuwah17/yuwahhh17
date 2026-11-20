import React, { useState } from 'react';
import { ExternalLink, Lock, Mic, ShieldCheck, MessageSquare } from 'lucide-react';
import { GOOGLE_CHAT_CONSOLE_URL } from '../lib/firebaseChat';

export const PrivacyGuideView: React.FC = () => {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8 max-w-5xl mx-auto w-full space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-7 flex flex-col justify-center space-y-4">
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-slate-50 tracking-tight text-balance">
            Arsitektur Enkripsi End-to-End & Privasi Zero-Knowledge
          </h1>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            SandiChat memproses seluruh enkripsi teks dan rekaman suara langsung di dalam peramban Anda menggunakan standar Web Crypto API. Server penghubung hanya meneruskan amplop data terenkripsi dan tidak pernah memiliki akses ke kunci rahasia maupun isi percakapan.
          </p>
          <div className="pt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
            <span>AES-256-GCM</span>
            <span aria-hidden="true">·</span>
            <span>ECDH P-256</span>
            <span aria-hidden="true">·</span>
            <span>PBKDF2-SHA256</span>
            <span aria-hidden="true">·</span>
            <span>WebRTC DTLS-SRTP</span>
          </div>
        </div>

        <div className="lg:col-span-5">
          {!imgError ? (
            <div className="h-full min-h-[210px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
              <img
                src="/src/assets/images/vault_privacy_emblem_1795138406750.jpg"
                alt="Ilustrasi arsitektur gelombang suara dan cincin kunci privasi SandiChat"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="h-full min-h-[210px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
              <ShieldCheck className="w-10 h-10 text-teal-700 dark:text-teal-400 mb-2" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Brankas Kriptografi SandiChat
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111824] p-5 space-y-2.5">
          <Lock className="w-5 h-5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Enkripsi Teks Lokal
          </h2>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Setiap pesan teks dienkripsi dengan AES-256-GCM dan IV acak 96-bit unik sebelum dikirim. ID ruang diikat sebagai Additional Authenticated Data (AAD) agar ciphertext tidak bisa dipindahkan antar ruang.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111824] p-5 space-y-2.5">
          <Mic className="w-5 h-5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Pesan Suara & Panggilan P2P
          </h2>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Rekaman audio Opus dienkripsi sebagai data biner sebelum melewati WebSocket. Untuk komunikasi langsung, panggilan suara WebRTC menggunakan enkripsi media DTLS-SRTP antar perangkat.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111824] p-5 space-y-2.5">
          <MessageSquare className="w-5 h-5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Jembatan Google Chat Terlindungi
          </h2>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Saat mengirim pesan ke Google Chat Space, Anda dapat mengaktifkan pembungkus sandi [SANDICHAT-E2EE] sehingga isi pesan tetap teracak di server Google dan hanya dapat dibaca oleh penerima yang memiliki passphrase ruang.
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111824] p-6 space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Prasyarat Integrasi Google Chat API
        </h2>
        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          Untuk menggunakan tab <strong>Google Chat</strong> secara langsung dengan akun Anda, Google mewajibkan dua hal berikut:
        </p>
        <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
          <li>
            Akun <strong>Google Workspace Business atau Enterprise</strong> yang memiliki akses Google Chat (akun konsumen <code className="font-mono">@gmail.com</code> tidak didukung oleh Google Chat API).
          </li>
          <li>
            Konfigurasi informasi aplikasi Google Chat (nama aplikasi, avatar, dan deskripsi) satu kali pada halaman Google Cloud Console di bawah ini.
          </li>
        </ol>
        <div className="pt-2">
          <a
            href={GOOGLE_CHAT_CONSOLE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
          >
            <span>Buka Halaman Konfigurasi Google Chat API di Cloud Console</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </div>
      </section>
    </div>
  );
};
