"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

interface PasswordInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder: string;
  headerAction?: React.ReactNode;
  hint?: React.ReactNode;
}

export function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  headerAction,
  hint,
}: PasswordInputProps) {
  const [show, setShow] = useState(false);

  const field = (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        required
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="peer flex w-full h-12 rounded-md border border-input bg-transparent pl-11 pr-10 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-auth-blue focus-visible:ring-offset-2"
      />
      {/* Must follow the input in DOM order — Tailwind's peer-focus (CSS `~`) only matches
          siblings that come after .peer; absolute positioning keeps it visually on the left. */}
      <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground peer-focus:text-auth-blue transition-colors" aria-hidden />
      <button
        type="button"
        aria-label={show ? "Hide password" : "Show password"}
        onClick={() => setShow((v) => !v)}
        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );

  if (headerAction) {
    // Grid keeps headerAction visually on the label's row (top-right) while placing it last
    // in DOM order, so Tab moves email → password input → eye toggle → headerAction, never
    // landing on headerAction (e.g. "Forgot password?") before the password field itself.
    return (
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1.5">
        <label htmlFor={id} className="col-start-1 row-start-1 text-xs font-semibold leading-none text-foreground">
          {label}
        </label>
        <div className="col-span-2 row-start-2">{field}</div>
        <div className="col-start-2 row-start-1 justify-self-end">{headerAction}</div>
        {hint && <div className="col-span-2 row-start-3">{hint}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-semibold leading-none text-foreground">
        {label}
      </label>
      {field}
      {hint}
    </div>
  );
}
