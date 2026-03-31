import crypto from "crypto";
import { encryptString, decryptString } from "@/lib/utils/encryption";

export interface OAuthStatePayload {
  accountId: string;
  ts: number;
  nonce: string;
}

const MAX_AGE_MS = 10 * 60 * 1000;

export function createOAuthState(accountId: string): string {
  const payload: OAuthStatePayload = {
    accountId,
    ts: Date.now(),
    nonce: crypto.randomBytes(16).toString("hex"),
  };
  return encryptString(JSON.stringify(payload));
}

export function parseOAuthState(state: string): OAuthStatePayload {
  const raw = decryptString(state);
  const parsed = JSON.parse(raw) as OAuthStatePayload;
  if (
    typeof parsed.accountId !== "string" ||
    typeof parsed.ts !== "number"
  ) {
    throw new Error("invalid state");
  }
  if (Date.now() - parsed.ts > MAX_AGE_MS) {
    throw new Error("state expired");
  }
  return parsed;
}
