import type React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLOR } from "@/lib/colors";
import { FONT } from "@/lib/fonts";
import { SPRING } from "@/lib/motion";

export const FeaturePill: React.FC<{
  label: string;
  enterFrame: number;
  targetX: number;
  targetY: number;
  fromDirection?: "left" | "right" | "top" | "bottom";
}> = ({ label, enterFrame, targetX, targetY, fromDirection = "left" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - enterFrame,
    fps,
    config: SPRING.popIn,
  });

  const offscreen = {
    left: { x: -300, y: targetY },
    right: { x: 1400, y: targetY },
    top: { x: targetX, y: -100 },
    bottom: { x: targetX, y: 1200 },
  }[fromDirection];

  const x = interpolate(progress, [0, 1], [offscreen.x, targetX]);
  const y = interpolate(progress, [0, 1], [offscreen.y, targetY]);
  const scale = interpolate(progress, [0, 1], [0.8, 1]);

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `scale(${scale})`,
        padding: "8px 18px",
        borderRadius: 8,
        backgroundColor: `${COLOR.accent}26`,
        border: `1px solid ${COLOR.accent}40`,
        color: "white",
        fontFamily: FONT.body,
        fontWeight: 600,
        fontSize: 16,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </div>
  );
};
