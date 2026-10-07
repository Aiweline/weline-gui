import type { SshKeyStorage, SshPrivateKeyRef } from '../types';

/** In-memory private keys for session_only (never localStorage). */
const sessionKeys = new Map<string, { pem: string; passphrase?: string }>();

function newKeyId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `ssh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Rough fingerprint for UI only — not a cryptographic identity proof. */
export async function fingerprintPemSha256(pem: string): Promise<string> {
  const bytes = new TextEncoder().encode(pem.trim());
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(':');
  }
  let hash = 0;
  for (let i = 0; i < bytes.length; i += 1) hash = (hash * 31 + bytes[i]) >>> 0;
  return `legacy:${hash.toString(16)}`;
}

export function putSessionPrivateKey(pem: string, passphrase?: string, keyId = newKeyId()): SshPrivateKeyRef {
  sessionKeys.set(keyId, { pem: pem.trim(), passphrase: passphrase || undefined });
  return {
    storage: 'session_only',
    keyId,
  };
}

export function getSessionPrivateKey(keyId: string): { pem: string; passphrase?: string } | null {
  return sessionKeys.get(keyId) || null;
}

export function clearSessionPrivateKey(keyId: string): void {
  sessionKeys.delete(keyId);
}

export function clearAllSessionPrivateKeys(): void {
  sessionKeys.clear();
}

/**
 * Web persistence: WebCrypto AES-GCM + PBKDF2 into IndexedDB.
 * Desktop os_keychain is a future Tauri path; Web never uses OS keychain.
 */
const VAULT_DB = 'weline-ssh-vault';
const VAULT_STORE = 'keys';

function openVault(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(VAULT_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VAULT_STORE)) {
        db.createObjectStore(VAULT_STORE, { keyPath: 'keyId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });
}

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const saltBuf = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuf, iterations: 120_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function putEncryptedVaultKey(
  pem: string,
  vaultPassphrase: string,
  keyPassphrase?: string,
): Promise<SshPrivateKeyRef> {
  const keyId = newKeyId();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aes = await deriveAesKey(vaultPassphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify({
    pem: pem.trim(),
    passphrase: keyPassphrase || '',
  }));
  const ivBuf = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBuf }, aes, plaintext);
  const db = await openVault();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE, 'readwrite');
    tx.objectStore(VAULT_STORE).put({
      keyId,
      salt: Array.from(salt),
      iv: Array.from(iv),
      cipher: Array.from(new Uint8Array(cipher)),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('vault write failed'));
  });
  db.close();
  const fingerprintSha256 = await fingerprintPemSha256(pem);
  return {
    storage: 'encrypted_vault',
    keyId,
    fingerprintSha256,
  };
}

export async function getEncryptedVaultKey(
  keyId: string,
  vaultPassphrase: string,
): Promise<{ pem: string; passphrase?: string } | null> {
  const db = await openVault();
  const row = await new Promise<{
    salt: number[];
    iv: number[];
    cipher: number[];
  } | undefined>((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE, 'readonly');
    const req = tx.objectStore(VAULT_STORE).get(keyId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('vault read failed'));
  });
  db.close();
  if (!row) return null;
  const salt = new Uint8Array(row.salt);
  const iv = new Uint8Array(row.iv);
  const cipher = new Uint8Array(row.cipher);
  const aes = await deriveAesKey(vaultPassphrase, salt);
  const ivBuf = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
  const cipherBuf = cipher.buffer.slice(cipher.byteOffset, cipher.byteOffset + cipher.byteLength) as ArrayBuffer;
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, aes, cipherBuf);
  const parsed = JSON.parse(new TextDecoder().decode(plain)) as { pem: string; passphrase?: string };
  return {
    pem: parsed.pem,
    passphrase: parsed.passphrase || undefined,
  };
}

export async function resolvePrivateKeyMaterial(
  ref: SshPrivateKeyRef,
  vaultPassphrase?: string,
): Promise<{ pem: string; passphrase?: string }> {
  if (ref.storage === 'session_only') {
    const found = getSessionPrivateKey(ref.keyId);
    if (!found) throw new Error('SSH private key is not in this browser session');
    return found;
  }
  if (ref.storage === 'encrypted_vault') {
    if (!vaultPassphrase) throw new Error('Vault passphrase required');
    const found = await getEncryptedVaultKey(ref.keyId, vaultPassphrase);
    if (!found) throw new Error('SSH private key not found in encrypted vault');
    return found;
  }
  throw new Error('os_keychain is only available in the desktop app');
}

export function describeStorage(storage: SshKeyStorage): string {
  switch (storage) {
    case 'os_keychain':
      return 'OS keychain';
    case 'encrypted_vault':
      return 'Encrypted vault';
    default:
      return 'Session only';
  }
}
