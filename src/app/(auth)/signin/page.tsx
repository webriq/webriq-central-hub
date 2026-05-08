"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

const fieldCls = "w-full font-[inherit] text-sm px-4 py-3 rounded-lg text-white placeholder:text-white/30 outline-none transition-[border-color,box-shadow] duration-200 focus:border-brand focus:shadow-[0_0_0_3px_rgba(51,88,244,0.2)]";
const fieldStyle = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" };
const labelCls = "block text-sm font-medium text-white/70 mb-1.5";

export default function SignInPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "oauth_failed" ? "Zoho sign-in failed. Please try again." : null
  );
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function handleZohoSignIn() {
    const redirectTo = `${window.location.origin}/callback`;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    window.location.href = `${supabaseUrl}/auth/v1/authorize?provider=custom%3Azoho&redirect_to=${encodeURIComponent(redirectTo)}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!email || !password) {
      setError("Email and password are required.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push("/hub");
    router.refresh();
  }

  return (
    <div
      className="rounded-2xl p-8 overflow-hidden relative"
      style={{ background: "#0F1829", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      {/* Orange top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl" style={{ background: "linear-gradient(90deg, transparent, #F97316 40%, #F97316 60%, transparent)" }} />
      <div className="text-center mb-7">
        <h1 className="text-2xl font-bold text-white mb-1.5">Sign In</h1>
        <p className="text-sm text-white/50">Access the hub with your Zoho account or email.</p>
      </div>

      {/* Zoho SSO */}
      <button
        type="button"
        onClick={handleZohoSignIn}
        className="w-full font-[inherit] py-3 px-4 text-sm font-semibold text-white rounded-lg cursor-pointer transition-opacity hover:opacity-80 mb-5 flex items-center justify-center gap-2.5"
        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
      >
        <Image src="/zoho-logo-512.png" alt="Zoho" width={60} height={60} className="flex-shrink-0" />
        Sign in with Zoho
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
        <span className="text-xs text-white/30 font-semibold tracking-widest uppercase">or</span>
        <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
      </div>

      {/* Email/password form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className={labelCls}>Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldCls}
            style={fieldStyle}
          />
        </div>

        <div>
          <label htmlFor="password" className={labelCls}>Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldCls}
            style={fieldStyle}
          />
        </div>

        {error && (
          <div className="rounded-lg px-4 py-2.5 text-sm text-red-400" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full font-[inherit] py-3 px-4 bg-brand-orange text-white text-sm font-bold rounded-lg cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-60 border-none mt-1"
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>

        <p className="text-center text-sm text-white/40 pt-1">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-brand-orange hover:opacity-80">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}
