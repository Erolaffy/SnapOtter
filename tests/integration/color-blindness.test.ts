import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createMultipartPayload, loginAsAdmin, type TestApp } from "./test-server.js";

const FIXTURES = join(__dirname, "..", "fixtures");
const PNG = readFileSync(join(FIXTURES, "test-200x150.png"));
const JPG = readFileSync(join(FIXTURES, "test-100x100.jpg"));

const ALL_TYPES = [
  "protanopia",
  "deuteranopia",
  "tritanopia",
  "protanomaly",
  "deuteranomaly",
  "tritanomaly",
  "achromatopsia",
  "blueConeMonochromacy",
] as const;

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

function makePayload(
  settings: Record<string, unknown>,
  buffer: Buffer = PNG,
  filename = "test.png",
  contentType = "image/png",
) {
  return createMultipartPayload([
    { name: "file", filename, contentType, content: buffer },
    { name: "settings", content: JSON.stringify(settings) },
  ]);
}

async function postTool(
  settings: Record<string, unknown>,
  buffer?: Buffer,
  filename?: string,
  ct?: string,
) {
  const { body: payload, contentType } = makePayload(settings, buffer, filename, ct);
  return app.inject({
    method: "POST",
    url: "/api/v1/tools/color-blindness",
    payload,
    headers: {
      "content-type": contentType,
      authorization: `Bearer ${adminToken}`,
    },
  });
}

describe("Default settings", () => {
  it("processes with default settings (deuteranomaly)", async () => {
    const res = await postTool({});
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

describe("All 8 simulation types", () => {
  for (const type of ALL_TYPES) {
    it(`processes with simulationType=${type}`, async () => {
      const res = await postTool({ simulationType: type });
      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      expect(result.downloadUrl).toBeDefined();
    });
  }

  it("different types produce different outputs", async () => {
    const buffers: Buffer[] = [];
    for (const type of ["protanopia", "tritanopia", "achromatopsia"] as const) {
      const res = await postTool({ simulationType: type });
      expect(res.statusCode).toBe(200);
      const result = JSON.parse(res.body);
      const dlRes = await app.inject({
        method: "GET",
        url: result.downloadUrl,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      buffers.push(dlRes.rawPayload);
    }
    const pixelSets = await Promise.all(
      buffers.map(async (buf) => {
        const { data } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        return `${data[0]},${data[1]},${data[2]}`;
      }),
    );
    const unique = new Set(pixelSets);
    expect(unique.size).toBeGreaterThan(1);
  });
});

describe("Dimension preservation", () => {
  it("output has same dimensions as input", async () => {
    const res = await postTool({ simulationType: "protanopia" });
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    const dlRes = await app.inject({
      method: "GET",
      url: result.downloadUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const meta = await sharp(dlRes.rawPayload).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });
});

describe("Multiple input formats", () => {
  it("processes JPEG input", async () => {
    const res = await postTool({ simulationType: "deuteranopia" }, JPG, "test.jpg", "image/jpeg");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.downloadUrl).toBeDefined();
  });

  it("processes WebP input", async () => {
    const WEBP = readFileSync(join(FIXTURES, "test-50x50.webp"));
    const res = await postTool({ simulationType: "tritanopia" }, WEBP, "test.webp", "image/webp");
    expect(res.statusCode).toBe(200);
  });

  it("processes HEIC input", { timeout: 120_000 }, async () => {
    const HEIC = readFileSync(join(FIXTURES, "test-200x150.heic"));
    const res = await postTool({ simulationType: "protanomaly" }, HEIC, "photo.heic", "image/heic");
    expect(res.statusCode).toBe(200);
  });

  it("processes SVG input", async () => {
    const SVG = readFileSync(join(FIXTURES, "test-100x100.svg"));
    const res = await postTool(
      { simulationType: "achromatopsia" },
      SVG,
      "icon.svg",
      "image/svg+xml",
    );
    expect(res.statusCode).toBe(200);
  });

  it("processes animated GIF input", async () => {
    const GIF = readFileSync(join(FIXTURES, "animated.gif"));
    const res = await postTool({ simulationType: "deuteranomaly" }, GIF, "anim.gif", "image/gif");
    expect(res.statusCode).toBe(200);
  });
});

describe("Error handling", () => {
  it("returns 400 when no file is provided", async () => {
    const { body: payload, contentType } = createMultipartPayload([
      { name: "settings", content: JSON.stringify({ simulationType: "protanopia" }) },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-blindness",
      payload,
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${adminToken}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid simulationType value", async () => {
    const res = await postTool({ simulationType: "invalid-type" });
    expect(res.statusCode).toBe(400);
  });
});

describe("Edge cases", () => {
  it("processes 1x1 pixel image", async () => {
    const TINY = readFileSync(join(FIXTURES, "test-1x1.png"));
    const res = await postTool({ simulationType: "deuteranomaly" }, TINY, "tiny.png", "image/png");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });

  it("processes stress-large.jpg", async () => {
    const LARGE = readFileSync(join(FIXTURES, "content", "stress-large.jpg"));
    const res = await postTool({ simulationType: "protanopia" }, LARGE, "large.jpg", "image/jpeg");
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.processedSize).toBeGreaterThan(0);
  });
});

describe("Authentication", () => {
  it("rejects unauthenticated request", async () => {
    const { body: payload, contentType } = makePayload({ simulationType: "protanopia" });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/color-blindness",
      payload,
      headers: { "content-type": contentType },
    });
    expect(res.statusCode).toBe(401);
  });
});
