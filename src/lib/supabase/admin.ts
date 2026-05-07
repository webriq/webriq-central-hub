import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Server-only — service role bypasses RLS. Never expose to the client.
if (typeof window !== "undefined") {
  throw new Error("supabase/admin must not be imported in client components");
}

export const adminClient = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
