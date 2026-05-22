import { NextRequest, NextResponse } from "next/server";
import { classifyTask } from "@/lib/ai/classify";
import type { WebhookSource } from "@/types/hub";

type ClassifyBody = {
  customerId: string;
  title: string;
  description?: string | null;
  source: WebhookSource;
  zoho_ticket_id?: string | null;
  zoho_task_id?: string | null;
};

export async function POST(req: NextRequest) {
  let body: ClassifyBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { customerId, title, source } = body;
  if (!customerId || !title || !source) {
    return NextResponse.json({ error: "customerId, title, and source are required" }, { status: 400 });
  }

  const record = await classifyTask(body);
  if (!record) {
    return NextResponse.json({ error: "Classification failed" }, { status: 500 });
  }

  return NextResponse.json(record, { status: 201 });
}
