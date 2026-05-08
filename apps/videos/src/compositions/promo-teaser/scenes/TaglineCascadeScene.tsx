import type React from "react";
import { AbsoluteFill } from "remotion";
import { RotatingTaglines } from "@/components/RotatingTaglines";

const TAGLINES = [
  "No signups.",
  "No uploads.",
  "No limits.",
  "Free forever.",
  "Open source.",
  "Fully offline.",
];

export const TaglineCascadeScene: React.FC = () => {
  return (
    <AbsoluteFill>
      <RotatingTaglines
        lines={TAGLINES}
        startFrame={0}
        framesPerLine={25}
        fontSize={40}
        color="white"
      />
    </AbsoluteFill>
  );
};
