import type React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ToolPill } from "@/components/ToolPill";
import { CATEGORY_ORDER } from "@/lib/colors";
import { SPRING, TIMING } from "@/lib/motion";
import { getToolsByCategory, TOOLS } from "@/lib/tools";

export const ToolGrid: React.FC<{
  startFrame: number;
  cellWidth?: number;
  cellHeight?: number;
  gap?: number;
  style?: React.CSSProperties;
}> = ({ startFrame, cellWidth = 140, cellHeight = 32, gap = 6, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let globalIndex = 0;

  return (
    <div
      style={{
        display: "flex",
        gap: gap * 2,
        ...style,
      }}
    >
      {CATEGORY_ORDER.map((cat) => {
        const tools = getToolsByCategory(cat);
        return (
          <div key={cat} style={{ display: "flex", flexDirection: "column", gap }}>
            {tools.map((tool) => {
              const i = globalIndex++;
              const enterDelay = startFrame + i * TIMING.staggerFrames;
              const s = spring({
                frame: frame - enterDelay,
                fps,
                config: SPRING.settle,
              });

              return (
                <div
                  key={tool.name}
                  style={{
                    opacity: s,
                    transform: `translateX(${(1 - s) * 100}px) scale(${0.8 + s * 0.2})`,
                  }}
                >
                  <ToolPill
                    name={tool.name}
                    category={tool.category}
                    style={{ width: cellWidth, fontSize: 11, padding: "3px 8px" }}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
