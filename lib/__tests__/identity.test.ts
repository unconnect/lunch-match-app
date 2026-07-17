import { describe, expect, it } from "vitest";
import {
  generateAccountId,
  generateRecoveryKey,
  hashRecoveryKey,
  verifyRecoveryKey,
} from "@/lib/identity";

describe("generateAccountId", () => {
  it("generates a 10-character alphanumeric id", () => {
    const id = generateAccountId();
    expect(id).toHaveLength(10);
    expect(id).toMatch(/^[A-Z0-9]+$/);
  });

  it("generates different ids on repeated calls", () => {
    expect(generateAccountId()).not.toBe(generateAccountId());
  });
});

describe("generateRecoveryKey", () => {
  it("generates a key of at least 20 characters", () => {
    expect(generateRecoveryKey().length).toBeGreaterThanOrEqual(20);
  });
});

describe("hashRecoveryKey / verifyRecoveryKey", () => {
  it("verifies a correct key against its hash", async () => {
    const key = generateRecoveryKey();
    const hash = await hashRecoveryKey(key);
    expect(await verifyRecoveryKey(key, hash)).toBe(true);
  });

  it("rejects an incorrect key", async () => {
    const hash = await hashRecoveryKey(generateRecoveryKey());
    expect(await verifyRecoveryKey("wrong-key", hash)).toBe(false);
  });
});
