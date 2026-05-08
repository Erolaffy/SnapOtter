import type React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLOR } from "@/lib/colors";
import { EASE } from "@/lib/motion";

export const BeforeAfter: React.FC<{
  before: React.ReactNode;
  after: React.ReactNode;
  scanStartFrame: number;
  scanDuration: number;
  width: number;
  height: number;
  style?: React.CSSProperties;
}> = ({ before, after, scanStartFrame, scanDuration, width, height, style }) => {
  const frame = useCurrentFrame();

  const scanProgress = interpolate(
    frame,
    [scanStartFrame, scanStartFrame + scanDuration],
    [0, 100],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE.smooth },
  );

  const scanX = (scanProgress / 100) * width;

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        overflow: "hidden",
        borderRadius: 8,
        ...style,
      }}
    >
      <div style={{ position: "absolute", inset: 0 }}>{before}</div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          clipPath: `inset(0 ${100 - scanProgress}% 0 0)`,
        }}
      >
        {after}
      </div>

      {scanProgress > 0 && scanProgress < 100 && (
        <div
          style={{
            position: "absolute",
            left: scanX,
            top: 0,
            width: 2,
            height: "100%",
            backgroundColor: COLOR.accent,
            boxShadow: `0 0 20px ${COLOR.accent}80`,
            zIndex: 10,
          }}
        />
      )}
    </div>
  );
};
