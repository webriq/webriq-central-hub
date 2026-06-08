import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getZohoAccessToken } from "@/lib/zoho";

const ZOHO_PROJECTSAPI_BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "Zoho not configured" }, { status: 503 });

  const files = formData.getAll("files") as File[];
  if (!files.length) return NextResponse.json({ ok: true });

  const results = await Promise.allSettled(
    files.map(file => {
      const form = new FormData();
      form.append("file", file);
      return fetch(
        `${ZOHO_PROJECTSAPI_BASE}/projects/${projectId}/tasks/${taskId}/attachments`,
        {
          method: "POST",
          headers: { Authorization: `Zoho-oauthtoken ${token}` },
          body: form,
        }
      );
    })
  );

  const failed = results.filter(r => r.status === "rejected").length;
  return NextResponse.json({ uploaded: results.length - failed, failed });
}
