import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

/**
 * POST /api/auth/force-logout
 *
 * Admin-only endpoint. Force-logouts all users except the one specified
 * in the `excludeUserId` field. Deletes all sessions and refresh tokens
 * from Supabase Auth for non-exempt users, causing their next request
 * to fail JWT validation via getClaims().
 *
 * Body: { excludeUserId: string } — UUID of the user to keep signed in
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate the caller
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();

    if (!claimsData?.claims) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const callerUserId = claimsData.claims.sub;

    // 2. Verify admin role
    const { data: profile } = await supabase
      .from("hub_users")
      .select("role")
      .eq("id", callerUserId)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden — admin role required" },
        { status: 403 }
      );
    }

    // 3. Parse the request body
    const body = await request.json();
    const { excludeUserId } = body;

    if (!excludeUserId || typeof excludeUserId !== "string") {
      return NextResponse.json(
        { error: "excludeUserId (UUID string) is required" },
        { status: 400 }
      );
    }

    // 4. Call the force_logout_all_except Postgres function
    const { data, error } = await adminClient.rpc("force_logout_all_except", {
      exclude_user_id: excludeUserId,
    });

    if (error) {
      console.error("POST /api/auth/force-logout rpc error:", error);
      return NextResponse.json(
        { error: "Failed to execute force logout" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      excludeUserId,
      details: data,
    });
  } catch (err) {
    console.error("POST /api/auth/force-logout unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
