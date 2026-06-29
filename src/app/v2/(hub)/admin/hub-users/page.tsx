"use client";

import { useState } from "react";
import { User, Mail, ShieldCheck, Copy, Check } from "lucide-react";
import { inviteUser } from "@/app/v2/(auth)/actions";

type Role = "pm" | "developer" | "hr" | "admin";

const ROLES: { value: Role; label: string }[] = [
  { value: "pm", label: "Project Manager" },
  { value: "developer", label: "Developer" },
  { value: "hr", label: "HR" },
  { value: "admin", label: "Admin" },
];

export default function HubUsersPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("pm");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ tempPassword: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    const res = await inviteUser(email, fullName, role);

    if (res.error) {
      setError(res.error);
      setLoading(false);
      return;
    }

    setResult({ tempPassword: res.tempPassword!, email });
    setFullName("");
    setEmail("");
    setRole("pm");
    setLoading(false);
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="py-8 px-8 max-w-xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Invite Hub User</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a new account and send an invitation email with a temporary password.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Full name */}
        <div className="space-y-2">
          <label htmlFor="fullName" className="text-sm font-medium leading-none text-foreground">
            Full name
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              id="fullName"
              type="text"
              required
              placeholder="Ada Lovelace"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="flex w-full h-11 rounded-md border border-input bg-background pl-10 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-orange"
            />
          </div>
        </div>

        {/* Email */}
        <div className="space-y-2">
          <label htmlFor="inviteEmail" className="text-sm font-medium leading-none text-foreground">
            Email address
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              id="inviteEmail"
              type="email"
              required
              placeholder="ada@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex w-full h-11 rounded-md border border-input bg-background pl-10 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-orange"
            />
          </div>
        </div>

        {/* Role */}
        <div className="space-y-2">
          <label htmlFor="role" className="text-sm font-medium leading-none text-foreground">
            Role
          </label>
          <div className="relative">
            <ShieldCheck className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="flex w-full h-11 rounded-md border border-input bg-background pl-10 pr-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-orange appearance-none cursor-pointer"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-lg px-4 py-2.5 text-sm text-destructive bg-destructive/10 border border-destructive/20">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center h-11 px-6 rounded-md bg-brand-orange text-white font-semibold text-sm shadow cursor-pointer hover:bg-brand-orange/90 transition-all disabled:opacity-60 disabled:pointer-events-none"
        >
          {loading ? "Sending invite…" : "Send invitation"}
        </button>
      </form>

      {/* Success result */}
      {result && (
        <div className="mt-8 rounded-lg border border-border bg-card p-5 space-y-3">
          <p className="text-sm font-medium text-foreground">
            Invitation sent to <span className="text-brand-orange">{result.email}</span>
          </p>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Temporary password (shown once):</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono tracking-wide text-foreground break-all">
                {result.tempPassword}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                aria-label="Copy password"
                className="shrink-0 flex items-center justify-center h-9 w-9 rounded-md border border-border bg-background hover:bg-muted transition-colors cursor-pointer"
              >
                {copied
                  ? <Check className="h-4 w-4 text-green-500" aria-hidden />
                  : <Copy className="h-4 w-4 text-muted-foreground" aria-hidden />
                }
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            The user will be prompted to set a new password on first login.
          </p>
        </div>
      )}
    </div>
  );
}
