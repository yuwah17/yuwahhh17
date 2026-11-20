export type AppSection = 'vault' | 'google-chat' | 'security' | 'guide';

export interface AccountProfile {
  username: string;
  displayName: string;
  publicKeyJwk: JsonWebKey;
  fingerprint: string;
}

export interface DirectThreadMeta {
  roomId: string;
  peer: AccountProfile;
  updatedAt: number;
}

export interface VaultRoomMeta {
  id: string;
  name: string;
  kind?: 'group' | 'dm';
  secret: string;
  peer?: AccountProfile;
  ttlSeconds: number;
  createdAt: number;
}

export interface RoomParticipant {
  clientId: string;
  username?: string;
  displayName: string;
  fingerprint: string;
  publicKeyJwk: JsonWebKey | null;
  joinedAt: number;
}

export interface WireEncryptedEnvelope {
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

export interface DecryptedVaultMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderUsername?: string;
  senderName: string;
  senderFingerprint: string;
  messageType: 'text' | 'voice';
  decryptedText?: string;
  audioUrl?: string;
  mimeType?: string;
  durationSec?: number;
  peaks?: number[];
  decryptionFailed: boolean;
  rawCiphertext: string;
  rawIv: string;
  ttlSeconds?: number;
  expiresAt?: number | null;
  createdAt: number;
}

export interface PendingGoogleChatMutation {
  kind: 'send_message' | 'create_space' | 'delete_message';
  title: string;
  description: string;
  targetLabel: string;
  payloadPreview?: string;
  onConfirm: () => Promise<void>;
}
