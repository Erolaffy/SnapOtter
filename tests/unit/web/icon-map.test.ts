// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ICON_MAP } from "@/lib/icon-map";

describe("ICON_MAP", () => {
  it("is a non-empty object", () => {
    expect(Object.keys(ICON_MAP).length).toBeGreaterThan(0);
  });

  it("every value is a valid React component", () => {
    for (const [_key, value] of Object.entries(ICON_MAP)) {
      const isComponent =
        typeof value === "function" ||
        (typeof value === "object" && value !== null && "$$typeof" in value);
      expect(isComponent).toBe(true);
    }
  });

  it("contains all category icons referenced by shared constants", () => {
    const categoryIcons = [
      "Layers",
      "Zap",
      "SlidersHorizontal",
      "Stamp",
      "Wrench",
      "LayoutGrid",
      "FileType",
      "Sparkles",
    ];
    for (const icon of categoryIcons) {
      expect(ICON_MAP[icon]).toBeDefined();
    }
  });

  it("contains all tool icons referenced by shared constants", () => {
    const toolIcons = [
      "Maximize2",
      "Crop",
      "RotateCw",
      "FileOutput",
      "Minimize2",
      "Globe",
      "ShieldOff",
      "PenLine",
      "FileEdit",
      "FileText",
      "Focus",
      "Pipette",
      "Eraser",
      "ZoomIn",
      "Wand2",
      "ScanText",
      "EyeOff",
      "ScanFace",
      "Palette",
      "Eye",
      "Undo2",
      "UserCheck",
      "Type",
      "Image",
      "TextCursorInput",
      "Info",
      "Columns2",
      "Copy",
      "QrCode",
      "ScanLine",
      "Code",
      "Columns",
      "Grid3x3",
      "Frame",
      "FileImage",
      "PenTool",
      "Film",
    ];
    for (const icon of toolIcons) {
      expect(ICON_MAP[icon]).toBeDefined();
    }
  });

  it("does not contain undefined or null values", () => {
    for (const [_key, value] of Object.entries(ICON_MAP)) {
      expect(value).not.toBeNull();
      expect(value).not.toBeUndefined();
    }
  });

  it("keys are PascalCase (Lucide icon naming convention)", () => {
    for (const key of Object.keys(ICON_MAP)) {
      expect(key[0]).toBe(key[0].toUpperCase());
    }
  });

  it("specific commonly used icons exist", () => {
    expect(ICON_MAP.Crop).toBeDefined();
    expect(ICON_MAP.Maximize2).toBeDefined();
    expect(ICON_MAP.RotateCw).toBeDefined();
    expect(ICON_MAP.Sparkles).toBeDefined();
    expect(ICON_MAP.CheckCircle2).toBeDefined();
    expect(ICON_MAP.Star).toBeDefined();
  });
});
