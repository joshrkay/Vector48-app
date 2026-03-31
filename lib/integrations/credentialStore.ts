import "server-only";
import { encryptString, decryptString } from "@/lib/utils/encryption";

const V = 1;

export interface EncryptedCredentialBlob {
  v: typeof V;
  ciphertext: string;
}

export function encryptCredentials(
  data: Record<string, unknown>,
): EncryptedCredentialBlob {
  return {
    v: V,
    ciphertext: encryptString(JSON.stringify(data)),
  };
}

export function decryptCredentials(blob: EncryptedCredentialBlob): Record<
  string,
  unknown
> {
  if (blob.v !== V || typeof blob.ciphertext !== "string") {
    throw new Error("Invalid credential blob");
  }
  return JSON.parse(decryptString(blob.ciphertext)) as Record<string, unknown>;
}
