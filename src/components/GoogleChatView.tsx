import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertCircle,
  ExternalLink,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react';
import {
  armorTextForGoogleChat,
  deriveRoomAesKey,
  isArmoredGoogleChatMessage,
  unarmorGoogleChatMessage,
} from '../lib/crypto';
import {
  createChatSpace,
  deleteChatMessage,
  GOOGLE_CHAT_CONSOLE_URL,
  GoogleChatApiError,
  GoogleChatMember,
  GoogleChatMessage,
  GoogleChatSpace,
  listChatMembers,
  listChatMessages,
  listChatSpaces,
  sendChatMessage,
  signInWithGoogleChat,
  signOutGoogleChat,
} from '../lib/firebaseChat';
import { PendingGoogleChatMutation } from '../types/chat';
import { GoogleSignInButton } from './GoogleSignInButton';

interface GoogleChatViewProps {
  user: User | null;
  accessToken: string | null;
  needsAuth: boolean;
  onAuthSuccess: (user: User, token: string) => void;
  onSignedOut: () => void;
  onRequestMutationConfirm: (mutation: PendingGoogleChatMutation) => void;
}

interface DecryptedChatItem {
  raw: GoogleChatMessage;
  isArmored: boolean;
  decryptedText?: string;
  decryptionError?: boolean;
}

export const GoogleChatView: React.FC<GoogleChatViewProps> = ({
  user,
  accessToken,
  needsAuth,
  onAuthSuccess,
  onSignedOut,
  onRequestMutationConfirm,
}) => {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<GoogleChatSpace[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<GoogleChatSpace | null>(null);
  const [messages, setMessages] = useState<DecryptedChatItem[]>([]);
  const [members, setMembers] = useState<GoogleChatMember[]>([]);
  const [loadingSpaces, setLoadingSpaces] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [apiError, setApiError] = useState<GoogleChatApiError | Error | null>(null);

  // E2EE Bridge Passphrase for Google Chat Space
  const [useE2eeArmor, setUseE2eeArmor] = useState(true);
  const [spacePassphrase, setSpacePassphrase] = useState('sandichat-workspace-key');
  const [draft, setDraft] = useState('');
  const [newSpaceName, setNewSpaceName] = useState('');
  const [showNewSpaceForm, setShowNewSpaceForm] = useState(false);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    setApiError(null);
    try {
      const res = await signInWithGoogleChat();
      onAuthSuccess(res.user, res.accessToken);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Gagal masuk dengan Google.',
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await signOutGoogleChat();
    setSpaces([]);
    setSelectedSpace(null);
    setMessages([]);
    setMembers([]);
    setApiError(null);
    onSignedOut();
  };

  const loadSpaces = async () => {
    if (!accessToken) return;
    setLoadingSpaces(true);
    setApiError(null);
    try {
      const list = await listChatSpaces(accessToken);
      setSpaces(list);
      if (list.length > 0 && !selectedSpace) {
        setSelectedSpace(list[0]);
      }
    } catch (err) {
      setApiError(err instanceof Error ? err : new Error('Gagal memuat daftar Space Google Chat.'));
    } finally {
      setLoadingSpaces(false);
    }
  };

  const loadSpaceData = async (space: GoogleChatSpace) => {
    if (!accessToken) return;
    setLoadingMessages(true);
    setApiError(null);
    try {
      const [rawMessages, spaceMembers] = await Promise.all([
        listChatMessages(accessToken, space.name),
        listChatMembers(accessToken, space.name).catch(() => []),
      ]);
      setMembers(spaceMembers);

      const key = spacePassphrase.trim()
        ? await deriveRoomAesKey(space.name, spacePassphrase.trim())
        : null;

      const processed: DecryptedChatItem[] = await Promise.all(
        rawMessages.map(async (m) => {
          const text = m.text || '';
          const armored = isArmoredGoogleChatMessage(text);
          if (!armored || !key) {
            return { raw: m, isArmored: armored };
          }
          const res = await unarmorGoogleChatMessage(key, space.name, text);
          if (res.ok) {
            return { raw: m, isArmored: true, decryptedText: res.plaintext };
          }
          return { raw: m, isArmored: true, decryptionError: true };
        }),
      );

      setMessages(processed);
    } catch (err) {
      setApiError(err instanceof Error ? err : new Error('Gagal memuat pesan Google Chat.'));
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (accessToken && !needsAuth) {
      loadSpaces();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, needsAuth]);

  useEffect(() => {
    if (accessToken && selectedSpace) {
      loadSpaceData(selectedSpace);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSpace?.name, spacePassphrase]);

  const handleRequestCreateSpace = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newSpaceName.trim();
    if (!cleanName || !accessToken) return;

    onRequestMutationConfirm({
      kind: 'create_space',
      title: 'Buat Space Baru di Google Chat?',
      description: `Aplikasi akan membuat ruang percakapan (Space) baru bernama "${cleanName}" pada akun Google Chat Anda.`,
      targetLabel: 'Google Chat API · spaces.create',
      onConfirm: async () => {
        const created = await createChatSpace(accessToken, cleanName);
        setSpaces((prev) => [created, ...prev]);
        setSelectedSpace(created);
        setNewSpaceName('');
        setShowNewSpaceForm(false);
      },
    });
  };

  const handleRequestSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !selectedSpace || !accessToken) return;

    const cleanDraft = draft.trim();
    let payloadToSend = cleanDraft;

    if (useE2eeArmor) {
      if (!spacePassphrase.trim()) {
        setApiError(new Error('Masukkan passphrase Space terlebih dahulu untuk mengenkripsi pesan.'));
        return;
      }
      const key = await deriveRoomAesKey(selectedSpace.name, spacePassphrase.trim());
      payloadToSend = await armorTextForGoogleChat(key, selectedSpace.name, cleanDraft);
    }

    onRequestMutationConfirm({
      kind: 'send_message',
      title: 'Kirim Pesan ke Google Chat?',
      description: useE2eeArmor
        ? `Pesan akan dienkripsi dengan AES-256-GCM sebelum dikirim ke Space "${selectedSpace.displayName || selectedSpace.name}".`
        : `Pesan teks biasa akan dikirim langsung ke Space "${selectedSpace.displayName || selectedSpace.name}".`,
      targetLabel: selectedSpace.displayName || selectedSpace.name,
      payloadPreview: payloadToSend,
      onConfirm: async () => {
        await sendChatMessage(accessToken, selectedSpace.name, payloadToSend);
        setDraft('');
        await loadSpaceData(selectedSpace);
      },
    });
  };

  const handleRequestDeleteMessage = (msg: GoogleChatMessage) => {
    if (!accessToken || !selectedSpace) return;
    onRequestMutationConfirm({
      kind: 'delete_message',
      title: 'Hapus Pesan dari Google Chat?',
      description:
        'Pesan ini akan dihapus secara permanen dari Google Chat Space dan tidak dapat dikembalikan.',
      targetLabel: selectedSpace.displayName || selectedSpace.name,
      payloadPreview: msg.text || '(Pesan tanpa teks)',
      onConfirm: async () => {
        await deleteChatMessage(accessToken, msg.name);
        await loadSpaceData(selectedSpace);
      },
    });
  };

  if (needsAuth || !accessToken) {
    return (
      <div className="flex-1 overflow-y-auto p-6 lg:p-8 flex items-center justify-center bg-slate-50 dark:bg-[#0b0f17]">
        <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111824] p-7 space-y-5">
          <div className="space-y-1.5">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Hubungkan Google Chat
            </h1>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Masuk dengan akun Google Workspace Anda untuk melihat Space, membaca pesan, serta mengirim pesan teks terenkripsi AES-256-GCM melalui Google Chat.
            </p>
          </div>

          <GoogleSignInButton
            onClick={handleLogin}
            disabled={isLoggingIn}
            label={isLoggingIn ? 'Menghubungkan...' : 'Sign in with Google'}
          />

          {authError && (
            <div className="p-3 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-700 dark:text-rose-300">
              {authError}
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <p>
              <strong>Catatan Prasyarat Google Chat API:</strong>
            </p>
            <p>
              1. Memerlukan akun Google Workspace Business atau Enterprise (akun konsumen <code className="font-mono">@gmail.com</code> tidak didukung oleh API Google Chat).
            </p>
            <p>
              2. Aplikasi Chat harus dikonfigurasi satu kali di{' '}
              <a
                href={GOOGLE_CHAT_CONSOLE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-700 dark:text-teal-400 underline"
              >
                Google Cloud Console
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    );
  }

  const chatApiErr = apiError instanceof GoogleChatApiError ? apiError : null;

  return (
    <div className="flex-1 flex min-w-0 h-full bg-slate-50 dark:bg-[#0b0f17]">
      {/* Spaces Sub-column */}
      <div className="w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1520] flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {user?.displayName || user?.email || 'Akun Google'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {user?.email}
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Keluar dari Google"
              aria-label="Keluar dari akun Google"
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNewSpaceForm((prev) => !prev)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Buat Space</span>
            </button>
            <button
              type="button"
              onClick={loadSpaces}
              disabled={loadingSpaces}
              title="Muat ulang daftar Space"
              aria-label="Muat ulang daftar Space"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingSpaces ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {showNewSpaceForm && (
            <form onSubmit={handleRequestCreateSpace} className="space-y-2 pt-1">
              <input
                type="text"
                required
                value={newSpaceName}
                onChange={(e) => setNewSpaceName(e.target.value)}
                placeholder="Nama Space baru..."
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
              <button
                type="submit"
                className="w-full py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-700 text-white rounded-lg"
              >
                Lanjutkan
              </button>
            </form>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingSpaces ? (
            <div className="p-3 text-xs text-slate-500 dark:text-slate-400">
              Memuat Google Chat Spaces...
            </div>
          ) : spaces.length === 0 ? (
            <div className="p-3 text-xs text-slate-500 dark:text-slate-400">
              Belum ada Space yang ditemukan.
            </div>
          ) : (
            spaces.map((sp) => {
              const active = selectedSpace?.name === sp.name;
              return (
                <button
                  key={sp.name}
                  type="button"
                  onClick={() => setSelectedSpace(sp)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                    active
                      ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-900 dark:text-teal-200 font-semibold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <div className="truncate">{sp.displayName || sp.name}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {sp.spaceType || sp.type || 'SPACE'}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main Google Chat Conversation Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {apiError && (
          <div className="m-4 p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 space-y-2">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <div className="font-semibold">
                  {chatApiErr?.isAppNotConfigured
                    ? 'Google Chat App Belum Dikonfigurasi di Cloud Console (404)'
                    : chatApiErr?.isConsumerAccountUnsupported
                      ? 'Akun Google Workspace Diperlukan untuk Google Chat API'
                      : 'Pemberitahuan Google Chat API'}
                </div>
                <p className="leading-relaxed">{apiError.message}</p>
                {chatApiErr?.isAppNotConfigured && (
                  <p>
                    Buka halaman{' '}
                    <a
                      href={GOOGLE_CHAT_CONSOLE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold underline"
                    >
                      <span>Google Chat API Configuration</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>{' '}
                    lalu isi nama aplikasi, avatar URL, dan deskripsi untuk mengaktifkan API.
                  </p>
                )}
                {chatApiErr?.isUnauthorized && (
                  <button
                    type="button"
                    onClick={handleLogin}
                    className="mt-1 px-3 py-1.5 bg-amber-800 text-white rounded-lg font-medium"
                  >
                    Masuk Ulang dengan Google
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {selectedSpace ? (
          <>
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1520]">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                  {selectedSpace.displayName || selectedSpace.name}
                </h2>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    <span className="tabular-nums">{members.length} anggota</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Google Chat Bridge</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Passphrase E2EE:
                </label>
                <input
                  type="password"
                  value={spacePassphrase}
                  onChange={(e) => setSpacePassphrase(e.target.value)}
                  placeholder="Kunci dekripsi Space"
                  className="w-44 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => loadSpaceData(selectedSpace)}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Segarkan pesan"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingMessages ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {loadingMessages ? (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Memuat pesan dari Google Chat...
                </div>
              ) : messages.length === 0 ? (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Belum ada pesan di Space ini. Kirim pesan terenkripsi pertama Anda di bawah.
                </div>
              ) : (
                messages.map((item) => {
                  const m = item.raw;
                  return (
                    <div
                      key={m.name}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111824] p-4 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {m.sender?.displayName || m.sender?.name || 'Anggota Google Chat'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                            {m.createTime
                              ? new Date(m.createTime).toLocaleTimeString('id-ID', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : ''}
                          </span>
                          {item.isArmored && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-teal-700 dark:text-teal-400 font-medium">
                                {item.decryptionError ? 'Terkunci (Passphrase salah)' : 'AES-256-GCM'}
                              </span>
                            </>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRequestDeleteMessage(m)}
                          title="Hapus pesan di Google Chat"
                          className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">
                        {item.isArmored
                          ? item.decryptedText ?? m.text
                          : m.text || '(Lampiran / Tanpa teks)'}
                      </p>
                    </div>
                  );
                })
              )}
            </div>

            <form
              onSubmit={handleRequestSendMessage}
              className="shrink-0 p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1520] space-y-2.5"
            >
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setUseE2eeArmor((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 font-medium ${
                    useE2eeArmor
                      ? 'text-teal-700 dark:text-teal-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {useE2eeArmor ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  <span>
                    {useE2eeArmor
                      ? 'Mode Pembungkus E2EE Aktif (AES-256-GCM)'
                      : 'Mode Teks Biasa Google Chat'}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-2.5">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Tulis pesan untuk Google Chat Space..."
                  className="flex-1 h-10 px-3.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className="h-10 px-4 inline-flex items-center gap-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Kirim</span>
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-6 text-xs text-slate-500 dark:text-slate-400">
            Pilih Space di sebelah kiri atau buat Space baru untuk mulai berkomunikasi via Google Chat.
          </div>
        )}
      </div>
    </div>
  );
};
