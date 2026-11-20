import { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { Menu, X } from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { ConfirmMutationModal } from './components/ConfirmMutationModal';
import { GoogleChatView } from './components/GoogleChatView';
import { WebRtcSignalEvent } from './components/LiveVoiceCallPanel';
import { NewRoomModal } from './components/NewRoomModal';
import { PrivacyGuideView } from './components/PrivacyGuideView';
import { SecurityInspectorView } from './components/SecurityInspectorView';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { VaultRoomView } from './components/VaultRoomView';
import {
  fetchCurrentSession,
  getStoredSessionToken,
  logoutAccount,
  openDirectChatByUsername,
} from './lib/authClient';
import {
  decryptBinary,
  decryptText,
  deriveEcdhRoomAesKey,
  deriveRoomAesKey,
  encryptBinary,
  encryptText,
  generateNewIdentity,
  generateRandomRoomSecret,
  getOrCreateIdentity,
  LocalIdentity,
} from './lib/crypto';
import { initGoogleChatAuth } from './lib/firebaseChat';
import {
  AccountProfile,
  AppSection,
  DecryptedVaultMessage,
  DirectThreadMeta,
  PendingGoogleChatMutation,
  RoomParticipant,
  VaultRoomMeta,
  WireEncryptedEnvelope,
} from './types/chat';

const STORAGE_ROOMS_KEY = 'sandichat_rooms_v1';

function parseInviteHash(): VaultRoomMeta | null {
  try {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash || !hash.includes('room=')) return null;
    const params = new URLSearchParams(hash);
    const id = params.get('room')?.trim();
    const secret = params.get('k')?.trim();
    const name = params.get('name')?.trim() || `Ruang ${id?.slice(0, 8)}`;
    if (!id || !secret) return null;
    return {
      id,
      name,
      kind: 'group',
      secret,
      ttlSeconds: 0,
      createdAt: Date.now(),
    };
  } catch {
    return null;
  }
}

function getInitialGroupRooms(): VaultRoomMeta[] {
  const invited = parseInviteHash();
  let saved: VaultRoomMeta[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_ROOMS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        saved = parsed.filter((r: VaultRoomMeta) => r.kind !== 'dm');
      }
    }
  } catch {
    // Ignore storage errors
  }

  if (saved.length === 0) {
    saved = [
      {
        id: 'vault-utama-01',
        name: 'Ruang Privat Utama',
        kind: 'group',
        secret: generateRandomRoomSecret(),
        ttlSeconds: 0,
        createdAt: Date.now(),
      },
    ];
  }

  if (invited) {
    const idx = saved.findIndex((r) => r.id === invited.id);
    if (idx === -1) {
      saved = [invited, ...saved];
    } else {
      saved[idx] = { ...saved[idx], secret: invited.secret, name: invited.name };
    }
  }

  return saved;
}

function mergeDmsIntoRooms(dms: DirectThreadMeta[], currentRooms: VaultRoomMeta[]): VaultRoomMeta[] {
  const groupRooms = currentRooms.filter((r) => r.kind !== 'dm');
  const dmRooms: VaultRoomMeta[] = dms.map((dm) => ({
    id: dm.roomId,
    name: `${dm.peer.displayName} (@${dm.peer.username})`,
    kind: 'dm',
    secret: '',
    peer: dm.peer,
    ttlSeconds: 0,
    createdAt: dm.updatedAt,
  }));
  return [...dmRooms, ...groupRooms];
}

export default function App() {
  const [isDark, setIsDark] = useState(true);
  const [activeSection, setActiveSection] = useState<AppSection>('vault');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [authChecking, setAuthChecking] = useState(true);
  const [accountUser, setAccountUser] = useState<AccountProfile | null>(null);
  const [identity, setIdentity] = useState<LocalIdentity | null>(null);

  const [rooms, setRooms] = useState<VaultRoomMeta[]>(getInitialGroupRooms);
  const [activeRoomId, setActiveRoomId] = useState<string>(() => {
    const invited = parseInviteHash();
    return invited ? invited.id : rooms[0]?.id || 'vault-utama-01';
  });

  const [newRoomModalOpen, setNewRoomModalOpen] = useState(false);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [messages, setMessages] = useState<DecryptedVaultMessage[]>([]);
  const [remoteActivity, setRemoteActivity] = useState<{
    clientId: string;
    displayName: string;
    activity: 'typing' | 'recording';
  } | null>(null);
  const [incomingWebRtcSignal, setIncomingWebRtcSignal] = useState<WebRtcSignalEvent | null>(null);

  // Google Chat Auth state (token held strictly in memory via firebaseChat.ts)
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [needsGoogleAuth, setNeedsGoogleAuth] = useState(true);
  const [pendingMutation, setPendingMutation] = useState<PendingGoogleChatMutation | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const activeKeyRef = useRef<CryptoKey | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  const activeRoom = rooms.find((r) => r.id === activeRoomId) || rooms[0];
  const displayName = accountUser?.displayName || 'Pengguna SandiChat';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useEffect(() => {
    try {
      const onlyGroups = rooms.filter((r) => r.kind !== 'dm');
      localStorage.setItem(STORAGE_ROOMS_KEY, JSON.stringify(onlyGroups));
    } catch {
      // Ignore storage errors
    }
  }, [rooms]);

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      try {
        const [localId, session] = await Promise.all([
          getOrCreateIdentity(),
          fetchCurrentSession(),
        ]);
        if (!active) return;
        setIdentity(localId);
        if (session) {
          setAccountUser(session.user);
          setRooms((prev) => mergeDmsIntoRooms(session.dms, prev));
          if (session.dms.length > 0 && !parseInviteHash()) {
            setActiveRoomId(session.dms[0].roomId);
          }
        }
      } finally {
        if (active) setAuthChecking(false);
      }
    };

    bootstrap().catch(console.error);

    const unsubscribe = initGoogleChatAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
        setNeedsGoogleAuth(false);
      },
      (user) => {
        setGoogleUser(user);
        setGoogleToken(null);
        setNeedsGoogleAuth(true);
      },
    );

    return () => {
      active = false;
      unsubscribe();
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, []);

  const decryptEnvelope = async (
    env: WireEncryptedEnvelope,
    key: CryptoKey,
  ): Promise<DecryptedVaultMessage> => {
    try {
      if (env.messageType === 'voice') {
        const buffer = await decryptBinary(key, env.roomId, env.ciphertext, env.iv);
        const blob = new Blob([buffer], { type: env.mimeType || 'audio/webm' });
        const audioUrl = URL.createObjectURL(blob);
        objectUrlsRef.current.push(audioUrl);
        return {
          id: env.id,
          roomId: env.roomId,
          senderId: env.senderId,
          senderUsername: env.senderUsername,
          senderName: env.senderName,
          senderFingerprint: env.senderFingerprint,
          messageType: 'voice',
          audioUrl,
          mimeType: env.mimeType,
          durationSec: env.durationSec,
          peaks: env.peaks,
          decryptionFailed: false,
          rawCiphertext: env.ciphertext,
          rawIv: env.iv,
          ttlSeconds: env.ttlSeconds,
          expiresAt: env.expiresAt,
          createdAt: env.createdAt,
        };
      }

      const plaintext = await decryptText(key, env.roomId, env.ciphertext, env.iv);
      return {
        id: env.id,
        roomId: env.roomId,
        senderId: env.senderId,
        senderUsername: env.senderUsername,
        senderName: env.senderName,
        senderFingerprint: env.senderFingerprint,
        messageType: 'text',
        decryptedText: plaintext,
        decryptionFailed: false,
        rawCiphertext: env.ciphertext,
        rawIv: env.iv,
        ttlSeconds: env.ttlSeconds,
        expiresAt: env.expiresAt,
        createdAt: env.createdAt,
      };
    } catch {
      return {
        id: env.id,
        roomId: env.roomId,
        senderId: env.senderId,
        senderUsername: env.senderUsername,
        senderName: env.senderName,
        senderFingerprint: env.senderFingerprint,
        messageType: env.messageType,
        decryptionFailed: true,
        rawCiphertext: env.ciphertext,
        rawIv: env.iv,
        ttlSeconds: env.ttlSeconds,
        expiresAt: env.expiresAt,
        createdAt: env.createdAt,
      };
    }
  };

  // WebSocket connection + room key derivation per activeRoom & authenticated identity
  useEffect(() => {
    if (!accountUser || !identity || !activeRoom) return;

    let cancelled = false;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;

    const connect = async () => {
      const derivedKey =
        activeRoom.kind === 'dm' && activeRoom.peer
          ? await deriveEcdhRoomAesKey(
              identity.privateKeyJwk,
              activeRoom.peer.publicKeyJwk,
              activeRoom.id,
            )
          : await deriveRoomAesKey(activeRoom.id, activeRoom.secret);

      if (cancelled) return;
      activeKeyRef.current = derivedKey;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      setWsStatus('connecting');

      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (cancelled) return;
        setWsStatus('connected');

        const sessionToken = getStoredSessionToken();
        if (sessionToken) {
          socket?.send(JSON.stringify({ type: 'user:online', token: sessionToken }));
        }

        socket?.send(
          JSON.stringify({
            type: 'room:join',
            roomId: activeRoom.id,
            roomName: activeRoom.name,
            clientId: identity.clientId,
            username: accountUser.username,
            displayName: accountUser.displayName,
            fingerprint: identity.fingerprint,
            publicKeyJwk: identity.publicKeyJwk,
          }),
        );
      };

      socket.onmessage = async (event) => {
        if (cancelled) return;
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(event.data as string);
        } catch {
          return;
        }

        if (data.type === 'dm:opened') {
          const peer = data.peer as AccountProfile | undefined;
          const dmRoomId = typeof data.roomId === 'string' ? data.roomId : '';
          const updatedAt = typeof data.updatedAt === 'number' ? data.updatedAt : Date.now();
          if (peer && dmRoomId) {
            setRooms((prev) => {
              const existingIdx = prev.findIndex((r) => r.id === dmRoomId);
              const dmMeta: VaultRoomMeta = {
                id: dmRoomId,
                name: `${peer.displayName} (@${peer.username})`,
                kind: 'dm',
                secret: '',
                peer,
                ttlSeconds: 0,
                createdAt: updatedAt,
              };
              if (existingIdx !== -1) {
                const copy = [...prev];
                copy[existingIdx] = dmMeta;
                return copy;
              }
              return [dmMeta, ...prev];
            });
          }
          return;
        }

        const key = activeKeyRef.current;
        if (!key) return;

        if (data.type === 'room:state' && data.roomId === activeRoom.id) {
          const list = Array.isArray(data.participants)
            ? (data.participants as RoomParticipant[])
            : [];
          const wireMessages = Array.isArray(data.messages)
            ? (data.messages as WireEncryptedEnvelope[])
            : [];
          setParticipants(list);
          const decrypted = await Promise.all(wireMessages.map((m) => decryptEnvelope(m, key)));
          if (!cancelled) {
            setMessages(decrypted);
          }
          return;
        }

        if (data.type === 'room:presence' && data.roomId === activeRoom.id) {
          const list = Array.isArray(data.participants)
            ? (data.participants as RoomParticipant[])
            : [];
          setParticipants(list);
          return;
        }

        if (data.type === 'message:new' && data.roomId === activeRoom.id) {
          const env = data.envelope as WireEncryptedEnvelope;
          const decrypted = await decryptEnvelope(env, key);
          if (!cancelled) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === decrypted.id)) return prev;
              return [...prev, decrypted];
            });
          }
          return;
        }

        if (data.type === 'message:deleted' && data.roomId === activeRoom.id) {
          const msgId = typeof data.messageId === 'string' ? data.messageId : '';
          setMessages((prev) => prev.filter((m) => m.id !== msgId));
          return;
        }

        if (data.type === 'message:expired' && data.roomId === activeRoom.id) {
          const expiredIds = Array.isArray(data.messageIds)
            ? new Set(data.messageIds as string[])
            : new Set<string>();
          setMessages((prev) => prev.filter((m) => !expiredIds.has(m.id)));
          return;
        }

        if (data.type === 'room:activity' && data.roomId === activeRoom.id) {
          const act = data.activity as 'typing' | 'recording' | 'idle';
          if (act === 'idle') {
            setRemoteActivity(null);
          } else {
            setRemoteActivity({
              clientId: String(data.clientId || ''),
              displayName: String(data.displayName || 'Rekan'),
              activity: act,
            });
          }
          return;
        }

        if (data.type === 'webrtc:signal' && data.roomId === activeRoom.id) {
          setIncomingWebRtcSignal({
            fromClientId: String(data.fromClientId || ''),
            fromDisplayName: String(data.fromDisplayName || 'Rekan'),
            signalType: data.signalType as WebRtcSignalEvent['signalType'],
            payload: data.payload,
          });
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        setWsStatus('disconnected');
        reconnectTimer = window.setTimeout(() => {
          connect().catch(() => {});
        }, 2500);
      };
    };

    connect().catch(console.error);

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      wsRef.current = null;
      setRemoteActivity(null);
    };
  }, [accountUser?.username, activeRoom?.id, activeRoom?.secret, activeRoom?.kind, identity?.clientId]);

  const handleSendText = async (plaintext: string) => {
    if (!accountUser || !identity || !activeRoom || !activeKeyRef.current || !wsRef.current) return;
    const { ciphertext, iv } = await encryptText(activeKeyRef.current, activeRoom.id, plaintext);
    const id = 'msg_' + crypto.randomUUID();
    const envelope: WireEncryptedEnvelope = {
      id,
      roomId: activeRoom.id,
      senderId: identity.clientId,
      senderUsername: accountUser.username,
      senderName: `${accountUser.displayName} (@${accountUser.username})`,
      senderFingerprint: identity.fingerprint,
      messageType: 'text',
      ciphertext,
      iv,
      ttlSeconds: activeRoom.ttlSeconds,
      createdAt: Date.now(),
    };
    wsRef.current.send(JSON.stringify({ type: 'message:send', envelope }));
  };

  const handleSendVoice = async (payload: {
    buffer: ArrayBuffer;
    mimeType: string;
    durationSec: number;
    peaks: number[];
  }) => {
    if (!accountUser || !identity || !activeRoom || !activeKeyRef.current || !wsRef.current) return;
    const { ciphertext, iv } = await encryptBinary(
      activeKeyRef.current,
      activeRoom.id,
      payload.buffer,
    );
    const id = 'voice_' + crypto.randomUUID();
    const envelope: WireEncryptedEnvelope = {
      id,
      roomId: activeRoom.id,
      senderId: identity.clientId,
      senderUsername: accountUser.username,
      senderName: `${accountUser.displayName} (@${accountUser.username})`,
      senderFingerprint: identity.fingerprint,
      messageType: 'voice',
      ciphertext,
      iv,
      mimeType: payload.mimeType,
      durationSec: payload.durationSec,
      peaks: payload.peaks,
      ttlSeconds: activeRoom.ttlSeconds,
      createdAt: Date.now(),
    };
    wsRef.current.send(JSON.stringify({ type: 'message:send', envelope }));
  };

  const handleDeleteMessage = (messageId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'message:delete', messageId }));
  };

  const handleEmitActivity = (activity: 'typing' | 'recording' | 'idle') => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({
        type: 'room:activity',
        displayName,
        activity,
      }),
    );
  };

  const handleSendWebRtcSignal = (signal: {
    targetClientId?: string;
    signalType: 'offer' | 'answer' | 'ice-candidate' | 'hangup' | 'ring';
    payload: unknown;
  }) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({
        type: 'webrtc:signal',
        fromDisplayName: displayName,
        targetClientId: signal.targetClientId,
        signalType: signal.signalType,
        payload: signal.payload,
      }),
    );
  };

  const handleStartDirectChat = async (targetUsername: string) => {
    const dm = await openDirectChatByUsername(targetUsername);
    const dmMeta: VaultRoomMeta = {
      id: dm.roomId,
      name: `${dm.peer.displayName} (@${dm.peer.username})`,
      kind: 'dm',
      secret: '',
      peer: dm.peer,
      ttlSeconds: 0,
      createdAt: dm.updatedAt,
    };
    setRooms((prev) => {
      const idx = prev.findIndex((r) => r.id === dm.roomId);
      if (idx === -1) return [dmMeta, ...prev];
      const copy = [...prev];
      copy[idx] = dmMeta;
      return copy;
    });
    setActiveRoomId(dm.roomId);
    setActiveSection('vault');
    setMobileMenuOpen(false);
  };

  const handleCreateOrJoinRoom = (params: {
    roomId: string;
    name: string;
    secret: string;
    ttlSeconds: number;
  }) => {
    setRooms((prev) => {
      const idx = prev.findIndex((r) => r.id === params.roomId);
      const nextRoom: VaultRoomMeta = {
        id: params.roomId,
        name: params.name,
        kind: 'group',
        secret: params.secret,
        ttlSeconds: params.ttlSeconds,
        createdAt: Date.now(),
      };
      if (idx === -1) return [nextRoom, ...prev];
      const copy = [...prev];
      copy[idx] = nextRoom;
      return copy;
    });
    setActiveRoomId(params.roomId);
    setActiveSection('vault');
  };

  const handleUpdateRoomSecret = (roomId: string, newSecret: string) => {
    setRooms((prev) =>
      prev.map((r) => (r.id === roomId ? { ...r, secret: newSecret } : r)),
    );
  };

  const handleUpdateDisplayName = (newName: string) => {
    if (!accountUser) return;
    setAccountUser({ ...accountUser, displayName: newName });
  };

  const handleRotateIdentity = async () => {
    const next = await generateNewIdentity();
    setIdentity(next);
  };

  const handleLogout = async () => {
    await logoutAccount();
    setAccountUser(null);
    setMessages([]);
    setParticipants([]);
  };

  if (authChecking) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-[#0b0f17] text-xs text-slate-500 dark:text-slate-400">
        Memeriksa sesi aman...
      </div>
    );
  }

  if (!accountUser) {
    return (
      <AuthScreen
        onAuthenticated={({ user, identity: unlockedId, dms }) => {
          setIdentity(unlockedId);
          setAccountUser(user);
          setRooms((prev) => {
            const merged = mergeDmsIntoRooms(dms, prev);
            if (dms.length > 0 && !parseInviteHash()) {
              setActiveRoomId(dms[0].roomId);
            } else if (merged.length > 0) {
              setActiveRoomId(merged[0].id);
            }
            return merged;
          });
        }}
      />
    );
  }

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100">
      <TopBar
        activeSection={activeSection}
        onSelectSection={(sec) => {
          setActiveSection(sec);
          setMobileMenuOpen(false);
        }}
        onOpenNewRoom={() => setNewRoomModalOpen(true)}
      />

      {/* Mobile Sidebar Trigger Strip */}
      <div className="md:hidden flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d121b]">
        <button
          type="button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200"
        >
          {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          <span>Menu Ruang & Kontak</span>
        </button>
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
          @{accountUser.username}
        </span>
      </div>

      <div className="flex-1 flex min-h-0 relative">
        {/* Desktop Sidebar */}
        <div className="hidden md:flex h-full">
          <Sidebar
            activeSection={activeSection}
            onSelectSection={setActiveSection}
            rooms={rooms}
            activeRoomId={activeRoomId}
            onSelectRoom={setActiveRoomId}
            onOpenNewRoom={() => setNewRoomModalOpen(true)}
            onStartDirectChat={handleStartDirectChat}
            accountUser={accountUser}
            identity={identity}
            onLogout={handleLogout}
            isDark={isDark}
            onToggleTheme={() => setIsDark((prev) => !prev)}
          />
        </div>

        {/* Mobile Drawer Sidebar */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute inset-y-0 left-0 z-40 flex shadow-xl">
            <Sidebar
              activeSection={activeSection}
              onSelectSection={(sec) => {
                setActiveSection(sec);
                setMobileMenuOpen(false);
              }}
              rooms={rooms}
              activeRoomId={activeRoomId}
              onSelectRoom={(id) => {
                setActiveRoomId(id);
                setMobileMenuOpen(false);
              }}
              onOpenNewRoom={() => {
                setMobileMenuOpen(false);
                setNewRoomModalOpen(true);
              }}
              onStartDirectChat={handleStartDirectChat}
              accountUser={accountUser}
              identity={identity}
              onLogout={handleLogout}
              isDark={isDark}
              onToggleTheme={() => setIsDark((prev) => !prev)}
            />
          </div>
        )}

        {/* Active Main Viewport */}
        <main className="flex-1 flex min-w-0 min-h-0">
          {activeSection === 'vault' && activeRoom && (
            <VaultRoomView
              room={activeRoom}
              identity={identity}
              displayName={displayName}
              wsStatus={wsStatus}
              participants={participants}
              messages={messages}
              remoteActivity={remoteActivity}
              incomingWebRtcSignal={incomingWebRtcSignal}
              onSendText={handleSendText}
              onSendVoice={handleSendVoice}
              onDeleteMessage={handleDeleteMessage}
              onEmitActivity={handleEmitActivity}
              onSendWebRtcSignal={handleSendWebRtcSignal}
              onOpenSecurity={() => setActiveSection('security')}
            />
          )}

          {activeSection === 'google-chat' && (
            <GoogleChatView
              user={googleUser}
              accessToken={googleToken}
              needsAuth={needsGoogleAuth}
              onAuthSuccess={(user, token) => {
                setGoogleUser(user);
                setGoogleToken(token);
                setNeedsGoogleAuth(false);
              }}
              onSignedOut={() => {
                setGoogleUser(null);
                setGoogleToken(null);
                setNeedsGoogleAuth(true);
              }}
              onRequestMutationConfirm={setPendingMutation}
            />
          )}

          {activeSection === 'security' && (
            <SecurityInspectorView
              identity={identity}
              activeRoom={activeRoom || null}
              participants={participants}
              onRotateIdentity={handleRotateIdentity}
              onUpdateRoomSecret={handleUpdateRoomSecret}
              onUpdateDisplayName={handleUpdateDisplayName}
              displayName={displayName}
            />
          )}

          {activeSection === 'guide' && <PrivacyGuideView />}
        </main>
      </div>

      <NewRoomModal
        isOpen={newRoomModalOpen}
        onClose={() => setNewRoomModalOpen(false)}
        onCreateOrJoin={handleCreateOrJoinRoom}
      />

      <ConfirmMutationModal
        pending={pendingMutation}
        onClose={() => setPendingMutation(null)}
      />
    </div>
  );
}
