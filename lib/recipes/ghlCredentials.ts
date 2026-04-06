import crypto from "node:crypto";

export type IntegrationCredentials = {
  access_token?: string;
  token?: string;
  api_key?: string;
  token_encrypted?: string;
  location_id?: string;
};

function getEncryptionKey(): Buffer | null {
  const rawKey = process.env.GHL_TOKEN_ENCRYPTION_KEY;
  if (!rawKey) return null;

  const base64 = Buffer.from(rawKey, "base64");
  if (base64.length === 32) return base64;

  const hex = Buffer.from(rawKey, "hex");
  if (hex.length === 32) return hex;

  return null;
}

function decryptToken(encrypted: string): string | null {
  const key = getEncryptionKey();
  if (!key) return null;

  try {
    const data = Buffer.from(encrypted, "base64");
    const iv = data.subarray(0, 12);
    const tag = data.subarray(data.length - 16);
    const ciphertext = data.subarray(12, data.length - 16);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function getGhlToken(credentials: unknown): string | null {
  if (!credentials || typeof credentials !== "object") return null;
  const c = credentials as IntegrationCredentials;
  const token =
    c.access_token ??
    c.token ??
    c.api_key ??
    (c.token_encrypted ? decryptToken(c.token_encrypted) : null);
  return typeof token === "string" && token.length > 0 ? token : null;
}

export function getIntegrationLocationId(credentials: unknown): string | null {
  if (!credentials || typeof credentials !== "object") return null;
  const c = credentials as IntegrationCredentials;
  return typeof c.location_id === "string" && c.location_id.length > 0
    ? c.location_id
    : null;
}
