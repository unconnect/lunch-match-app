import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const ACCOUNT_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (no I,O,0,1)
const ACCOUNT_ID_LENGTH = 10;
const RECOVERY_KEY_BYTES = 18; // -> 24 base64url characters
const BCRYPT_ROUNDS = 12;

export function generateAccountId(): string {
  const bytes = randomBytes(ACCOUNT_ID_LENGTH);
  let result = "";
  for (let i = 0; i < ACCOUNT_ID_LENGTH; i++) {
    result += ACCOUNT_ID_ALPHABET[bytes[i] % ACCOUNT_ID_ALPHABET.length];
  }
  return result;
}

export function generateRecoveryKey(): string {
  return randomBytes(RECOVERY_KEY_BYTES).toString("base64url");
}

export async function hashRecoveryKey(key: string): Promise<string> {
  return bcrypt.hash(key, BCRYPT_ROUNDS);
}

export async function verifyRecoveryKey(key: string, hash: string): Promise<boolean> {
  return bcrypt.compare(key, hash);
}
