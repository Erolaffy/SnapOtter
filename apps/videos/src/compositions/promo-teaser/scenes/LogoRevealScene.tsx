import type React from "react";
import { AbsoluteFill } from "remotion";
import { LogoReveal } from "@/components/LogoReveal";

export const LogoRevealScene: React.FC = () => {
  return (
    <AbsoluteFill>
      <LogoReveal
        convergeFrame={0}
        burstFrame={30}
        logoFrame={30}
        textFrame={50}
        taglineFrame={70}
        logoSize={80}
      />
    </AbsoluteFill>
  );
};
