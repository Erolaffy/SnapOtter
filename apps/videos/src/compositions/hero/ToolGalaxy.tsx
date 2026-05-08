import { Trail } from "@remotion/motion-blur";
import type React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ClipReveal } from "@/components/ClipReveal";
import { Counter } from "@/components/Counter";
import { GrainOverlay } from "@/components/GrainOverlay";
import { ToolPill } from "@/components/ToolPill";
import { CATEGORY_LABELS, CATEGORY_ORDER, COLOR } from "@/lib/colors";
import { TEXT } from "@/lib/fonts";
import { EASE, SPRING } from "@/lib/motion";
import { TOOLS } from "@/lib/tools";

/* ------------------------------------------------------------------ */
/*  Pre-computed pill data                                             */
/* ------------------------------------------------------------------ */

interface PillData {
  index: number;
  name: string;
  category: string;
  categoryIndex: number;
  rowInCategory: number;
  angle: number;
  burstRadius: number;
  rotationOffset: number;
}

const RING_RADII = [160, 210, 260, 310, 360, 410, 460, 510];

/** Speed in rad/frame for each ring (inner faster, outer slower) */
const RING_SPEEDS = RING_RADII.map(
  (_, i) => 0.008 - i * ((0.008 - 0.003) / (RING_RADII.length - 1)),
);

/** Alternating rotation direction: even rings CW, odd rings CCW */
const RING_DIRECTIONS = RING_RADII.map((_, i) => (i % 2 === 0 ? 1 : -1));

/** Category counts for computing per-category row indices */
const categoryCounts: Record<string, number> = {};
for (const cat of CATEGORY_ORDER) {
  categoryCounts[cat] = 0;
}

const PILLS: PillData[] = TOOLS.map((tool, i) => {
  const catIdx = CATEGORY_ORDER.indexOf(tool.category as (typeof CATEGORY_ORDER)[number]);
  const categoryIndex = catIdx >= 0 ? catIdx : 0;
  const rowInCategory = categoryCounts[tool.category] ?? 0;
  categoryCounts[tool.category] = rowInCategory + 1;

  return {
    index: i,
    name: tool.name,
    category: tool.category,
    categoryIndex,
    rowInCategory,
    angle: random(`angle-${i}`) * Math.PI * 2,
    burstRadius: 200 + random(`radius-${i}`) * 400,
    rotationOffset: (random(`rot-${i}`) - 0.5) * 30,
  };
});

/* ------------------------------------------------------------------ */
/*  Grid layout constants                                              */
/* ------------------------------------------------------------------ */

const GRID_COLS = CATEGORY_ORDER.length; // 8
const CELL_W = 120;
const CELL_H = 32;
const CELL_GAP = 8;

/** Max rows across all categories (AI has 15) */
const MAX_ROWS = Math.max(
  ...CATEGORY_ORDER.map((cat) => TOOLS.filter((t) => t.category === cat).length),
);

const GRID_TOTAL_W = GRID_COLS * CELL_W + (GRID_COLS - 1) * CELL_GAP;
const GRID_TOTAL_H = MAX_ROWS * CELL_H + (MAX_ROWS - 1) * CELL_GAP;
const GRID_LEFT = (1920 - GRID_TOTAL_W) / 2;
const GRID_TOP = (1080 - GRID_TOTAL_H) / 2 + 30; // offset down slightly for label room

/* ------------------------------------------------------------------ */
/*  Position helpers                                                   */
/* ------------------------------------------------------------------ */

const CX = 1920 / 2;
const CY = 1080 / 2;

function getBurstPosition(
  frame: number,
  fps: number,
  pill: PillData,
): { x: number; y: number; scale: number; opacity: number; rotation: number } {
  const entryFrame = 60 + pill.index * 2;
  const s = spring({
    frame: frame - entryFrame,
    fps,
    config: SPRING.popIn,
  });

  const x = CX + Math.cos(pill.angle) * pill.burstRadius * s;
  const y = CY + Math.sin(pill.angle) * pill.burstRadius * s;

  return {
    x,
    y,
    scale: s,
    opacity: Math.min(s * 2, 1),
    rotation: pill.rotationOffset * (1 - s * 0.5),
  };
}

function getOrbitPosition(
  frame: number,
  pill: PillData,
): { x: number; y: number; scale: number; opacity: number; rotation: number } {
  const catIdx = pill.categoryIndex;
  const ringRadius = RING_RADII[catIdx];
  const ringSpeed = RING_SPEEDS[catIdx];
  const direction = RING_DIRECTIONS[catIdx];

  // Distribute pills evenly within their ring
  const toolsInCat = TOOLS.filter((t) => t.category === pill.category).length;
  const baseAngle = (pill.rowInCategory / toolsInCat) * Math.PI * 2;

  // Accumulated angle: integrate speed from frame 210 to current frame
  // For simplicity, use frame-based angle with deceleration applied
  let orbitAngle: number;
  if (frame < 360) {
    orbitAngle = baseAngle + (frame - 210) * ringSpeed * direction;
  } else {
    // Angle accumulated up to frame 360 + decelerating portion
    const preDecAngle = (360 - 210) * ringSpeed * direction;
    const decProgress = interpolate(frame, [360, 420], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE.exit,
    });
    // Deceleration: linearly decreasing speed from full to 0
    // Integral of (1-t) from 0 to decProgress = decProgress - decProgress^2/2
    const decAngle = (frame - 360) * ringSpeed * direction * (1 - decProgress * 0.5);
    orbitAngle = baseAngle + preDecAngle + decAngle;
  }

  const rawX = Math.cos(orbitAngle) * ringRadius;
  const rawY = Math.sin(orbitAngle) * ringRadius * 0.6; // elliptical perspective

  // Depth: pills at "back" of orbit (positive sin component) are dimmer/smaller
  const depthFactor = Math.sin(orbitAngle);
  const depthOpacity = interpolate(depthFactor, [-1, 1], [1, 0.7]);
  const depthScale = interpolate(depthFactor, [-1, 1], [1, 0.85]);

  // Transition from burst to orbit (frame 180-210)
  const transitionProgress = interpolate(frame, [180, 210], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE.enter,
  });

  // If still transitioning, we need the burst end position
  if (transitionProgress < 1) {
    const burstX = CX + Math.cos(pill.angle) * pill.burstRadius;
    const burstY = CY + Math.sin(pill.angle) * pill.burstRadius;
    const orbitX = CX + rawX;
    const orbitY = CY + rawY;

    return {
      x: burstX + (orbitX - burstX) * transitionProgress,
      y: burstY + (orbitY - burstY) * transitionProgress,
      scale: 1 + (depthScale - 1) * transitionProgress,
      opacity: 1 + (depthOpacity - 1) * transitionProgress,
      rotation: pill.rotationOffset * (1 - transitionProgress),
    };
  }

  return {
    x: CX + rawX,
    y: CY + rawY,
    scale: depthScale,
    opacity: depthOpacity,
    rotation: 0,
  };
}

function getGridPosition(
  frame: number,
  fps: number,
  pill: PillData,
): { x: number; y: number; scale: number; opacity: number; rotation: number } {
  const col = pill.categoryIndex;
  const row = pill.rowInCategory;

  const targetX = GRID_LEFT + col * (CELL_W + CELL_GAP) + CELL_W / 2;
  const targetY = GRID_TOP + row * (CELL_H + CELL_GAP) + CELL_H / 2;

  // Spring animation from orbit position to grid position
  const staggerDelay = pill.index * 1.5;
  const settleFrame = 420 + staggerDelay;
  const s = spring({
    frame: frame - settleFrame,
    fps,
    config: SPRING.settle,
  });

  // Get last orbit position (frozen at deceleration end)
  const orbitPos = getOrbitPosition(420, pill);

  const x = orbitPos.x + (targetX - orbitPos.x) * s;
  const y = orbitPos.y + (targetY - orbitPos.y) * s;

  // Act 5: grid fades to 40% opacity
  const gridOpacity = interpolate(frame, [540, 570], [1, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE.smooth,
  });

  return {
    x,
    y,
    scale: orbitPos.scale + (1 - orbitPos.scale) * s,
    opacity: gridOpacity,
    rotation: 0,
  };
}

function getPillPosition(
  frame: number,
  fps: number,
  pill: PillData,
): { x: number; y: number; scale: number; opacity: number; rotation: number } {
  if (frame < 180) return getBurstPosition(frame, fps, pill);
  if (frame < 420) return getOrbitPosition(frame, pill);
  return getGridPosition(frame, fps, pill);
}

/* ------------------------------------------------------------------ */
/*  AnimatedPill - renders a single pill at its computed position       */
/* ------------------------------------------------------------------ */

const AnimatedPill: React.FC<{ pill: PillData }> = ({ pill }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pos = getPillPosition(frame, fps, pill);

  // Don't render before the pill's entry frame
  const entryFrame = 60 + pill.index * 2;
  if (frame < entryFrame) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        transform: `translate(-50%, -50%) scale(${pos.scale}) rotate(${pos.rotation}deg)`,
        opacity: pos.opacity,
      }}
    >
      <ToolPill name={pill.name} category={pill.category} />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  BurstPhase - pills wrapped in Trail for motion blur                */
/* ------------------------------------------------------------------ */

const BurstPills: React.FC = () => (
  <AbsoluteFill>
    {PILLS.map((pill) => (
      <AnimatedPill key={pill.index} pill={pill} />
    ))}
  </AbsoluteFill>
);

/* ------------------------------------------------------------------ */
/*  Category labels for the grid                                       */
/* ------------------------------------------------------------------ */

const CategoryLabels: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame < 500) return null;

  return (
    <>
      {CATEGORY_ORDER.map((cat, i) => {
        const labelX = GRID_LEFT + i * (CELL_W + CELL_GAP) + CELL_W / 2;
        const labelY = GRID_TOP - 20;
        const catColor = COLOR.category[cat] ?? COLOR.accent;

        // Act 5 grid opacity
        const gridOpacity = interpolate(frame, [540, 570], [1, 0.4], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE.smooth,
        });

        return (
          <div
            key={cat}
            style={{
              position: "absolute",
              left: labelX,
              top: labelY,
              transform: "translateX(-50%)",
              opacity: gridOpacity,
            }}
          >
            <ClipReveal startFrame={500 + i * 3}>
              <span style={{ ...TEXT.label, fontSize: 11, color: catColor }}>
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

export const ToolGalaxy: React.FC = () => {
  const frame = useCurrentFrame();

  /* ================================================================ */
  /*  Act 1: Logo Pulse (frame 0-60)                                   */
  /* ================================================================ */

  const logoOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const logoPulseScale = frame >= 30 ? Math.sin(frame * 0.15) * 0.05 + 1 : 1;

  // Logo fades out as burst starts
  const logoFadeOut = interpolate(frame, [60, 90], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Radial glow breathes with the pulse
  const glowOpacity = frame >= 30 ? 0.15 + Math.sin(frame * 0.15) * 0.05 : 0.05;

  // Ambient radial glow (always present, fades during burst)
  const ambientGlow = interpolate(frame, [0, 20], [0.05, 0.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ================================================================ */
  /*  Act 5: Counter + Tagline (frame 540-660)                         */
  /* ================================================================ */

  const counterOpacity = interpolate(frame, [540, 555], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Counter scale bump: subtle pulse as numbers tick
  const counterProgress = interpolate(frame, [540, 590], [0, 48], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE.enter,
  });
  const counterBump = frame >= 540 && frame <= 595 ? 1 + Math.sin(counterProgress * 0.8) * 0.03 : 1;

  /* ================================================================ */
  /*  Determine rendering phase                                        */
  /* ================================================================ */

  // During burst (frame 60-180), wrap pills in Trail for motion blur
  const inBurstPhase = frame >= 60 && frame < 180;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 60% 50% at 50% 50%, rgba(245,158,11,${ambientGlow}) 0%, #0c0a09 70%)`,
        overflow: "hidden",
      }}
    >
      {/* ---- Radial amber glow behind logo (Act 1) ---- */}
      {frame < 90 && (
        <div
          style={{
            position: "absolute",
            left: CX,
            top: CY,
            width: 400,
            height: 400,
            transform: "translate(-50%, -50%)",
            background:
              "radial-gradient(circle at 50% 50%, rgba(245,158,11,0.3) 0%, transparent 70%)",
            opacity: glowOpacity * logoFadeOut,
            filter: "blur(100px)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* ---- Logo (Act 1) ---- */}
      {frame < 120 && (
        <div
          style={{
            position: "absolute",
            left: CX,
            top: CY,
            transform: `translate(-50%, -50%) scale(${logoPulseScale})`,
            opacity: logoOpacity * logoFadeOut,
          }}
        >
          <Img
            src={staticFile("logo.png")}
            width={120}
            height={120}
            style={{ objectFit: "contain" }}
          />
        </div>
      )}

      {/* ---- Pills ---- */}
      {frame >= 60 &&
        (inBurstPhase ? (
          <Trail layers={6} lagInFrames={0.12} trailOpacity={0.4}>
            <BurstPills />
          </Trail>
        ) : (
          <BurstPills />
        ))}

      {/* ---- Category labels (Act 4) ---- */}
      <CategoryLabels />

      {/* ---- Counter + Tagline (Act 5) ---- */}
      {frame >= 540 && (
        <div
          style={{
            position: "absolute",
            left: CX,
            top: CY - 30,
            transform: `translate(-50%, -50%) scale(${counterBump})`,
            textAlign: "center",
            opacity: counterOpacity,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Counter from={0} to={TOOLS.length} startFrame={540} duration={50} style={TEXT.counter} />
        </div>
      )}

      {/* ---- Tagline text (Act 5) ---- */}
      {frame >= 580 && (
        <div
          style={{
            position: "absolute",
            left: CX,
            top: CY + 40,
            transform: "translateX(-50%)",
            textAlign: "center",
          }}
        >
          <ClipReveal startFrame={580}>
            <span style={{ ...TEXT.sectionTitle }}>tools. Zero cloud dependency.</span>
          </ClipReveal>
        </div>
      )}

      <GrainOverlay />
    </AbsoluteFill>
  );
};
