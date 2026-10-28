// Exchange a Zoho Self Client authorization code for a refresh token.
// The code is read from stdin so it never lands in shell history.
// Run: node --env-file=.env _docs/task/zoho-token.mjs

import { createInterface } from "node:readline/promises";

const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET } = process.env;
const missing = ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET"].filter((k) => !process.env[k]);
if (missing.length) {
  console.log(`missing env: ${missing.join(", ")}`);
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const code = (await rl.question("Paste the authorization code (1000.xxxx): ")).trim();
rl.close();
if (!code) {
  console.log("no code given");
  process.exit(1);
}

// Self Client codes aren't tied to a real redirect; Zoho has documented both of these
// depending on console version, so try each until one is accepted.
const REDIRECT_URIS = ["https://www.zoho.com", "https://api.console.zoho.com/"];

let json = {};
for (const [i, redirectUri] of REDIRECT_URIS.entries()) {
  const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  // A failed exchange burns the code, so only retry on a redirect mismatch
  json = await res.json();
  if (!json.error) {
    console.log(`redirect_uri accepted: ${redirectUri}`);
    break;
  }
  const retryable = json.error === "invalid_redirect_uri" || json.error === "invalid_code_redirect_uri";
  if (!retryable || i === REDIRECT_URIS.length - 1) break;
  console.log(`  ${json.error} with ${redirectUri}, retrying…`);
}

if (json.error) {
  console.log(`FAILED: ${json.error}  ${json.error_description ?? ""}`.trim());
  console.log("  invalid_code          → already used, or >10 min old. Generate a new one.");
  console.log("  invalid_client        → client id/secret in .env are wrong.");
  process.exit(1);
}

console.log("\nrefresh_token:\n" + json.refresh_token);
console.log("\nscopes granted:\n" + json.scope);
console.log("\nPaste that refresh_token into .env as ZOHO_REFRESH_TOKEN, then restart the dev server.");
