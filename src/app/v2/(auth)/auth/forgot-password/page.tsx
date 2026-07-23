"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, ArrowRight } from "lucide-react";
import { requestPasswordReset } from "@/app/v2/(auth)/actions";
import { AuthSplitShell } from "@/components/auth/auth-split-shell";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    await requestPasswordReset(email.trim());
    router.push(`/v2/auth/verify?purpose=reset&email=${encodeURIComponent(email.trim())}`);
  }

  return (
    <AuthSplitShell
      title="Forgot your password?"
      subtitle="Enter your account email and we'll send you a 6-digit reset code."
    >
      <form onSubmit={handleSubmit} className="space-y-5">

        <div className="space-y-3">
          <label htmlFor="email" className="text-xs font-semibold leading-none text-foreground">
            Email
          </label>
          <div className="relative">
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="peer flex w-full h-12 rounded-md border border-input bg-transparent pl-11 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-auth-blue focus-visible:ring-offset-2"
            />
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground peer-focus:text-auth-blue transition-colors" aria-hidden />
          </div>
        </div>

        <AuthSubmitButton loading={loading} loadingLabel="Sending…" label="Send reset code" />
      </form>

      <Link
        href="/v2/auth/login"
        className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-auth-blue-700 hover:text-auth-blue transition-colors"
      >
        <ArrowRight className="h-4 w-4 rotate-180" aria-hidden />
        Back to login
      </Link>
    </AuthSplitShell>
  );
}
