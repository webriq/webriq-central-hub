import type { Metadata, Viewport } from "next";
import { Sora, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const sora = Sora({ subsets: ["latin"], variable: "--font-sans", weight: ["300","400","500","600","700","800"] });

const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "WebriQ Central Hub",
  description: "Internal operations platform for PMs and Developers",
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
    <html lang="en" className={cn("h-full dark", sora.variable, geistMono.variable)}>
      <body className={cn("font-sans noise-overlay min-h-full bg-background text-foreground antialiased")}>
        {children}
      </body>
    </html>
  );
}
