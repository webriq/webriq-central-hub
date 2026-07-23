"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmPasswordChange } from "@/app/v2/(auth)/actions";
import { AuthSplitShell } from "@/components/auth/auth-split-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { PasswordStrength } from "@/components/auth/password-strength-meter";
import { AuthErrorBanner } from "@/components/auth/auth-error-banner";
import { AuthSubmitButton } from "@/components/auth/auth-submit-button";

export default function ChangePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const result = await confirmPasswordChange(password);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    router.push("/v2/dashboard");
  }

  return (
    <AuthSplitShell title="Set your password" subtitle="Choose a new password to secure your account.">
      <form onSubmit={handleSubmit} className="space-y-5">

        <PasswordInput
          id="password"
          label="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          hint={<PasswordStrength password={password} />}
        />

        <PasswordInput
          id="confirmPassword"
          label="Confirm password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          placeholder="Repeat your password"
        />

        <AuthErrorBanner message={error} />

        <AuthSubmitButton loading={loading} loadingLabel="Saving…" label="Set password" />
      </form>
    </AuthSplitShell>
  );
}
