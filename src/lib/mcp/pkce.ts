import { randomBytes, createHash } from "crypto";

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Used for authorization codes and MCP access/refresh tokens — high-entropy,
// URL-safe, not derived from any DB serial.
export function generateToken(): string {
  return base64url(randomBytes(32));
}

// Access/refresh tokens are stored as hashes only, never plaintext.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// PKCE S256 verification (OAuth 2.1 forbids the "plain" method).
export function verifyPkceChallenge(codeVerifier: string, codeChallenge: string): boolean {
  const computed = base64url(createHash("sha256").update(codeVerifier).digest());
  return computed === codeChallenge;
}
