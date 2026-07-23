"use client";

import { Check } from "lucide-react";
import { getPasswordStrength, STRENGTH_META } from "@/lib/auth/password-strength";

export function PasswordStrength({ password }: { password: string }) {
  const strength = getPasswordStrength(password);
  if (strength === null) return null;
  const { label, filled, bar, text } = STRENGTH_META[strength];
  return (
    <div className="mt-2 space-y-1.5">
      <div className="grid grid-cols-4 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i < filled ? bar : "bg-border"}`} />
        ))}
      </div>
      <p className={`flex items-center gap-1 text-xs font-medium ${text}`}>
        <Check className="h-3 w-3" aria-hidden />
        {label}
      </p>
    </div>
  );
}
