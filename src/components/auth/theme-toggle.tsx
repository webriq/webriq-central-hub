"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("auth-theme");
    const dark = stored !== "light";
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("auth-theme", next ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="fixed z-50 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-lg cursor-pointer transition-all duration-200 hover:border-brand-orange/50 hover:scale-105
        top-4 right-4
        lg:top-auto lg:bottom-6 lg:right-6"
    >
      {isDark
        ? <Sun className="h-[1.1rem] w-[1.1rem] text-brand-orange" aria-hidden />
        : <Moon className="h-[1.1rem] w-[1.1rem] text-brand-orange" aria-hidden />
      }
    </button>
  );
}
