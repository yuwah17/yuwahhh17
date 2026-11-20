import {
  computePublicKeyFingerprint,
  decryptPrivateKeyWithPassword,
  encryptPrivateKeyWithPassword,
  generateNewIdentity,
  LocalIdentity,
  saveIdentity,
  toBase64Url,
} from './crypto';
import { AccountProfile, DirectThreadMeta } from '../types/chat';

const SESSION_TOKEN_KEY = 'sandichat_session_token_v1';

export function getStoredSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredSessionToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // Ignore storage error
  }
}

async function apiJson<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getStoredSessionToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request error (${res.status})`);
  }
  return data as T;
}

export async function registerAccount(params: {
  username: string;
  password: string;
  displayName: string;
}): Promise<{
  token: string;
  user: AccountProfile;
  identity: LocalIdentity;
  dms: DirectThreadMeta[];
}> {
  const identity = await generateNewIdentity();
  const wrapped = await encryptPrivateKeyWithPassword(identity.privateKeyJwk, params.password);

  const data = await apiJson<{
    token: string;
    user: AccountProfile;
    dms: DirectThreadMeta[];
  }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: params.username,
      password: params.password,
      displayName: params.displayName,
      publicKeyJwk: identity.publicKeyJwk,
      fingerprint: identity.fingerprint,
      encryptedPrivateKey: wrapped.encryptedPrivateKey,
      encryptedPrivateKeyIv: wrapped.iv,
      encryptedPrivateKeySalt: wrapped.salt,
    }),
  });

  setStoredSessionToken(data.token);
  return {
    token: data.token,
    user: data.user,
    identity,
    dms: data.dms || [],
  };
}

export async function loginAccount(params: {
  username: string;
  password: string;
}): Promise<{
  token: string;
  user: AccountProfile;
  identity: LocalIdentity;
  dms: DirectThreadMeta[];
}> {
  const data = await apiJson<{
    token: string;
    user: AccountProfile;
    keyBackup: {
      encryptedPrivateKey: string;
      encryptedPrivateKeyIv: string;
      encryptedPrivateKeySalt: string;
    };
    dms: DirectThreadMeta[];
  }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username: params.username,
      password: params.password,
    }),
  });

  const privateKeyJwk = await decryptPrivateKeyWithPassword(
    data.keyBackup.encryptedPrivateKey,
    data.keyBackup.encryptedPrivateKeyIv,
    data.keyBackup.encryptedPrivateKeySalt,
    params.password,
  );

  const fingerprint = await computePublicKeyFingerprint(data.user.publicKeyJwk);
  const randomBytes = crypto.getRandomValues(new Uint8Array(12));
  const identity: LocalIdentity = {
    clientId: `usr_${data.user.username}_${toBase64Url(randomBytes).slice(0, 6)}`,
    publicKeyJwk: data.user.publicKeyJwk,
    privateKeyJwk,
    fingerprint,
    createdAt: Date.now(),
  };

  await saveIdentity(identity);
  setStoredSessionToken(data.token);

  return {
    token: data.token,
    user: data.user,
    identity,
    dms: data.dms || [],
  };
}

export async function fetchCurrentSession(): Promise<{
  user: AccountProfile;
  dms: DirectThreadMeta[];
} | null> {
  const token = getStoredSessionToken();
  if (!token) return null;
  try {
    return await apiJson<{ user: AccountProfile; dms: DirectThreadMeta[] }>('/api/auth/me');
  } catch {
    setStoredSessionToken(null);
    return null;
  }
}

export async function logoutAccount(): Promise<void> {
  try {
    await apiJson('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore logout network error
  } finally {
    setStoredSessionToken(null);
  }
}

export async function searchRegisteredUsers(query: string): Promise<AccountProfile[]> {
  const data = await apiJson<{ users: AccountProfile[] }>(
    `/api/users/search?q=${encodeURIComponent(query)}`,
  );
  return data.users || [];
}

export async function openDirectChatByUsername(targetUsername: string): Promise<DirectThreadMeta> {
  return apiJson<DirectThreadMeta>('/api/dm/open', {
    method: 'POST',
    body: JSON.stringify({ targetUsername }),
  });
}
