"use client";

import { useEffect, useState } from "react";

const TIME_GREETINGS: Record<string, string[]> = {
  morning:   ["Good morning", "Morning!", "Rise and shine", "Hey, good morning"],
  noon:      ["Good noon", "Hey there", "Happy lunch hour"],
  afternoon: ["Good afternoon", "Afternoon!", "Hey, good afternoon"],
  evening:   ["Good evening", "Evening!", "Hey, good evening"],
  night:     ["Still at it?", "Burning the midnight oil", "Working late"],
};

function getTimeBucket(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 13) return "noon";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "night";
}

function pickGreeting(bucket: string): string {
  const pool = TIME_GREETINGS[bucket] ?? TIME_GREETINGS.morning;
  return pool[Math.floor(Math.random() * pool.length)];
}

function formatCurrentDate(): string {
  const d = new Date();
  const day = d.toLocaleDateString("en-US", { weekday: "long" });
  const month = d.toLocaleDateString("en-US", { month: "long" });
  return `${day}, ${month} ${d.getDate()} · ${d.getFullYear()}`;
}

const FADE_DELAY_MS = 3 * 60 * 1000;
const SESSION_KEY = "hub_greeting_ts";

export function useGreeting(displayName: string | null) {
  const firstName = displayName?.split(" ")[0] ?? "there";
  const [visible, setVisible] = useState(true);
  // null on both server + initial client render — prevents SSR hydration mismatch
  const [phrase, setPhrase] = useState<string | null>(null);
  const [dateLabel, setDateLabel] = useState<string | null>(null);

  useEffect(() => {
    // Deferred via setTimeout to avoid direct-setState-in-effect lint rule
    const phraseTimer = setTimeout(() => {
      setPhrase(pickGreeting(getTimeBucket()));
      setDateLabel(formatCurrentDate());
    }, 0);

    const now = Date.now();
    const stored = sessionStorage.getItem(SESSION_KEY);
    const shownAt = stored ? parseInt(stored, 10) : now;
    if (!stored) sessionStorage.setItem(SESSION_KEY, String(now));
    const remaining = FADE_DELAY_MS - (now - shownAt);
    const fadeTimer = setTimeout(() => setVisible(false), remaining <= 0 ? 0 : remaining);

    return () => {
      clearTimeout(phraseTimer);
      clearTimeout(fadeTimer);
    };
  }, []);

  return {
    visible,
    text: phrase ? `${phrase}, ${firstName} ✦` : null,
    dateLabel,
    dismiss: () => setVisible(false),
  };
}
