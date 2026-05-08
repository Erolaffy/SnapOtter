import { Trail } from "@remotion/motion-blur";
import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ClipReveal } from "@/components/ClipReveal";
import { GrainOverlay } from "@/components/GrainOverlay";
import { ToolPill } from "@/components/ToolPill";
import { CATEGORY_LABELS, CATEGORY_ORDER, COLOR } from "@/lib/colors";
import { TEXT } from "@/lib/fonts";
import { EASE, SPRING } from "@/lib/motion";
import { getToolsByCategory } from "@/lib/tools";

/* ------------------------------------------------------------------ */
/*  Grid layout constants (from spec)                                  */
/* ------------------------------------------------------------------ */

const COLS = 8;
const ROWS = 6;
const CELL_W = 190;
const CELL_H = 44;
const GAP = 8;
const GRID_W = COLS * CELL_W + (COLS - 1) * GAP; // 1576
const GRID_H = ROWS * CELL_H + (ROWS - 1) * GAP; // 304
const GRID_X = (1920 - GRID_W) / 2;
const GRID_Y = (1080 - GRID_H) / 2 + 40;

const CX = 1920 / 2;
const CY = 1080 / 2;
const FRAMES_PER_TOOL = 10;

/* ------------------------------------------------------------------ */
/*  Pre-compute tool order and grid positions                          */
/* ------------------------------------------------------------------ */

interface ToolEntry {
  index: number;
  name: string;
  category: string;
  col: number;
  row: number;
  gridX: number;
  gridY: number;
}

const TOOL_ENTRIES: ToolEntry[] = [];
const colCounts: number[] = new Array(COLS).fill(0);

for (const cat of CATEGORY_ORDER) {
  const colIdx = CATEGORY_ORDER.indexOf(cat);
  const tools = getToolsByCategory(cat);
  for (const tool of tools) {
    const row = colCounts[colIdx];
    colCounts[colIdx] = row + 1;
    TOOL_ENTRIES.push({
      index: TOOL_ENTRIES.length,
      name: tool.name,
      category: tool.category,
      col: colIdx,
      row,
      gridX: GRID_X + colIdx * (CELL_W + GAP) + CELL_W / 2,
      gridY: GRID_Y + row * (CELL_H + GAP) + CELL_H / 2,
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Micro-visualization categories                                     */
/* ------------------------------------------------------------------ */

type MicroViz = "scale" | "clip" | "rotate" | "sparkle" | "squeeze" | "stamp" | "badge" | "pulse";

function getMicroViz(name: string, category: string): MicroViz {
  const lower = name.toLowerCase();
  if (lower.includes("resize") || lower.includes("upscal")) return "scale";
  if (lower.includes("crop") || lower.includes("split")) return "clip";
  if (lower.includes("rotate") || lower.includes("flip")) return "rotate";
  if (
    lower.includes("convert") ||
    lower.includes("svg") ||
    lower.includes("pdf") ||
    lower.includes("gif")
  )
    return "badge";
  if (lower.includes("compress") || lower.includes("optimi")) return "squeeze";
  if (lower.includes("watermark") || lower.includes("stamp") || lower.includes("overlay"))
    return "stamp";
  if (category === "ai") return "sparkle";
  return "pulse";
}

/* ------------------------------------------------------------------ */
/*  Entry direction helper                                             */
/* ------------------------------------------------------------------ */

type Direction =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "diag-tl"
  | "diag-tr"
  | "diag-bl"
  | "diag-br";

function getEntryDirection(index: number): Direction {
  const dirs: Direction[] = [
    "left",
    "right",
    "top",
    "bottom",
    "diag-tl",
    "diag-tr",
    "diag-bl",
    "diag-br",
  ];
  return dirs[index % dirs.length];
}

function getEntryPosition(dir: Direction): { x: number; y: number } {
  switch (dir) {
    case "left":
      return { x: -200, y: CY };
    case "right":
      return { x: 1920 + 200, y: CY };
    case "top":
      return { x: CX, y: -80 };
    case "bottom":
      return { x: CX, y: 1080 + 80 };
    case "diag-tl":
      return { x: -150, y: -80 };
    case "diag-tr":
      return { x: 1920 + 150, y: -80 };
    case "diag-bl":
      return { x: -150, y: 1080 + 80 };
    case "diag-br":
      return { x: 1920 + 150, y: 1080 + 80 };
  }
}

/* ------------------------------------------------------------------ */
/*  Sparkle dots component                                             */
/* ------------------------------------------------------------------ */

const SparkleDots: React.FC<{ progress: number }> = ({ progress }) => {
  const offsets = [
    { dx: -16, dy: -16 },
    { dx: 16, dy: -12 },
    { dx: -12, dy: 16 },
    { dx: 18, dy: 14 },
  ];
  const spread = interpolate(progress, [0, 1], [0, 1]);
  const opacity = interpolate(progress, [0, 0.3, 1], [0, 1, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <>
      {offsets.map((o) => (
        <div
          key={`${o.dx}-${o.dy}`}
          style={{
            position: "absolute",
            left: `calc(50% + ${o.dx * spread * 2}px)`,
            top: `calc(50% + ${o.dy * spread * 2}px)`,
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: COLOR.accent,
            opacity,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        />
      ))}
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  AnimatedToolPill -- self-contained 15-frame animation               */
/* ------------------------------------------------------------------ */

const AnimatedToolPill: React.FC<{ tool: ToolEntry }> = ({ tool }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const dir = getEntryDirection(tool.index);
  const entry = getEntryPosition(dir);
  const viz = getMicroViz(tool.name, tool.category);

  // Phase 1: entrance (frame 0-2) -- edge to center
  // Phase 2: center flash (frame 2-6) -- micro-visualization (4 frames for visibility)
  // Phase 3: grid snap (frame 6-10) -- center to grid position

  let x: number;
  let y: number;
  let extraTransform = "";
  let clipPath: string | undefined;
  let sparkleProgress = 0;
  let showSparkle = false;

  if (frame < 2) {
    // Entrance: edge to center
    const t = interpolate(frame, [0, 2], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE.snap,
    });
    x = entry.x + (CX - entry.x) * t;
    y = entry.y + (CY - entry.y) * t;
  } else if (frame < 6) {
    // Center flash with micro-visualization (4 frames)
    x = CX;
    y = CY;
    const vizProgress = interpolate(frame, [2, 6], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    switch (viz) {
      case "scale": {
        const s = interpolate(vizProgress, [0, 0.5, 1], [1.3, 0.8, 1.0]);
        extraTransform = ` scale(${s})`;
        break;
      }
      case "clip": {
        const inset = interpolate(vizProgress, [0, 0.5, 1], [0, 15, 0]);
        clipPath = `inset(${inset}% ${inset}% ${inset}% ${inset}%)`;
        break;
      }
      case "rotate": {
        const deg = interpolate(vizProgress, [0, 1], [0, 90]);
        extraTransform = ` rotate(${deg}deg)`;
        break;
      }
      case "badge": {
        const s = interpolate(vizProgress, [0, 0.3, 0.7, 1], [0.9, 1.15, 1.15, 1.0]);
        extraTransform = ` scale(${s})`;
        break;
      }
      case "squeeze": {
        const sx = interpolate(vizProgress, [0, 0.5, 1], [1, 0.7, 1]);
        const sy = interpolate(vizProgress, [0, 0.5, 1], [1, 1.2, 1]);
        extraTransform = ` scaleX(${sx}) scaleY(${sy})`;
        break;
      }
      case "stamp": {
        const ty = interpolate(vizProgress, [0, 0.4, 0.6, 1], [-20, 4, -2, 0]);
        const s = interpolate(vizProgress, [0, 0.4, 0.6, 1], [1.2, 0.95, 1.02, 1]);
        extraTransform = ` translateY(${ty}px) scale(${s})`;
        break;
      }
      case "sparkle": {
        showSparkle = true;
        sparkleProgress = vizProgress;
        const s = interpolate(vizProgress, [0, 0.5, 1], [1.0, 1.1, 1.0]);
        extraTransform = ` scale(${s})`;
        break;
      }
      default: {
        const s = interpolate(vizProgress, [0, 0.5, 1], [1.0, 1.1, 1.0]);
        extraTransform = ` scale(${s})`;
        break;
      }
    }
  } else {
    // Grid snap: center to grid position via spring
    const s = spring({
      frame: frame - 6,
      fps,
      config: SPRING.settle,
    });
    x = CX + (tool.gridX - CX) * s;
    y = CY + (tool.gridY - CY) * s;
  }

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -50%)${extraTransform}`,
        clipPath,
      }}
    >
      <ToolPill name={tool.name} category={tool.category} />
      {showSparkle && <SparkleDots progress={sparkleProgress} />}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Entrance phase wrapper -- uses Trail for motion blur frames 0-3    */
/* ------------------------------------------------------------------ */

const ToolEntrance: React.FC<{ tool: ToolEntry }> = ({ tool }) => {
  const frame = useCurrentFrame();
  const inMotion = frame < 6;

  if (inMotion) {
    return (
      <Trail layers={4} lagInFrames={0.15} trailOpacity={0.3}>
        <AbsoluteFill>
          <AnimatedToolPill tool={tool} />
        </AbsoluteFill>
      </Trail>
    );
  }

  return <AnimatedToolPill tool={tool} />;
};

/* ------------------------------------------------------------------ */
/*  Running counter (top-right, amber)                                 */
/* ------------------------------------------------------------------ */

const RunningCounter: React.FC = () => {
  const frame = useCurrentFrame();

  // Counter shows how many tools have landed (reached their local sequence end)
  let landed = 0;
  for (let i = 0; i < TOOL_ENTRIES.length; i++) {
    const landFrame = 30 + i * FRAMES_PER_TOOL + FRAMES_PER_TOOL;
    if (frame >= landFrame) landed = i + 1;
  }

  // Don't show counter before any tool has started
  if (frame < 40) return null;

  // During Act 3 (frame 520-560), counter transitions to "48 tools" and moves to center-top
  const isAct3Text = frame >= 520;

  // Fade in
  const opacity = interpolate(frame, [40, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (isAct3Text) {
    const moveProgress = interpolate(frame, [520, 550], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE.enter,
    });
    const xPos = interpolate(moveProgress, [0, 1], [1920 - 100, CX]);
    const yPos = interpolate(moveProgress, [0, 1], [40, 30]);

    return (
      <div
        style={{
          position: "absolute",
          left: xPos,
          top: yPos,
          transform: "translateX(-50%)",
          opacity,
        }}
      >
        <span
          style={{
            ...TEXT.counter,
            fontSize: 48,
            color: COLOR.accent,
          }}
        >
          48 tools
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        right: 60,
        top: 40,
        opacity,
      }}
    >
      <span
        style={{
          ...TEXT.counter,
          fontSize: 48,
          color: COLOR.accent,
        }}
      >
        {landed}
      </span>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Grid glow wave (Act 3, frame 750-770)                              */
/* ------------------------------------------------------------------ */

const GridGlowWave: React.FC = () => {
  const frame = useCurrentFrame();

  if (frame < 500 || frame > 530) return null;

  return (
    <>
      {CATEGORY_ORDER.map((cat, colIdx) => {
        const glowStart = 500 + colIdx * 3;
        const glowOpacity = interpolate(
          frame,
          [glowStart, glowStart + 6, glowStart + 12],
          [0, 0.2, 0],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        );

        const colX = GRID_X + colIdx * (CELL_W + GAP);

        return (
          <div
            key={cat}
            style={{
              position: "absolute",
              left: colX,
              top: GRID_Y - 10,
              width: CELL_W,
              height: GRID_H + 20,
              backgroundColor: "white",
              opacity: glowOpacity,
              borderRadius: 8,
              pointerEvents: "none",
              filter: "blur(8px)",
            }}
          />
        );
      })}
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Category labels (Act 3, frame 770-810)                             */
/* ------------------------------------------------------------------ */

const CategoryLabelsRow: React.FC = () => {
  const frame = useCurrentFrame();

  if (frame < 520) return null;

  // Act 4 fade
  const act4Opacity = interpolate(frame, [560, 570], [1, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <>
      {CATEGORY_ORDER.map((cat, i) => {
        const labelX = GRID_X + i * (CELL_W + GAP) + CELL_W / 2;
        const labelY = GRID_Y - 24;
        const catColor = COLOR.category[cat] ?? COLOR.accent;

        return (
          <div
            key={cat}
            style={{
              position: "absolute",
              left: labelX,
              top: labelY,
              transform: "translateX(-50%)",
              opacity: act4Opacity,
            }}
          >
            <ClipReveal startFrame={520 + i * 3}>
              <span style={{ ...TEXT.label, fontSize: 12, color: catColor }}>
                {CATEGORY_LABELS[cat]}
              </span>
            </ClipReveal>
          </div>
        );
      })}
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Main composition                                                   */
/* ------------------------------------------------------------------ */

export const The48: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  /* ================================================================ */
  /*  Act 1: Title (frame 0-30)                                        */
  /* ================================================================ */

  const titleScale =
    frame < 30
      ? interpolate(spring({ frame, fps, config: SPRING.settle }), [0, 1], [1.1, 1.0])
      : 1.0;

  // Title moves to top and shrinks during frames 30-60
  const titleY = interpolate(frame, [0, 30, 60], [CY - 48, CY - 48, 60], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE.enter,
  });

  const titleFontSize = interpolate(frame, [30, 60], [96, 48], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE.enter,
  });

  // Title as persistent header after frame 30 (fades down to subtle)
  const headerOpacity =
    frame >= 30
      ? interpolate(frame, [30, 60], [1, 0.7], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 0;

  // During Act 4, header fades out
  const headerAct4Opacity =
    frame >= 560
      ? interpolate(frame, [560, 570], [0.7, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : headerOpacity;

  /* ================================================================ */
  /*  Act 3: Grid pulse (frame 500-520)                                */
  /* ================================================================ */

  const gridPulseScale =
    frame >= 500 && frame < 520
      ? 1 +
        0.015 *
          Math.sin(
            interpolate(frame, [500, 520], [0, Math.PI], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          )
      : 1.0;

  /* ================================================================ */
  /*  Act 4: Grid fades, tagline (frame 560-600)                       */
  /* ================================================================ */

  const gridOpacity =
    frame >= 560
      ? interpolate(frame, [560, 575], [1, 0.6], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  return (
    <AbsoluteFill style={{ backgroundColor: COLOR.dark, overflow: "hidden" }}>
      {/* ---- Act 1: Title ---- */}
      {frame < 30 && (
        <div
          style={{
            position: "absolute",
            left: CX,
            top: titleY,
            transform: `translate(-50%, -50%) scale(${titleScale})`,
            textAlign: "center",
          }}
        >
          <ClipReveal startFrame={0} duration={12}>
            <span style={{ ...TEXT.counter, fontSize: 96 }}>
              48 tools<span style={{ color: COLOR.accent }}>.</span>
            </span>
          </ClipReveal>
        </div>
      )}

      {/* ---- Title as header (frame 30+) ---- */}
      {frame >= 30 && frame < 570 && (
        <div
          style={{
            position: "absolute",
            left: CX,
            top: titleY,
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            opacity: headerAct4Opacity,
          }}
        >
          <span
            style={{
              ...TEXT.counter,
              fontSize: titleFontSize,
            }}
          >
            48 tools<span style={{ color: COLOR.accent }}>.</span>
          </span>
        </div>
      )}

      {/* ---- Act 2: Rapid montage ---- */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${gridPulseScale})`,
          transformOrigin: "center center",
          opacity: gridOpacity,
        }}
      >
        {TOOL_ENTRIES.map((tool) => (
          <Sequence
            key={tool.index}
            from={30 + tool.index * FRAMES_PER_TOOL}
            durationInFrames={560 - (30 + tool.index * FRAMES_PER_TOOL)}
            layout="none"
          >
            <ToolEntrance tool={tool} />
          </Sequence>
        ))}
      </div>

      {/* ---- Grid glow wave (Act 3) ---- */}
      <GridGlowWave />

      {/* ---- Category labels (Act 3) ---- */}
      <div style={{ opacity: gridOpacity }}>
        <CategoryLabelsRow />
      </div>

      {/* ---- Running counter ---- */}
      <RunningCounter />

      {/* ---- Act 4: Tagline ---- */}
      {frame >= 560 && (
        <div
          style={{
            position: "absolute",
            left: CX,
            top: GRID_Y + GRID_H + 60,
            transform: "translateX(-50%)",
            textAlign: "center",
          }}
        >
          <ClipReveal startFrame={560} duration={18}>
            <span style={{ ...TEXT.sectionTitle }}>
              One container. <span style={{ color: COLOR.accent }}>Zero cloud.</span>
            </span>
          </ClipReveal>
        </div>
      )}

      <GrainOverlay />
    </AbsoluteFill>
  );
};
