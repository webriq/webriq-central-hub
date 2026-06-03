const ROLE_RULES: { prefix: string; allowed: string[] }[] = [
  { prefix: "/dashboard/customers",  allowed: ["pm", "admin"] },
  { prefix: "/dashboard/pipeline",   allowed: ["pm", "admin"] },
  { prefix: "/dashboard/chat",       allowed: ["pm", "admin"] },
  { prefix: "/dashboard/timelogs",   allowed: ["dev", "admin"] },
  { prefix: "/dashboard/settings",   allowed: ["pm", "dev", "admin"] },
  { prefix: "/orchestration",        allowed: ["pm", "admin"] },
  { prefix: "/dashboard/users",      allowed: ["admin"] },
  { prefix: "/admin",                allowed: ["admin"] },
];

export function isRouteAllowed(pathname: string, role: string | null): boolean {
  if (!role || role === "pending") return false;
  for (const rule of ROLE_RULES) {
    if (pathname === rule.prefix || pathname.startsWith(rule.prefix + "/")) {
      return rule.allowed.includes(role);
    }
  }
  return true;
}
