import { NextResponse } from "next/server";

// Zoho sync — implemented in Sprints 2 & 4 (M7)
export async function POST() {
  return NextResponse.json({ message: "Zoho sync — Sprints 2 & 4" }, { status: 501 });
}
