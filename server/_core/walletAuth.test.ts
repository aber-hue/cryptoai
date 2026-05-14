import { beforeEach, describe, expect, it } from "vitest";

describe("wallet auth token", () => {
  beforeEach(() => {
    process.env.AUTH_TOKEN_SECRET = "test-secret-for-wallet-auth";
    process.env.AUTH_TOKEN_TTL_SECONDS = "600";
  });

  it("creates and verifies a bearer token for the wallet address", async () => {
    const { createWalletAccessToken, verifyWalletAccessToken } = await import("./walletAuth");
    const address = "0x1234567890123456789012345678901234567890";

    const token = await createWalletAccessToken(address);
    const payload = await verifyWalletAccessToken(token);

    expect(payload.address).toBe(address.toLowerCase());
  });
});
