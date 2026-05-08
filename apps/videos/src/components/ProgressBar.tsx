import type React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE } from "@/lib/motion";

export const ProgressBar: React.FC<{
  startFrame: number;
  duration: number;
  width?: number;
  height?: number;
  color?: string;
  bgColor?: string;
  style?: React.CSSProperties;
}> = ({
  startFrame,
  duration,
  width = 200,
  height = 6,
  color = "#3b82f6",
  bgColor = "rgba(255,255,255,0.1)",
  style,
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [startFrame, startFrame + duration], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE.smooth,
  });

  return (
    <div
      style={{
        width,
        height,
        borderRadius: height / 2,
        backgroundColor: bgColor,
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          width: `${progress}%`,
          height: "100%",
          borderRadius: height / 2,
          backgroundColor: color,
        }}
      />
    </div>
  );
};
