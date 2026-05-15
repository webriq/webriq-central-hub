import { NextResponse } from "next/server";

/**
 * Proxy Zoho /oauth/user/info through the Next.js server to avoid
 * browser CORS restrictions. The client calls /api/zoho/user-info
 * (same-origin), and this handler forwards the request server-side.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader) {
    return NextResponse.json(
      { error: "Missing Authorization header" },
      { status: 401 },
    );
  }

  try {
    const zohoRes = await fetch("https://accounts.zoho.com/oauth/user/info", {
      headers: { Authorization: authHeader },
    });

    const data = await zohoRes.json();

    return NextResponse.json(data, {
      status: zohoRes.ok ? 200 : zohoRes.status,
    });
  } catch (err) {
    console.error("[api/zoho/user-info] proxy error:", err);
    return NextResponse.json(
      { error: "Failed to fetch Zoho profile" },
      { status: 502 },
    );
  }
}
