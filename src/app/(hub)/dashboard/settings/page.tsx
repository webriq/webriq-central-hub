import { redirect } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";

// Task 476 — Settings moved to /settings; old links and bookmarks keep working.
export default function OldSettingsRedirect() {
  redirect(V2_ROUTES.SETTINGS);
}
