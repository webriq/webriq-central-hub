"use server";

import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function approveHubUser(path: string, formData: FormData) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return;

  const { data: caller } = await supabase
    .from("hub_users")
    .select("role")
    .eq("id", claims.claims.sub)
    .single();
  if (caller?.role !== "admin") return;

  const userId = formData.get("userId") as string;
  const role = formData.get("role") as string;
  if (!userId || !["admin", "pm", "dev"].includes(role)) return;

  await adminClient.from("hub_users").update({ role }).eq("id", userId);
  revalidatePath(path);
}
