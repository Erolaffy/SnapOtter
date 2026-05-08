import type React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLOR } from "@/lib/colors";
import { TEXT } from "@/lib/fonts";
import { SPRING } from "@/lib/motion";

export const NumberPunch: React.FC<{
  number: string;
  descriptor: string;
  enterFrame: number;
  numberSize?: number;
  shakeIntensity?: number;
}> = ({ number, descriptor, enterFrame, numberSize = 120, shakeIntensity = 2 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const elapsed = frame - enterFrame;
  const scaleSpring = spring({ frame: elapsed, fps, config: SPRING.settle });
  const scale = interpolate(scaleSpring, [0, 1], [1.5, 1]);

  const shakeDecay = interpolate(elapsed, [0, 12], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shakeX = Math.sin(elapsed * 3) * shakeIntensity * shakeDecay;
  const shakeY = Math.cos(elapsed * 4) * shakeIntensity * shakeDecay;

  const descOpacity = interpolate(elapsed, [8, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const numberOpacity = interpolate(elapsed, [0, 4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "center",
        gap: 20,
        transform: `translate(${shakeX}px, ${shakeY}px)`,
      }}
    >
      <span
        style={{
          ...TEXT.counter,
          fontSize: numberSize,
          transform: `scale(${scale})`,
          opacity: numberOpacity,
          display: "inline-block",
        }}
      >
        {number}
      </span>
      <span
        style={{
          fontFamily: TEXT.heroSub.fontFamily,
          fontWeight: 500,
          fontSize: 36,
          color: COLOR.accent,
          opacity: descOpacity,
        }}
      >
        {descriptor}
      </span>
    </div>
  );
};
