import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { NumberPunch } from "@/components/NumberPunch";
import { COLOR } from "@/lib/colors";

const PUNCHES = [
  { number: "49", descriptor: "tools", frame: 0, size: 120, shake: 2 },
  { number: "15", descriptor: "AI models", frame: 37, size: 120, shake: 2 },
  { number: "55+", descriptor: "formats", frame: 74, size: 120, shake: 2 },
  { number: "1", descriptor: "container", frame: 111, size: 144, shake: 3 },
];

export const NumberPunchScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      {PUNCHES.map((p, i) => {
        const visible = frame >= p.frame && frame < p.frame + 37;
        const flashStart = p.frame - 2;
        const flashOpacity =
          i > 0 && frame >= flashStart && frame < flashStart + 2
            ? interpolate(frame, [flashStart, flashStart + 2], [1, 0])
            : 0;

        return (
          <AbsoluteFill key={p.number} style={{ justifyContent: "center", alignItems: "center" }}>
            {i > 0 && (
              <AbsoluteFill style={{ backgroundColor: COLOR.dark, opacity: flashOpacity }} />
            )}
            {visible && (
              <NumberPunch
                number={p.number}
                descriptor={p.descriptor}
                enterFrame={p.frame}
                numberSize={p.size}
                shakeIntensity={p.shake}
              />
            )}
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};
