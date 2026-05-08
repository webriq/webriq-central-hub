import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ background: "#070E1F" }}
    >
      {/* Subtle orange + blue ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full opacity-[0.07]" style={{ background: "radial-gradient(ellipse, #F97316 0%, transparent 70%)" }} />
        <div className="absolute bottom-[-5%] left-1/2 -translate-x-1/2 w-[400px] h-[200px] rounded-full opacity-[0.05]" style={{ background: "radial-gradient(ellipse, #3358F4 0%, transparent 70%)" }} />
      </div>

      {/* Logo */}
      <Link href="/" className="relative flex flex-col items-center gap-2 mb-8 no-underline">
        <Image src="/logo.png" alt="WebriQ" width={52} height={52} />
        <span className="text-[1.35rem] font-bold tracking-tight text-white">
          WebriQ{" "}
          <span className="text-brand-orange">Central Hub</span>
        </span>
      </Link>

      {/* Card */}
      <div className="relative w-full max-w-[440px]">
        <Suspense>{children}</Suspense>
      </div>
    </div>
  );
}
