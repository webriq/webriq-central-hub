export default function AuroraBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
      {/* Orb 1 — sky blue */}
      <div
        className="absolute w-[700px] h-[700px] rounded-full opacity-[0.15] blur-[120px]"
        style={{
          background: "oklch(0.75 0.18 215)",
          top: "-15%",
          left: "20%",
          animation: "aurora-drift-1 22s ease-in-out infinite",
        }}
      />
      {/* Orb 2 — indigo */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full opacity-[0.12] blur-[100px]"
        style={{
          background: "oklch(0.70 0.20 280)",
          top: "10%",
          right: "5%",
          animation: "aurora-drift-2 28s ease-in-out infinite",
        }}
      />
      {/* Orb 3 — violet */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full opacity-[0.10] blur-[130px]"
        style={{
          background: "oklch(0.72 0.20 300)",
          bottom: "0%",
          left: "5%",
          animation: "aurora-drift-3 34s ease-in-out infinite",
        }}
      />
      {/* Orb 4 — teal */}
      <div
        className="absolute w-[400px] h-[400px] rounded-full opacity-[0.09] blur-[110px]"
        style={{
          background: "oklch(0.68 0.18 165)",
          bottom: "20%",
          right: "25%",
          animation: "aurora-drift-4 26s ease-in-out infinite",
        }}
      />
    </div>
  );
}
