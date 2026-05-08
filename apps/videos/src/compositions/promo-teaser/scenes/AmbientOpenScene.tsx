import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { GradientBlob } from "@/components/GradientBlob";

const BLOBS = [
  {
    color: "#f59e0b",
    radius: 200,
    cx: 300,
    cy: 400,
    a: 1,
    b: 2,
    phaseX: 0,
    phaseY: 0,
    amplitudeX: 60,
    amplitudeY: 40,
  },
  {
    color: "#f97316",
    radius: 150,
    cx: 750,
    cy: 250,
    a: 2,
    b: 1,
    phaseX: 1.2,
    phaseY: 0.8,
    amplitudeX: 50,
    amplitudeY: 60,
  },
  {
    color: "#d97706",
    radius: 180,
    cx: 540,
    cy: 700,
    a: 1,
    b: 1,
    phaseX: 2.4,
    phaseY: 1.6,
    amplitudeX: 70,
    amplitudeY: 50,
  },
];

export const AmbientOpenScene: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      {BLOBS.map((blob, i) => (
        <GradientBlob key={`ambient-${i}`} config={blob} duration={600} />
      ))}
    </AbsoluteFill>
  );
};
