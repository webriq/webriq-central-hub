"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";

const THEME_KEY = "auth-theme";
let listeners: Array<() => void> = [];

function subscribe(onChange: () => void) {
  listeners.push(onChange);
  return () => {
    listeners = listeners.filter((l) => l !== onChange);
  };
}

function getSnapshot() {
  return localStorage.getItem(THEME_KEY) !== "light";
}

// SSR-safe default: server and client both start dark, eliminating hydration mismatch.
function getServerSnapshot() {
  return true;
}

function setDarkTheme(next: boolean) {
  localStorage.setItem(THEME_KEY, next ? "dark" : "light");
  listeners.forEach((l) => l());
}

export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  function toggle() {
    setDarkTheme(!isDark);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="fixed z-50 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-lg cursor-pointer transition-all duration-200 hover:border-auth-blue/50 hover:scale-105
        top-4 right-4
        lg:top-auto lg:bottom-6 lg:right-6"
    >
      {isDark
        ? <Sun className="h-[1.1rem] w-[1.1rem] text-auth-blue" aria-hidden />
        : <Moon className="h-[1.1rem] w-[1.1rem] text-auth-blue" aria-hidden />
      }
    </button>
  );
}
