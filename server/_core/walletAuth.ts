import { randomBytes } from "node:crypto";
import type { Express, Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import { getAddress, verifyMessage } from "ethers";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

const NONCE_TTL_MS = 5 * 60 * 1000;

type NonceRecord = {
  address: string;
  nonce: string;
  message: string;
  expiresAt: number;
  used: boolean;
};

type AccessTokenPayload = {
  sub: string;
  address: string;
  loginMethod: "wallet";
};

const nonceStore = new Map<string, NonceRecord>();

function getAuthTokenSecret() {
  if (!ENV.authTokenSecret) {
    throw new Error("AUTH_TOKEN_SECRET is not configured");
  }
  return new TextEncoder().encode(ENV.authTokenSecret);
}

function normalizeWalletAddress(address: string) {
  return getAddress(address.trim()).toLowerCase();
}

function abbreviateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function buildLoginMessage(address: string, nonce: string, issuedAt: Date, expiresAt: Date) {
  return [
    "CryptoAI Login",
    "",
    `Wallet: ${address}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expires At: ${expiresAt.toISOString()}`,
  ].join("\n");
}

async function requireWhitelistedWallet(address: string) {
  const whitelistEntry = await db.getWalletWhitelistEntry(address);
  if (!whitelistEntry || !whitelistEntry.isActive) {
    throw new Error("Wallet is not allowed to login");
  }
  return whitelistEntry;
}

async function upsertWalletUser(address: string): Promise<User> {
  const now = new Date();
  await db.upsertUser({
    openId: address,
    name: abbreviateAddress(address),
    email: null,
    loginMethod: "wallet",
    lastSignedIn: now,
  });
  await db.touchWalletWhitelistLogin(address);

  const user = await db.getUserByOpenId(address);
  if (!user) {
    throw new Error("User not found after wallet login");
  }
  return user;
}

export async function createWalletAccessToken(address: string) {
  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = Number.isFinite(ENV.authTokenTtlSeconds)
    ? ENV.authTokenTtlSeconds
    : 604800;
  const secret = getAuthTokenSecret();

  return new SignJWT({
    address,
    loginMethod: "wallet",
  } satisfies Omit<AccessTokenPayload, "sub">)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(address)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(secret);
}

export async function verifyWalletAccessToken(token: string) {
  const secret = getAuthTokenSecret();
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"],
  });

  const subject = payload.sub;
  const address = payload.address;
  if (typeof subject !== "string" || typeof address !== "string") {
    throw new Error("Invalid wallet token payload");
  }

  const normalizedSubject = normalizeWalletAddress(subject);
  const normalizedAddress = normalizeWalletAddress(address);
  if (normalizedSubject !== normalizedAddress) {
    throw new Error("Wallet token subject mismatch");
  }

  return {
    address: normalizedAddress,
  };
}

function extractBearerToken(req: Request) {
  const header = req.headers.authorization;
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    throw new Error("Invalid Authorization header");
  }

  return token;
}

export async function authenticateWalletRequest(req: Request): Promise<User | null> {
  const token = extractBearerToken(req);
  if (!token) return null;

  const { address } = await verifyWalletAccessToken(token);
  await requireWhitelistedWallet(address);
  return await upsertWalletUser(address);
}

export function registerWalletAuthRoutes(app: Express) {
  app.get("/api/auth/nonce", async (req, res) => {
    const rawAddress = typeof req.query.address === "string" ? req.query.address : "";
    if (!rawAddress) {
      res.status(400).json({ error: "address is required" });
      return;
    }

    try {
      const address = normalizeWalletAddress(rawAddress);
      await requireWhitelistedWallet(address);

      const nonce = randomBytes(16).toString("hex");
      const issuedAt = new Date();
      const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS);
      const message = buildLoginMessage(address, nonce, issuedAt, expiresAt);

      nonceStore.set(`${address}:${nonce}`, {
        address,
        nonce,
        message,
        expiresAt: expiresAt.getTime(),
        used: false,
      });

      res.json({
        address,
        nonce,
        message,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      res.status(401).json({
        error: error instanceof Error ? error.message : "Failed to create login nonce",
      });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const rawAddress = typeof req.body?.address === "string" ? req.body.address : "";
    const message = typeof req.body?.message === "string" ? req.body.message : "";
    const signature = typeof req.body?.signature === "string" ? req.body.signature : "";

    if (!rawAddress || !message || !signature) {
      res.status(400).json({ error: "address, message and signature are required" });
      return;
    }

    try {
      const address = normalizeWalletAddress(rawAddress);
      await requireWhitelistedWallet(address);

      const nonceLine = message
        .split("\n")
        .find((line: string) => line.startsWith("Nonce: "));
      const nonce = nonceLine?.slice("Nonce: ".length).trim();
      if (!nonce) {
        throw new Error("Nonce missing from message");
      }

      const record = nonceStore.get(`${address}:${nonce}`);
      if (!record) {
        throw new Error("Login message not found or expired");
      }
      if (record.used) {
        throw new Error("Login message already used");
      }
      if (record.message !== message) {
        throw new Error("Login message mismatch");
      }
      if (Date.now() > record.expiresAt) {
        nonceStore.delete(`${address}:${nonce}`);
        throw new Error("Login message expired");
      }

      const recoveredAddress = normalizeWalletAddress(verifyMessage(message, signature));
      if (recoveredAddress !== address) {
        throw new Error("Signature verification failed");
      }

      record.used = true;
      nonceStore.delete(`${address}:${nonce}`);
      await upsertWalletUser(address);
      const accessToken = await createWalletAccessToken(address);

      res.json({
        address,
        tokenType: "Bearer",
        expiresIn: ENV.authTokenTtlSeconds,
        accessToken,
      });
    } catch (error) {
      res.status(401).json({
        error: error instanceof Error ? error.message : "Wallet login failed",
      });
    }
  });

  app.post("/api/wallet-address-tags", async (req, res) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Authorization header is required" });
      return;
    }

    const rawAddress = typeof req.body?.address === "string" ? req.body.address : "";
    const rawTags = typeof req.body?.tags === "string" ? req.body.tags : "";
    if (!rawAddress || !rawTags.trim()) {
      res.status(400).json({ error: "address and tags are required" });
      return;
    }

    try {
      await authenticateWalletRequest(req);
      const address = normalizeWalletAddress(rawAddress);
      const result = await db.upsertWalletAddressTag(address, rawTags);

      res.json(result);
    } catch (error) {
      res.status(401).json({
        error: error instanceof Error ? error.message : "Failed to save wallet tags",
      });
    }
  });
}
