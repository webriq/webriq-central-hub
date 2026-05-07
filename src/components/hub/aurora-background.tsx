export default function AuroraBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
      {/* Orb 1 — sky blue */}
      <div
        className="absolute w-[700px] h-[700px] rounded-full opacity-[0.15] blur-[120px] -top-[15%] left-[20%] animate-aurora-1"
        style={{ background: "oklch(0.75 0.18 215)" }}
      />
      {/* Orb 2 — indigo */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full opacity-[0.12] blur-[100px] top-[10%] right-[5%] animate-aurora-2"
        style={{ background: "oklch(0.70 0.20 280)" }}
      />
      {/* Orb 3 — violet */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full opacity-[0.10] blur-[130px] bottom-0 left-[5%] animate-aurora-3"
        style={{ background: "oklch(0.72 0.20 300)" }}
      />
      {/* Orb 4 — teal */}
      <div
        className="absolute w-[400px] h-[400px] rounded-full opacity-[0.09] blur-[110px] bottom-[20%] right-[25%] animate-aurora-4"
        style={{ background: "oklch(0.68 0.18 165)" }}
      />
    </div>
  );
}
