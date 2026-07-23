"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import type { DotLottie } from "@lottiefiles/dotlottie-react";
import { ThemeToggle } from "@/components/auth/theme-toggle";

const AuthLottie = dynamic(
  () => import("@/components/auth/auth-lottie").then((m) => m.AuthLottie),
  { ssr: false }
);

interface AuthSplitShellProps {
  title: string;
  subtitle: string;
  headingIcon?: React.ReactNode;
  children: React.ReactNode;
}

export function AuthSplitShell({ title, subtitle, headingIcon, children }: AuthSplitShellProps) {
  const [dotLottie, setDotLottie] = useState<DotLottie | null>(null);

  return (
    <div className="min-h-dvh w-full bg-background lg:flex lg:overflow-hidden">
      <ThemeToggle />

      {/* ── Hero (Lottie) column — a flex sibling of the form column (not absolutely
          positioned) so the two always split exactly 50/50 with no subpixel gap or
          overlap. Its wrapper background matches the form's, so the hero box's own
          bottom-right corner radius reveals light instead of dark there — the lower
          half of the "S" divider. ── */}
      <div className="hidden lg:block lg:w-1/2 lg:shrink-0 lg:bg-background">
        <div className="relative flex h-full items-center justify-center rounded-br-[clamp(80px,12vw,220px)] p-10 bg-[#07111f]">
          <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-auth-blue/25 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-auth-navy blur-3xl pointer-events-none" />
          <motion.div
            className="relative z-10 w-full max-w-2xl aspect-square"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            onAnimationComplete={() => dotLottie?.resize()}
          >
            <AuthLottie dotLottieRefCallback={setDotLottie} />
          </motion.div>
        </div>
      </div>

      {/* ── Form column — wrapper background matches the hero's dark color, so the
          form box's remaining top-left corner radius (bottom-left removed) reveals
          dark instead of light there — the upper half of the "S" divider. ── */}
      <div className="relative flex min-h-dvh flex-col lg:h-auto lg:min-h-0 lg:w-1/2 lg:shrink-0 lg:bg-[#07111f]">
        {/* Mirrors the hero panel's top glow so it reads as continuous across the seam
            instead of stopping abruptly at the boundary; only visible through the form
            box's top-left corner cutout below. */}
        {/* <div className="hidden lg:block lg:absolute lg:-top-24 lg:h-72 lg:w-72 lg:bg-radial-[at_0%_0%] lg:from-[#0f284f] lg:to-[#112952] lg:to-75% lg:pointer-events-none" /> */}
        <div className="relative flex flex-1 flex-col lg:h-full lg:items-center lg:justify-center lg:rounded-tl-[clamp(80px,12vw,220px)] lg:bg-background lg:px-12 lg:py-12">

          {/* Mobile: gradient header */}
          <div className="relative lg:hidden overflow-hidden px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-16 text-white bg-[linear-gradient(140deg,#07111f_0%,#0c1b38_55%,#070E1F_100%)]">
            <div className="absolute -top-24 -right-16 h-64 w-64 rounded-full bg-auth-blue/25 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-auth-navy blur-3xl pointer-events-none" />
            <Link href="/" className="relative z-10 -ml-1.5 inline-flex items-center gap-2 font-semibold tracking-tight">
              <Image src="/logo.png" alt="WebriQ" width={36} height={36} className="h-9 w-9 object-contain" />
              <span className="text-base font-heading">WebriQ <span className="text-auth-blue">Central Hub</span></span>
            </Link>
            <div className="relative z-10 mt-8 space-y-2">
              <h1 className="text-3xl font-heading font-bold tracking-tight">{title}</h1>
              <p className="text-white/60 text-sm">{subtitle}</p>
            </div>
          </div>

          {/* Form card — slides over mobile header, flat on desktop */}
          <motion.div
            className="relative z-10 -mt-10 flex-1 rounded-t-3xl bg-background px-6 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-[0_-24px_40px_-16px_rgba(0,0,0,0.5)] lg:mt-0 lg:flex-initial lg:w-full lg:max-w-sm lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.15 }}
          >

            {/* Mobile drag handle */}
            <div className="lg:hidden mx-auto mb-6 h-1.5 w-10 rounded-full bg-muted" />

            {/* Desktop heading */}
            <div className="hidden lg:block mb-8 space-y-6">
              <Link href="/" className="-ml-1.5 inline-flex items-center gap-2.5 font-semibold tracking-tight text-foreground">
                <Image src="/logo.png" alt="WebriQ" width={36} height={36} className="h-9 w-9 object-contain" />
                <span className="text-base font-heading">WebriQ <span className="text-auth-blue">Central Hub</span></span>
              </Link>
              <div className="space-y-2">
                {headingIcon}
                <h1 className="text-4xl font-heading font-bold tracking-tight text-foreground">{title}</h1>
                <p className="text-muted-foreground">{subtitle}</p>
              </div>
            </div>

            {children}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
