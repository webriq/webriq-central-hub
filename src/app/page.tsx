"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  LayoutDashboard,
  Code2,
  UserPlus,
  ScanSearch,
  Bot,
  BookOpen,
  ArrowRight,
  Zap,
  Activity,
  Layers,
} from "lucide-react";
import AuroraBackground from "@/components/hub/aurora-background";
import { ROUTES } from "@/config/constants";

const modules = [
  {
    href: ROUTES.DASHBOARD,
    title: "PM Dashboard",
    description: "Tasks, tickets, daily digest, Zoho sync",
    icon: LayoutDashboard,
    sprint: "Sprints 1–4",
    accent: "sky",
    size: "lg",
  },
  {
    href: ROUTES.ORCHESTRATION,
    title: "AI Orchestration",
    description: "Assessment → Plan → Execute → Reply pipeline",
    icon: Bot,
    sprint: "Sprints 3–5",
    accent: "violet",
    size: "lg",
  },
  {
    href: ROUTES.CUSTOMERS_ONBOARD,
    title: "Onboarding",
    description: "Customer creation, dynamic forms, progress tracking",
    icon: UserPlus,
    sprint: "Sprint 1",
    accent: "teal",
    size: "sm",
  },
  {
    href: ROUTES.ORCHESTRATION,
    title: "Classification",
    description: "Zoho webhook → Haiku classification engine",
    icon: ScanSearch,
    sprint: "Sprint 2",
    accent: "amber",
    size: "sm",
  },
  {
    href: ROUTES.DASHBOARD,
    title: "Dev Dashboard",
    description: "Assigned tasks, self-assignment, time logs",
    icon: Code2,
    sprint: "Sprint 6",
    accent: "indigo",
    size: "sm",
  },
  {
    href: ROUTES.KB,
    title: "Knowledge Base",
    description: "Playbooks, internal KB, customer context",
    icon: BookOpen,
    sprint: "Sprint 6",
    accent: "rose",
    size: "sm",
  },
];

const accentMap: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  sky:    { bg: "bg-brand/10",         border: "border-brand/25",         text: "text-brand",         glow: "group-hover:shadow-brand/10" },
  violet: { bg: "bg-brand-orange/10",  border: "border-brand-orange/25",  text: "text-brand-orange",  glow: "group-hover:shadow-brand-orange/10" },
  teal:   { bg: "bg-teal-400/10",      border: "border-teal-400/20",      text: "text-teal-400",      glow: "group-hover:shadow-teal-500/10" },
  amber:  { bg: "bg-brand-orange/10",  border: "border-brand-orange/20",  text: "text-brand-orange",  glow: "group-hover:shadow-brand-orange/10" },
  indigo: { bg: "bg-brand/10",         border: "border-brand/20",         text: "text-brand",         glow: "group-hover:shadow-brand/10" },
  rose:   { bg: "bg-rose-400/10",      border: "border-rose-400/20",      text: "text-rose-400",      glow: "group-hover:shadow-rose-500/10" },
};

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function HomePage() {
  const large = modules.filter((m) => m.size === "lg");
  const small = modules.filter((m) => m.size === "sm");

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 py-16 overflow-hidden">
      <AuroraBackground />

      {/* Hero */}
      <motion.div
        className="w-full max-w-5xl text-center mb-14"
        initial={{ opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
      >
        {/* Badge */}
        <motion.div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-orange/30 bg-brand-orange/10 mb-6"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <Zap className="w-3 h-3 text-brand-orange" />
          <span className="text-xs text-brand-orange font-medium tracking-wide">Sprint 0 · Infrastructure</span>
        </motion.div>

        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-4">
          <span className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
            WebriQ
          </span>{" "}
          <span className="text-brand-orange">
            Central Hub
          </span>
        </h1>

        <p className="text-base text-white/45 max-w-lg mx-auto leading-relaxed">
          AI-powered operations platform for PMs and developers — classify, plan, and execute with confidence.
        </p>

        {/* Stat pills */}
        <div className="flex items-center justify-center gap-4 mt-8">
          {[
            { icon: Layers, label: "6 Modules" },
            { icon: Bot, label: "7 AI Layers" },
            { icon: Activity, label: "Live Logging" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.07] text-xs text-white/50"
            >
              <Icon className="w-3 h-3" />
              {label}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Bento grid */}
      <motion.div
        className="w-full max-w-5xl space-y-4"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Large cards row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {large.map((mod) => {
            const a = accentMap[mod.accent];
            const Icon = mod.icon;
            return (
              <motion.div key={mod.href} variants={item}>
                <Link
                  href={mod.href}
                  className={`group relative flex flex-col justify-between p-6 rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm overflow-hidden transition-all duration-300 hover:border-white/[0.14] hover:bg-white/[0.05] hover:shadow-xl ${a.glow}`}
                >
                  {/* Subtle gradient on hover */}
                  <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${a.bg} rounded-2xl`} />

                  <div className="relative z-10">
                    <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${a.bg} border ${a.border} mb-4`}>
                      <Icon className={`w-5 h-5 ${a.text}`} />
                    </div>
                    <h2 className="text-lg font-semibold text-white/90 mb-2">{mod.title}</h2>
                    <p className="text-sm text-white/45 leading-relaxed">{mod.description}</p>
                  </div>

                  <div className="relative z-10 flex items-center justify-between mt-6">
                    <span className={`text-xs font-medium ${a.text} opacity-60`}>{mod.sprint}</span>
                    <ArrowRight className="w-4 h-4 text-white/25 group-hover:text-white/60 group-hover:translate-x-1 transition-all duration-200" />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* Small cards row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {small.map((mod) => {
            const a = accentMap[mod.accent];
            const Icon = mod.icon;
            return (
              <motion.div key={mod.href} variants={item}>
                <Link
                  href={mod.href}
                  className={`group relative flex flex-col p-5 rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm overflow-hidden transition-all duration-300 hover:border-white/[0.14] hover:bg-white/[0.05] hover:shadow-xl ${a.glow}`}
                >
                  <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${a.bg} rounded-2xl`} />

                  <div className="relative z-10">
                    <div className={`inline-flex items-center justify-center w-9 h-9 rounded-xl ${a.bg} border ${a.border} mb-3`}>
                      <Icon className={`w-4 h-4 ${a.text}`} />
                    </div>
                    <h3 className="text-sm font-semibold text-white/85">{mod.title}</h3>
                    <p className="mt-1 text-xs text-white/40 leading-snug line-clamp-2">{mod.description}</p>
                  </div>

                  <div className="relative z-10 mt-4 flex items-center justify-between">
                    <span className={`text-[10px] font-medium ${a.text} opacity-50`}>{mod.sprint}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all duration-200" />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
