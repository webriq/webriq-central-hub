import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";

// Scoped to the Onboarding module only (New Project wizard + project detail timeline) — mirrors the
// _design mockups' exact font stack. Rest of the v2 hub stays on Sora/Geist Mono (src/app/layout.tsx).
export const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
});

export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-wizard-inter",
});

export const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-wizard-mono",
});
