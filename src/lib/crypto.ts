/**
 * Client-Side Web Crypto API End-to-End Encryption Engine
 * - Identity keys: ECDH P-256 generated and stored locally in IndexedDB
 * - Message & Voice encryption: AES-256-GCM with 96-bit random IV and room AAD
 * - Room Key Derivation: 256-bit random key or PBKDF2-SHA256 (250,000 iterations)
 * - Armored Google Chat bridge format: [SANDICHAT-E2EE:v1:<base64url>]
 */

export interface LocalIdentity {
  clientId: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
  fingerprint: string;
  createdAt: number;
}

export interface EncryptedTextResult {
  ciphertext: string;
  iv: string;
}

export interface EncryptedBinaryResult {
  ciphertext: string;
  iv: string;
}

const DB_NAME = 'sandichat_keystore_v1';
const STORE_NAME = 'identities';
const IDENTITY_KEY = 'primary_ecdh_p256';

function openKeyStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openKeyStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openKeyStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function toBase64Url(bytes: Uint8Array): string {
  return arrayBufferToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  return base64ToUint8Array(padded);
}

export async function computePublicKeyFingerprint(publicKeyJwk: JsonWebKey): Promise<string> {
  const canonical = JSON.stringify({
    crv: publicKeyJwk.crv,
    kty: publicKeyJwk.kty,
    x: publicKeyJwk.x,
    y: publicKeyJwk.y,
  });
  const encoded = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const bytes = new Uint8Array(digest);
  const hexBlocks: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    const pair = bytes[i].toString(16).padStart(2, '0') + bytes[i + 1].toString(16).padStart(2, '0');
    hexBlocks.push(pair.toUpperCase());
  }
  return hexBlocks.join(' ');
}

export async function saveIdentity(identity: LocalIdentity): Promise<void> {
  await idbSet(IDENTITY_KEY, identity);
}

export async function generateNewIdentity(): Promise<LocalIdentity> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  );
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const fingerprint = await computePublicKeyFingerprint(publicKeyJwk);
  const randomBytes = crypto.getRandomValues(new Uint8Array(12));
  const clientId = 'usr_' + toBase64Url(randomBytes);

  const identity: LocalIdentity = {
    clientId,
    publicKeyJwk,
    privateKeyJwk,
    fingerprint,
    createdAt: Date.now(),
  };

  await idbSet(IDENTITY_KEY, identity);
  return identity;
}

export async function getOrCreateIdentity(): Promise<LocalIdentity> {
  try {
    const existing = await idbGet<LocalIdentity>(IDENTITY_KEY);
    if (existing && existing.publicKeyJwk && existing.privateKeyJwk && existing.fingerprint) {
      return existing;
    }
  } catch {
    // Fallback if IndexedDB unavailable
  }
  return generateNewIdentity();
}

export async function encryptPrivateKeyWithPassword(
  privateKeyJwk: JsonWebKey,
  password: string,
): Promise<{ encryptedPrivateKey: string; iv: string; salt: string }> {
  const enc = new TextEncoder();
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const wrappingKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 200000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes },
    wrappingKey,
    enc.encode(JSON.stringify(privateKeyJwk)),
  );
  return {
    encryptedPrivateKey: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(ivBytes),
    salt: arrayBufferToBase64(saltBytes),
  };
}

export async function decryptPrivateKeyWithPassword(
  encryptedPrivateKey: string,
  ivB64: string,
  saltB64: string,
  password: string,
): Promise<JsonWebKey> {
  const enc = new TextEncoder();
  const saltBytes = base64ToUint8Array(saltB64);
  const ivBytes = base64ToUint8Array(ivB64);
  const ctBytes = base64ToUint8Array(encryptedPrivateKey);
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const wrappingKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(saltBytes),
      iterations: 200000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(ivBytes) },
    wrappingKey,
    new Uint8Array(ctBytes),
  );
  return JSON.parse(new TextDecoder().decode(decrypted)) as JsonWebKey;
}

export async function deriveEcdhRoomAesKey(
  localPrivateKeyJwk: JsonWebKey,
  peerPublicKeyJwk: JsonWebKey,
  roomId: string,
): Promise<CryptoKey> {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    localPrivateKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    peerPublicKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256,
  );
  const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const enc = new TextEncoder();
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode(`SandiChat-ECDH-DM-v1:${roomId}`),
      info: enc.encode('AES-256-GCM'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function generateRandomRoomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return toBase64Url(bytes);
}

export async function deriveRoomAesKey(roomId: string, secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const salt = enc.encode(`SandiChat-E2EE-Room-v1:${roomId}`);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 250000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptText(
  key: CryptoKey,
  roomId: string,
  plaintext: string,
): Promise<EncryptedTextResult> {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: enc.encode(roomId),
    },
    key,
    enc.encode(plaintext),
  );
  return {
    ciphertext: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv),
  };
}

export async function decryptText(
  key: CryptoKey,
  roomId: string,
  ciphertextB64: string,
  ivB64: string,
): Promise<string> {
  const enc = new TextEncoder();
  const iv = base64ToUint8Array(ivB64);
  const ct = base64ToUint8Array(ciphertextB64);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(iv),
      additionalData: enc.encode(roomId),
    },
    key,
    new Uint8Array(ct),
  );
  return new TextDecoder().decode(decrypted);
}

export async function encryptBinary(
  key: CryptoKey,
  roomId: string,
  data: ArrayBuffer,
): Promise<EncryptedBinaryResult> {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: enc.encode(roomId),
    },
    key,
    data,
  );
  return {
    ciphertext: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv),
  };
}

export async function decryptBinary(
  key: CryptoKey,
  roomId: string,
  ciphertextB64: string,
  ivB64: string,
): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const iv = base64ToUint8Array(ivB64);
  const ct = base64ToUint8Array(ciphertextB64);
  return crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(iv),
      additionalData: enc.encode(roomId),
    },
    key,
    new Uint8Array(ct),
  );
}

const ARMOR_PREFIX = '[SANDICHAT-E2EE:v1:';
const ARMOR_SUFFIX = ']';

export async function armorTextForGoogleChat(
  key: CryptoKey,
  spaceId: string,
  plaintext: string,
): Promise<string> {
  const { ciphertext, iv } = await encryptText(key, spaceId, plaintext);
  const payload = JSON.stringify({ iv, ct: ciphertext });
  const encoded = toBase64Url(new TextEncoder().encode(payload));
  return `${ARMOR_PREFIX}${encoded}${ARMOR_SUFFIX}`;
}

export function isArmoredGoogleChatMessage(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith(ARMOR_PREFIX) && trimmed.endsWith(ARMOR_SUFFIX);
}

export async function unarmorGoogleChatMessage(
  key: CryptoKey,
  spaceId: string,
  armoredText: string,
): Promise<{ ok: true; plaintext: string; ciphertextPreview: string } | { ok: false; ciphertextPreview: string }> {
  const trimmed = armoredText.trim();
  if (!isArmoredGoogleChatMessage(trimmed)) {
    return { ok: false, ciphertextPreview: trimmed };
  }
  const inner = trimmed.slice(ARMOR_PREFIX.length, trimmed.length - ARMOR_SUFFIX.length);
  try {
    const jsonBytes = fromBase64Url(inner);
    const parsed = JSON.parse(new TextDecoder().decode(jsonBytes)) as { iv?: string; ct?: string };
    if (!parsed.iv || !parsed.ct) {
      return { ok: false, ciphertextPreview: inner };
    }
    const plaintext = await decryptText(key, spaceId, parsed.ct, parsed.iv);
    return {
      ok: true,
      plaintext,
      ciphertextPreview: parsed.ct,
    };
  } catch {
    return { ok: false, ciphertextPreview: inner };
  }
}

export function createIdenticonSeed(fingerprint: string): number[] {
  const clean = fingerprint.replace(/\s+/g, '');
  const cells: number[] = [];
  for (let i = 0; i < 9; i++) {
    const ch = clean.charCodeAt(i % clean.length) || 65;
    cells.push(ch % 2);
  }
  return cells;
}
