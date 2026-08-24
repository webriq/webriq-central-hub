import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

// Inter carries the body-wide default (labels, section titles, descriptions, pills) — the
// "balancer" font. Space Grotesk is an opt-in accent (`font-heading`) reserved for page
// titles and KPI numbers only; trimmed to the 2 weights those roles actually use.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", weight: ["400","500","600","700"] });

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", weight: ["600","700"] });

const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: {
    default: "WebriQ Central Hub",
    template: "%s | WebriQ Central Hub",
  },
  description:
    "Internal operations platform for PMs and developers — synthesizes Zoho, Sanity, GitHub, and Supabase into a single AI-powered operational layer for customer onboarding, project and task tracking, requirements assessment, and developer time tracking.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Hub",
  },
};

export const viewport: Viewport = {
  themeColor: "#0F172A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("h-full dark", inter.variable, spaceGrotesk.variable, jetbrainsMono.variable)}>
      <body className={cn("font-sans noise-overlay min-h-full bg-background text-foreground antialiased")}>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
