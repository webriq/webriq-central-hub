// Zoho access check — is the portal / Desk org still live for the configured token?
// Run: node --env-file=.env _docs/task/check-zoho-status.mjs

const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_DESK_ORG_ID } = process.env;

const post = (url, body) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  }).then((r) => r.json());

const get = (url, token, extra = {}) =>
  fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}`, ...extra } }).then(async (r) => ({
    status: r.status,
    body: await r.text(),
  }));

const missing = ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN"].filter((k) => !process.env[k]);
if (missing.length) {
  console.log(`missing env: ${missing.join(", ")}`);
  process.exit(1);
}

const tok = await post("https://accounts.zoho.com/oauth/v2/token", {
  grant_type: "refresh_token",
  client_id: ZOHO_CLIENT_ID,
  client_secret: ZOHO_CLIENT_SECRET,
  refresh_token: ZOHO_REFRESH_TOKEN,
});

if (!tok.access_token) {
  console.log("token FAILED:", JSON.stringify(tok));
  process.exit(1);
}
console.log("token ok");
console.log("scopes:", tok.scope ?? "(not returned)");

const portals = await get("https://projectsapi.zoho.com/restapi/portals/", tok.access_token);
console.log(`\nProjects  ${portals.status}  ${portals.body.slice(0, 300)}`);
const list = JSON.parse(portals.body).portals ?? [];
console.log(list.length ? `=> ACTIVE (${list.length} portal)` : "=> no portals reachable (deactivated or not a member)");

if (process.env.ZOHO_PORTAL_ID) {
  const users = await get(
    `https://projectsapi.zoho.com/api/v3.1/portal/${process.env.ZOHO_PORTAL_ID}/users?type=portal_user&view_type=active&page=1&per_page=1`,
    tok.access_token
  );
  console.log(`Projects users  ${users.status}  ${users.body.slice(0, 200)}`);
}

if (ZOHO_DESK_ORG_ID) {
  const desk = await get("https://desk.zoho.com/api/v1/departments?limit=1", tok.access_token, {
    orgId: ZOHO_DESK_ORG_ID,
  });
  console.log(`\nDesk      ${desk.status}  ${desk.body.slice(0, 300)}`);
} else {
  console.log("\nDesk      skipped (ZOHO_DESK_ORG_ID unset)");
}
