import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

export const GOOGLE_CHAT_SCOPES = [
  'https://www.googleapis.com/auth/chat.spaces',
  'https://www.googleapis.com/auth/chat.messages',
  'https://www.googleapis.com/auth/chat.memberships.readonly',
];

const provider = new GoogleAuthProvider();
for (const scope of GOOGLE_CHAT_SCOPES) {
  provider.addScope(scope);
}

// Strict in-memory token caching (never localStorage or sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const GOOGLE_CHAT_CONSOLE_URL = `https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat?project=${firebaseConfig.projectId}`;

export function initGoogleChatAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: (user: User | null) => void,
) {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.(user);
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.(null);
    }
  });
}

export async function signInWithGoogleChat(): Promise<{ user: User; accessToken: string }> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan token akses Google Chat.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export function getCachedAccessToken(): string | null {
  return cachedAccessToken;
}

export async function signOutGoogleChat(): Promise<void> {
  await auth.signOut();
  cachedAccessToken = null;
}

export interface GoogleChatSpace {
  name: string;
  type?: string;
  spaceType?: string;
  displayName?: string;
  singleUserBotDm?: boolean;
  spaceThreadingState?: string;
}

export interface GoogleChatMessage {
  name: string;
  sender?: {
    name?: string;
    displayName?: string;
    type?: string;
  };
  createTime?: string;
  text?: string;
  formattedText?: string;
  thread?: {
    name?: string;
  };
}

export interface GoogleChatMember {
  name: string;
  role?: string;
  member?: {
    name?: string;
    displayName?: string;
    type?: string;
  };
}

export class GoogleChatApiError extends Error {
  status: number;
  code?: string;
  isAppNotConfigured: boolean;
  isConsumerAccountUnsupported: boolean;
  isUnauthorized: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    const lower = message.toLowerCase();
    this.isAppNotConfigured =
      status === 404 &&
      (lower.includes('google chat app not found') ||
        lower.includes('chat app') ||
        lower.includes('hangouts-chat'));
    this.isConsumerAccountUnsupported =
      (status === 403 || status === 400) &&
      (lower.includes('consumer') ||
        lower.includes('gmail.com') ||
        lower.includes('workspace') ||
        lower.includes('not enabled for this user') ||
        lower.includes('access not configured'));
    this.isUnauthorized = status === 401;
  }
}

async function chatFetch<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    let errMessage = `Google Chat API error (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) {
        errMessage = errJson.error.message;
      }
    } catch {
      // Keep default message
    }
    throw new GoogleChatApiError(errMessage, res.status);
  }

  if (res.status === 204) {
    return {} as T;
  }
  return res.json() as Promise<T>;
}

export async function listChatSpaces(accessToken: string): Promise<GoogleChatSpace[]> {
  const data = await chatFetch<{ spaces?: GoogleChatSpace[] }>(
    'https://chat.googleapis.com/v1/spaces?pageSize=50',
    accessToken,
  );
  return data.spaces || [];
}

export async function createChatSpace(
  accessToken: string,
  displayName: string,
): Promise<GoogleChatSpace> {
  return chatFetch<GoogleChatSpace>('https://chat.googleapis.com/v1/spaces', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      spaceType: 'SPACE',
      displayName: displayName.trim(),
    }),
  });
}

export async function listChatMessages(
  accessToken: string,
  spaceName: string,
): Promise<GoogleChatMessage[]> {
  const data = await chatFetch<{ messages?: GoogleChatMessage[] }>(
    `https://chat.googleapis.com/v1/${spaceName}/messages?pageSize=50&orderBy=createTime%20asc`,
    accessToken,
  );
  return data.messages || [];
}

export async function sendChatMessage(
  accessToken: string,
  spaceName: string,
  text: string,
): Promise<GoogleChatMessage> {
  return chatFetch<GoogleChatMessage>(
    `https://chat.googleapis.com/v1/${spaceName}/messages`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ text }),
    },
  );
}

export async function deleteChatMessage(accessToken: string, messageName: string): Promise<void> {
  await chatFetch<unknown>(`https://chat.googleapis.com/v1/${messageName}`, accessToken, {
    method: 'DELETE',
  });
}

export async function listChatMembers(
  accessToken: string,
  spaceName: string,
): Promise<GoogleChatMember[]> {
  const data = await chatFetch<{ memberships?: GoogleChatMember[] }>(
    `https://chat.googleapis.com/v1/${spaceName}/members?pageSize=50`,
    accessToken,
  );
  return data.memberships || [];
}
