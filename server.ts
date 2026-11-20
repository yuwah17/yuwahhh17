import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DATA_DIR = path.resolve(__dirname, '.data');
const STORE_PATH = path.join(DATA_DIR, 'sandichat-store.json');

interface StoredUser {
  username: string;
  displayName: string;
  passwordSalt: string;
  passwordHash: string;
  publicKeyJwk: JsonWebKey;
  fingerprint: string;
  encryptedPrivateKey: string;
  encryptedPrivateKeyIv: string;
  encryptedPrivateKeySalt: string;
  createdAt: number;
}

interface StoredDmThread {
  roomId: string;
  participants: [string, string];
  updatedAt: number;
}

interface RoomParticipant {
  clientId: string;
  username?: string;
  displayName: string;
  fingerprint: string;
  publicKeyJwk: JsonWebKey | null;
  joinedAt: number;
}

interface EncryptedEnvelope {
  id: string;
  roomId: string;
  senderId: string;
  senderUsername?: string;
  senderName: string;
  senderFingerprint: string;
  messageType: 'text' | 'voice';
  ciphertext: string;
  iv: string;
  salt?: string;
  mimeType?: string;
  durationSec?: number;
  peaks?: number[];
  ttlSeconds?: number;
  expiresAt?: number | null;
  createdAt: number;
}

interface PersistedData {
  users: Record<string, StoredUser>;
  sessions: Record<string, { username: string; createdAt: number }>;
  dmThreads: Record<string, StoredDmThread>;
  persistedMessages: Record<string, EncryptedEnvelope[]>;
}

interface VaultRoom {
  id: string;
  name: string;
  createdAt: number;
  messages: EncryptedEnvelope[];
  clients: Map<WebSocket, RoomParticipant>;
}

function loadStore(): PersistedData {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedData>;
      return {
        users: parsed.users || {},
        sessions: parsed.sessions || {},
        dmThreads: parsed.dmThreads || {},
        persistedMessages: parsed.persistedMessages || {},
      };
    }
  } catch (err) {
    console.error('Failed to read store, initializing fresh store:', err);
  }
  return {
    users: {},
    sessions: {},
    dmThreads: {},
    persistedMessages: {},
  };
}

const store: PersistedData = loadStore();

function saveStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist store:', err);
  }
}

function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

function isValidUsername(username: string): boolean {
  return /^[a-z0-9._]{3,24}$/.test(username);
}

function hashPassword(password: string, saltHex?: string): { salt: string; hash: string } {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash: derived };
}

function verifyPassword(password: string, salt: string, expectedHashHex: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function toPublicProfile(user: StoredUser) {
  return {
    username: user.username,
    displayName: user.displayName,
    publicKeyJwk: user.publicKeyJwk,
    fingerprint: user.fingerprint,
  };
}

function getAuthenticatedUser(req: express.Request): StoredUser | null {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return null;
  const session = store.sessions[token];
  if (!session) return null;
  return store.users[session.username] || null;
}

const rooms = new Map<string, VaultRoom>();
const onlineUserSockets = new Map<string, Set<WebSocket>>();

function getOrCreateRoom(roomId: string, roomName?: string): VaultRoom {
  let room = rooms.get(roomId);
  if (!room) {
    const savedMessages = store.persistedMessages[roomId] || [];
    room = {
      id: roomId,
      name: roomName && roomName.trim() ? roomName.trim().slice(0, 64) : `Ruang ${roomId.slice(0, 8)}`,
      createdAt: Date.now(),
      messages: [...savedMessages],
      clients: new Map<WebSocket, RoomParticipant>(),
    };
    rooms.set(roomId, room);
  } else if (roomName && roomName.trim() && room.name.startsWith('Ruang ')) {
    room.name = roomName.trim().slice(0, 64);
  }
  return room;
}

function pruneExpiredMessages(room: VaultRoom): string[] {
  const now = Date.now();
  const expiredIds: string[] = [];
  room.messages = room.messages.filter((msg) => {
    if (msg.expiresAt && msg.expiresAt <= now) {
      expiredIds.push(msg.id);
      return false;
    }
    return true;
  });
  if (expiredIds.length > 0 && room.id.startsWith('dm:')) {
    store.persistedMessages[room.id] = room.messages;
    saveStore();
  }
  return expiredIds;
}

function broadcastToRoom(room: VaultRoom, payload: unknown, excludeSocket?: WebSocket) {
  const serialized = JSON.stringify(payload);
  for (const [client] of room.clients) {
    if (client !== excludeSocket && client.readyState === WebSocket.OPEN) {
      client.send(serialized);
    }
  }
}

function notifyUserSockets(username: string, payload: unknown) {
  const sockets = onlineUserSockets.get(username);
  if (!sockets) return;
  const serialized = JSON.stringify(payload);
  for (const sock of sockets) {
    if (sock.readyState === WebSocket.OPEN) {
      sock.send(serialized);
    }
  }
}

function getParticipantsList(room: VaultRoom): RoomParticipant[] {
  const seen = new Map<string, RoomParticipant>();
  for (const participant of room.clients.values()) {
    seen.set(participant.clientId, participant);
  }
  return Array.from(seen.values());
}

function getUserDmList(username: string) {
  const list: Array<{
    roomId: string;
    peer: ReturnType<typeof toPublicProfile>;
    updatedAt: number;
  }> = [];

  for (const thread of Object.values(store.dmThreads)) {
    if (thread.participants.includes(username)) {
      const peerUsername =
        thread.participants[0] === username ? thread.participants[1] : thread.participants[0];
      const peerUser = store.users[peerUsername];
      if (peerUser) {
        list.push({
          roomId: thread.roomId,
          peer: toPublicProfile(peerUser),
          updatedAt: thread.updatedAt,
        });
      }
    }
  }

  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

// Periodic cleanup of expired ephemeral encrypted messages (server never decrypts)
setInterval(() => {
  for (const room of rooms.values()) {
    const expiredIds = pruneExpiredMessages(room);
    if (expiredIds.length > 0) {
      broadcastToRoom(room, {
        type: 'message:expired',
        roomId: room.id,
        messageIds: expiredIds,
      });
    }
  }
}, 3000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      activeRooms: rooms.size,
      registeredUsers: Object.keys(store.users).length,
      timestamp: Date.now(),
    });
  });

  // Register username + password + password-encrypted ECDH private key backup
  app.post('/api/auth/register', (req, res) => {
    const {
      username: rawUsername,
      password,
      displayName,
      publicKeyJwk,
      fingerprint,
      encryptedPrivateKey,
      encryptedPrivateKeyIv,
      encryptedPrivateKeySalt,
    } = req.body || {};

    if (typeof rawUsername !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Username dan kata sandi wajib diisi.' });
      return;
    }

    const username = normalizeUsername(rawUsername);
    if (!isValidUsername(username)) {
      res.status(400).json({
        error: 'Username harus 3–24 karakter dan hanya boleh huruf kecil, angka, titik, atau garis bawah.',
      });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
      return;
    }

    if (store.users[username]) {
      res.status(409).json({ error: `Username @${username} sudah terdaftar. Gunakan username lain atau masuk.` });
      return;
    }

    if (
      !publicKeyJwk ||
      typeof fingerprint !== 'string' ||
      typeof encryptedPrivateKey !== 'string' ||
      typeof encryptedPrivateKeyIv !== 'string' ||
      typeof encryptedPrivateKeySalt !== 'string'
    ) {
      res.status(400).json({ error: 'Data kunci kriptografi perangkat tidak lengkap.' });
      return;
    }

    const { salt, hash } = hashPassword(password);
    const cleanDisplayName =
      typeof displayName === 'string' && displayName.trim()
        ? displayName.trim().slice(0, 48)
        : username;

    const newUser: StoredUser = {
      username,
      displayName: cleanDisplayName,
      passwordSalt: salt,
      passwordHash: hash,
      publicKeyJwk,
      fingerprint,
      encryptedPrivateKey,
      encryptedPrivateKeyIv,
      encryptedPrivateKeySalt,
      createdAt: Date.now(),
    };

    store.users[username] = newUser;
    const token = crypto.randomBytes(32).toString('hex');
    store.sessions[token] = { username, createdAt: Date.now() };
    saveStore();

    res.status(201).json({
      token,
      user: toPublicProfile(newUser),
      dms: [],
    });
  });

  // Login with username + password
  app.post('/api/auth/login', (req, res) => {
    const { username: rawUsername, password } = req.body || {};
    if (typeof rawUsername !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Username dan kata sandi wajib diisi.' });
      return;
    }

    const username = normalizeUsername(rawUsername);
    const user = store.users[username];
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      res.status(401).json({ error: 'Username atau kata sandi salah.' });
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    store.sessions[token] = { username, createdAt: Date.now() };
    saveStore();

    res.json({
      token,
      user: toPublicProfile(user),
      keyBackup: {
        encryptedPrivateKey: user.encryptedPrivateKey,
        encryptedPrivateKeyIv: user.encryptedPrivateKeyIv,
        encryptedPrivateKeySalt: user.encryptedPrivateKeySalt,
      },
      dms: getUserDmList(username),
    });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir.' });
      return;
    }
    res.json({
      user: toPublicProfile(user),
      dms: getUserDmList(user.username),
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (token && store.sessions[token]) {
      delete store.sessions[token];
      saveStore();
    }
    res.json({ ok: true });
  });

  // Search registered users by @username or displayName
  app.get('/api/users/search', (req, res) => {
    const currentUser = getAuthenticatedUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Silakan masuk terlebih dahulu.' });
      return;
    }
    const q = typeof req.query.q === 'string' ? normalizeUsername(req.query.q) : '';
    const results = Object.values(store.users)
      .filter((u) => {
        if (u.username === currentUser.username) return false;
        if (!q) return true;
        return u.username.includes(q) || u.displayName.toLowerCase().includes(q);
      })
      .slice(0, 20)
      .map(toPublicProfile);

    res.json({ users: results });
  });

  // Open or retrieve an E2EE Direct Chat with a registered @username
  app.post('/api/dm/open', (req, res) => {
    const currentUser = getAuthenticatedUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Silakan masuk terlebih dahulu.' });
      return;
    }

    const rawTarget = typeof req.body?.targetUsername === 'string' ? req.body.targetUsername : '';
    const targetUsername = normalizeUsername(rawTarget);
    if (!targetUsername) {
      res.status(400).json({ error: 'Masukkan username tujuan.' });
      return;
    }

    if (targetUsername === currentUser.username) {
      res.status(400).json({ error: 'Tidak dapat memulai obrolan langsung dengan username Anda sendiri.' });
      return;
    }

    const peerUser = store.users[targetUsername];
    if (!peerUser) {
      res.status(404).json({ error: `Pengguna @${targetUsername} tidak ditemukan.` });
      return;
    }

    const sortedPair = [currentUser.username, peerUser.username].sort() as [string, string];
    const roomId = `dm:${sortedPair[0]}__${sortedPair[1]}`;

    const thread: StoredDmThread = {
      roomId,
      participants: sortedPair,
      updatedAt: Date.now(),
    };
    store.dmThreads[roomId] = thread;
    saveStore();

    // Notify peer in real time if online
    notifyUserSockets(peerUser.username, {
      type: 'dm:opened',
      roomId,
      peer: toPublicProfile(currentUser),
      updatedAt: thread.updatedAt,
    });

    res.json({
      roomId,
      peer: toPublicProfile(peerUser),
      updatedAt: thread.updatedAt,
    });
  });

  app.get('/api/rooms/:roomId/meta', (req, res) => {
    const room = rooms.get(req.params.roomId);
    if (!room) {
      res.json({
        exists: false,
        roomId: req.params.roomId,
        participantCount: 0,
        messageCount: 0,
      });
      return;
    }
    pruneExpiredMessages(room);
    res.json({
      exists: true,
      roomId: room.id,
      name: room.name,
      participantCount: getParticipantsList(room).length,
      messageCount: room.messages.length,
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 * 1024 });

  wss.on('connection', (ws) => {
    let currentRoomId: string | null = null;
    let currentClientId: string | null = null;
    let authenticatedUsername: string | null = null;

    const leaveCurrentRoom = () => {
      if (!currentRoomId) return;
      const room = rooms.get(currentRoomId);
      if (room) {
        const participant = room.clients.get(ws);
        room.clients.delete(ws);
        if (participant) {
          broadcastToRoom(room, {
            type: 'room:presence',
            roomId: room.id,
            participants: getParticipantsList(room),
            leftClientId: participant.clientId,
          });
        }
      }
      currentRoomId = null;
    };

    const unregisterOnlineUser = () => {
      if (!authenticatedUsername) return;
      const set = onlineUserSockets.get(authenticatedUsername);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          onlineUserSockets.delete(authenticatedUsername);
        }
      }
      authenticatedUsername = null;
    };

    ws.on('message', (rawData) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(rawData.toString());
      } catch {
        return;
      }

      const eventType = typeof data.type === 'string' ? data.type : '';

      if (eventType === 'user:online') {
        const token = typeof data.token === 'string' ? data.token.trim() : '';
        const session = token ? store.sessions[token] : undefined;
        if (!session || !store.users[session.username]) return;
        unregisterOnlineUser();
        authenticatedUsername = session.username;
        let set = onlineUserSockets.get(authenticatedUsername);
        if (!set) {
          set = new Set<WebSocket>();
          onlineUserSockets.set(authenticatedUsername, set);
        }
        set.add(ws);
        return;
      }

      if (eventType === 'room:join') {
        const roomId = typeof data.roomId === 'string' ? data.roomId.trim().slice(0, 96) : '';
        const clientId = typeof data.clientId === 'string' ? data.clientId.trim().slice(0, 64) : '';
        const displayName = typeof data.displayName === 'string' ? data.displayName.trim().slice(0, 48) : 'Anonim';
        const fingerprint = typeof data.fingerprint === 'string' ? data.fingerprint.trim().slice(0, 96) : '';
        const username = typeof data.username === 'string' ? normalizeUsername(data.username) : undefined;
        const roomName = typeof data.roomName === 'string' ? data.roomName : undefined;
        const publicKeyJwk =
          data.publicKeyJwk && typeof data.publicKeyJwk === 'object'
            ? (data.publicKeyJwk as JsonWebKey)
            : null;

        if (!roomId || !clientId) return;

        if (currentRoomId && currentRoomId !== roomId) {
          leaveCurrentRoom();
        }

        const room = getOrCreateRoom(roomId, roomName);
        pruneExpiredMessages(room);

        const participant: RoomParticipant = {
          clientId,
          username,
          displayName,
          fingerprint,
          publicKeyJwk,
          joinedAt: Date.now(),
        };

        currentRoomId = room.id;
        currentClientId = clientId;
        room.clients.set(ws, participant);

        ws.send(
          JSON.stringify({
            type: 'room:state',
            roomId: room.id,
            roomName: room.name,
            participants: getParticipantsList(room),
            messages: room.messages,
          }),
        );

        broadcastToRoom(
          room,
          {
            type: 'room:presence',
            roomId: room.id,
            participants: getParticipantsList(room),
            joinedClientId: clientId,
          },
          ws,
        );
        return;
      }

      if (eventType === 'message:send') {
        if (!currentRoomId) return;
        const room = rooms.get(currentRoomId);
        if (!room) return;

        const envelope = data.envelope as EncryptedEnvelope | undefined;
        if (
          !envelope ||
          typeof envelope.id !== 'string' ||
          typeof envelope.ciphertext !== 'string' ||
          typeof envelope.iv !== 'string'
        ) {
          return;
        }

        if (room.messages.some((m) => m.id === envelope.id)) {
          return;
        }

        const now = Date.now();
        const ttlSeconds =
          typeof envelope.ttlSeconds === 'number' && envelope.ttlSeconds > 0
            ? Math.min(envelope.ttlSeconds, 86400)
            : 0;

        const storedEnvelope: EncryptedEnvelope = {
          id: envelope.id.slice(0, 80),
          roomId: room.id,
          senderId: typeof envelope.senderId === 'string' ? envelope.senderId.slice(0, 64) : currentClientId || '',
          senderUsername: typeof envelope.senderUsername === 'string' ? envelope.senderUsername.slice(0, 32) : authenticatedUsername || undefined,
          senderName: typeof envelope.senderName === 'string' ? envelope.senderName.slice(0, 48) : 'Anonim',
          senderFingerprint: typeof envelope.senderFingerprint === 'string' ? envelope.senderFingerprint.slice(0, 96) : '',
          messageType: envelope.messageType === 'voice' ? 'voice' : 'text',
          ciphertext: envelope.ciphertext,
          iv: envelope.iv,
          salt: typeof envelope.salt === 'string' ? envelope.salt : undefined,
          mimeType: typeof envelope.mimeType === 'string' ? envelope.mimeType : undefined,
          durationSec: typeof envelope.durationSec === 'number' ? envelope.durationSec : undefined,
          peaks: Array.isArray(envelope.peaks) ? envelope.peaks.slice(0, 48) : undefined,
          ttlSeconds,
          expiresAt: ttlSeconds > 0 ? now + ttlSeconds * 1000 : null,
          createdAt: typeof envelope.createdAt === 'number' ? envelope.createdAt : now,
        };

        room.messages.push(storedEnvelope);
        if (room.messages.length > 150) {
          room.messages = room.messages.slice(room.messages.length - 150);
        }

        // Persist DM ciphertext envelopes so registered users retain encrypted history
        if (room.id.startsWith('dm:')) {
          store.persistedMessages[room.id] = room.messages.slice(-80);
          const thread = store.dmThreads[room.id];
          if (thread) {
            thread.updatedAt = now;
            if (authenticatedUsername) {
              const peerUsername =
                thread.participants[0] === authenticatedUsername
                  ? thread.participants[1]
                  : thread.participants[0];
              const senderUser = store.users[authenticatedUsername];
              if (senderUser) {
                notifyUserSockets(peerUsername, {
                  type: 'dm:opened',
                  roomId: room.id,
                  peer: toPublicProfile(senderUser),
                  updatedAt: now,
                });
              }
            }
          }
          saveStore();
        }

        broadcastToRoom(room, {
          type: 'message:new',
          roomId: room.id,
          envelope: storedEnvelope,
        });
        return;
      }

      if (eventType === 'message:delete') {
        if (!currentRoomId) return;
        const room = rooms.get(currentRoomId);
        if (!room) return;
        const messageId = typeof data.messageId === 'string' ? data.messageId : '';
        if (!messageId) return;

        const idx = room.messages.findIndex((m) => m.id === messageId);
        if (idx !== -1) {
          room.messages.splice(idx, 1);
          if (room.id.startsWith('dm:')) {
            store.persistedMessages[room.id] = room.messages;
            saveStore();
          }
          broadcastToRoom(room, {
            type: 'message:deleted',
            roomId: room.id,
            messageId,
          });
        }
        return;
      }

      if (eventType === 'room:activity') {
        if (!currentRoomId || !currentClientId) return;
        const room = rooms.get(currentRoomId);
        if (!room) return;
        broadcastToRoom(
          room,
          {
            type: 'room:activity',
            roomId: room.id,
            clientId: currentClientId,
            displayName: typeof data.displayName === 'string' ? data.displayName.slice(0, 48) : 'Anonim',
            activity: data.activity === 'recording' ? 'recording' : data.activity === 'typing' ? 'typing' : 'idle',
          },
          ws,
        );
        return;
      }

      if (eventType === 'webrtc:signal') {
        if (!currentRoomId || !currentClientId) return;
        const room = rooms.get(currentRoomId);
        if (!room) return;
        const targetClientId = typeof data.targetClientId === 'string' ? data.targetClientId : null;

        for (const [client, participant] of room.clients) {
          if (client === ws || client.readyState !== WebSocket.OPEN) continue;
          if (!targetClientId || participant.clientId === targetClientId) {
            client.send(
              JSON.stringify({
                type: 'webrtc:signal',
                roomId: room.id,
                fromClientId: currentClientId,
                fromDisplayName: typeof data.fromDisplayName === 'string' ? data.fromDisplayName.slice(0, 48) : 'Anonim',
                signalType: data.signalType,
                payload: data.payload,
              }),
            );
          }
        }
      }
    });

    ws.on('close', () => {
      leaveCurrentRoom();
      unregisterOnlineUser();
    });
  });

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`SandiChat server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start SandiChat server:', err);
  process.exit(1);
});
