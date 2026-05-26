export default function AuroraBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
      {/* Orb 1 — sky blue */}
      <div
        className="absolute w-175 h-175 rounded-full opacity-[0.15] blur-[120px] top-[-15%] left-[20%] animate-aurora-1 bg-[oklch(0.75_0.18_215)]"
      />
      {/* Orb 2 — indigo */}
      <div
        className="absolute w-150 h-150 rounded-full opacity-[0.12] blur-[100px] top-[10%] right-[5%] animate-aurora-2 bg-[oklch(0.70_0.20_280)]"
      />
      {/* Orb 3 — violet */}
      <div
        className="absolute w-125 h-125 rounded-full opacity-[0.10] blur-[130px] bottom-0 left-[5%] animate-aurora-3 bg-[oklch(0.72_0.20_300)]"
      />
      {/* Orb 4 — teal */}
      <div
        className="absolute w-100 h-100 rounded-full opacity-[0.09] blur-[110px] bottom-[20%] right-[25%] animate-aurora-4 bg-[oklch(0.68_0.18_165)]"
      />
    </div>
  );
}
