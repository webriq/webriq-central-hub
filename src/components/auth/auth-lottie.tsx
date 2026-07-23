"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import type { DotLottie } from "@lottiefiles/dotlottie-react";

interface AuthLottieProps {
  dotLottieRefCallback?: (instance: DotLottie | null) => void;
}

export function AuthLottie({ dotLottieRefCallback }: AuthLottieProps) {
  return (
    <DotLottieReact
      src="/assets/team-work.lottie"
      loop
      autoplay
      className="w-full h-full"
      dotLottieRefCallback={dotLottieRefCallback}
    />
  );
}
