import React, { useEffect, useState } from 'react';
import {
  AtSign,
  KeyRound,
  Lock,
  LogOut,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Sun,
  UserPlus,
} from 'lucide-react';
import { searchRegisteredUsers } from '../lib/authClient';
import { LocalIdentity } from '../lib/crypto';
import { AccountProfile, AppSection, VaultRoomMeta } from '../types/chat';
import { Identicon } from './Identicon';

interface SidebarProps {
  activeSection: AppSection;
  onSelectSection: (section: AppSection) => void;
  rooms: VaultRoomMeta[];
  activeRoomId: string;
  onSelectRoom: (roomId: string) => void;
  onOpenNewRoom: () => void;
  onStartDirectChat: (targetUsername: string) => Promise<void>;
  accountUser: AccountProfile;
  identity: LocalIdentity | null;
  onLogout: () => Promise<void>;
  isDark: boolean;
  onToggleTheme: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  rooms,
  activeRoomId,
  onSelectRoom,
  onOpenNewRoom,
  onStartDirectChat,
  accountUser,
  identity,
  onLogout,
  isDark,
  onToggleTheme,
}) => {
  const [userQuery, setUserQuery] = useState('');
  const [directoryUsers, setDirectoryUsers] = useState<AccountProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);
  const [connectingUsername, setConnectingUsername] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const list = await searchRegisteredUsers(userQuery);
        if (active) setDirectoryUsers(list);
      } catch {
        // Ignore directory errors
      } finally {
        if (active) setSearching(false);
      }
    }, 200);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [userQuery]);

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = userQuery.trim().replace(/^@+/, '');
    if (!clean) return;
    setDmError(null);
    setConnectingUsername(clean);
    try {
      await onStartDirectChat(clean);
      setUserQuery('');
    } catch (err) {
      setDmError(err instanceof Error ? err.message : 'Gagal menghubungi username tersebut.');
    } finally {
      setConnectingUsername(null);
    }
  };

  const handlePickUser = async (username: string) => {
    setDmError(null);
    setConnectingUsername(username);
    try {
      await onStartDirectChat(username);
      setUserQuery('');
    } catch (err) {
      setDmError(err instanceof Error ? err.message : 'Gagal membuka obrolan.');
    } finally {
      setConnectingUsername(null);
    }
  };

  const dmRooms = rooms.filter((r) => r.kind === 'dm');
  const groupRooms = rooms.filter((r) => r.kind !== 'dm');

  return (
    <aside className="w-[280px] shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d121b] flex flex-col h-full">
      {/* Workspace Mode Segmented Switch */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg">
          <button
            type="button"
            onClick={() => onSelectSection('vault')}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeSection === 'vault'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Ruang E2EE</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectSection('google-chat')}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeSection === 'google-chat'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Google Chat</span>
          </button>
        </div>

        {/* Contact Fellow User by @username */}
        <form onSubmit={handleConnectSubmit} className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={userQuery}
                onChange={(e) => {
                  setUserQuery(e.target.value);
                  setDmError(null);
                }}
                placeholder="Hubungi @username..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <button
              type="submit"
              disabled={!userQuery.trim() || !!connectingUsername}
              title="Mulai obrolan terenkripsi dengan username ini"
              aria-label="Hubungi username"
              className="p-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white disabled:opacity-45 shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
            </button>
          </div>
          {dmError && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400">{dmError}</p>
          )}
        </form>
      </div>

      {/* Scrollable Conversations & Directory */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Search Suggestions / Registered Users Directory */}
        {(userQuery.trim().length > 0 || directoryUsers.length > 0) && (
          <div className="space-y-1">
            <div className="px-2 pb-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {userQuery.trim()
                ? searching
                  ? 'Mencari pengguna...'
                  : `Hasil Pencarian (${directoryUsers.length})`
                : `Pengguna Terdaftar (${directoryUsers.length})`}
            </div>
            {directoryUsers.length === 0 ? (
              <div className="px-2 py-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                Belum ada pengguna lain yang cocok.
              </div>
            ) : (
              directoryUsers.slice(0, 5).map((u) => (
                <button
                  key={u.username}
                  type="button"
                  disabled={connectingUsername === u.username}
                  onClick={() => handlePickUser(u.username)}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Identicon fingerprint={u.fingerprint} size={26} />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                        {u.displayName}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                        @{u.username}
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 shrink-0">
                    {connectingUsername === u.username ? '...' : 'Chat'}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {/* Direct Messages (@username) */}
        <div className="space-y-1">
          <div className="px-2 pb-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Pesan Langsung ({dmRooms.length})
          </div>
          {dmRooms.length === 0 ? (
            <div className="px-2 py-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              Cari @username di atas untuk menghubungi pengguna lain.
            </div>
          ) : (
            dmRooms.map((room) => {
              const isSelected = activeSection === 'vault' && room.id === activeRoomId;
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => {
                    onSelectRoom(room.id);
                    onSelectSection('vault');
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                    isSelected
                      ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-950 dark:text-teal-100'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Identicon
                    fingerprint={room.peer?.fingerprint || room.id}
                    size={28}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold truncate">
                      {room.peer?.displayName || room.name}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                      @{room.peer?.username}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Group Vault Rooms */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Ruang Grup E2EE ({groupRooms.length})
            </span>
            <button
              type="button"
              onClick={onOpenNewRoom}
              title="Buat atau gabung ruang grup"
              aria-label="Buat atau gabung ruang grup"
              className="p-1 text-slate-500 hover:text-teal-700 dark:hover:text-teal-400 rounded"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {groupRooms.map((room) => {
            const isSelected = activeSection === 'vault' && room.id === activeRoomId;
            return (
              <button
                key={room.id}
                type="button"
                onClick={() => {
                  onSelectRoom(room.id);
                  onSelectSection('vault');
                }}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                  isSelected
                    ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-950 dark:text-teal-100'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold truncate">{room.name}</span>
                  <Lock
                    className={`w-3 h-3 shrink-0 ${
                      isSelected
                        ? 'text-teal-700 dark:text-teal-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                  {room.id}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Account Profile, Theme & Logout */}
      <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onSelectSection('security')}
            className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-85 transition-opacity"
            title="Lihat kunci & verifikasi sidik jari"
          >
            {identity && <Identicon fingerprint={identity.fingerprint} size={32} />}
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {accountUser.displayName}
              </div>
              <div className="inline-flex items-center gap-0.5 text-[11px] font-mono text-teal-700 dark:text-teal-400 truncate">
                <AtSign className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>{accountUser.username}</span>
              </div>
            </div>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onSelectSection('security')}
              aria-label="Kunci dan verifikasi"
              title="Kunci dan verifikasi"
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <KeyRound className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
              title={isDark ? 'Mode Terang' : 'Mode Gelap'}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onLogout}
              aria-label="Keluar dari akun"
              title="Keluar"
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
