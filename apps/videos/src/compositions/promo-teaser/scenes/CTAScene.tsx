import type React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLOR } from "@/lib/colors";
import { FONT } from "@/lib/fonts";
import { SPRING } from "@/lib/motion";

export const CTAScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pillScale = spring({ frame, fps, config: SPRING.popIn });
  const urlOpacity = interpolate(frame, [15, 25], [0, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [60, 90], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const glowOpacity = interpolate(Math.sin(frame * 0.1), [-1, 1], [0.3, 0.6]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          transform: `scale(${pillScale})`,
          padding: "14px 36px",
          borderRadius: 50,
          background: `linear-gradient(135deg, ${COLOR.accent}, ${COLOR.accentHover})`,
          boxShadow: `0 0 30px rgba(245, 158, 11, ${glowOpacity})`,
          color: "white",
          fontFamily: FONT.heading,
          fontWeight: 700,
          fontSize: 20,
        }}
      >
        Get it free
      </div>

      <div style={{ height: 16 }} />

      <span
        style={{
          fontFamily: FONT.mono,
          fontSize: 16,
          color: "white",
          opacity: urlOpacity,
        }}
      >
        snapotter.com
      </span>
    </AbsoluteFill>
  );
};
