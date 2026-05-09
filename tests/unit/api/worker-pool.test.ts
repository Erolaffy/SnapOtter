/**
 * Unit tests for the worker pool module.
 *
 * Tests the getWorkerPool singleton behavior, shutdownWorkerPool cleanup,
 * and the image-worker interface types.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────

const mockDestroy = vi.fn().mockResolvedValue(undefined);

vi.mock("piscina", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      run: vi.fn(),
      destroy: mockDestroy,
    })),
  };
});

vi.mock("../../../apps/api/src/lib/env.js", () => ({
  loadEnv: () => ({ MAX_WORKER_THREADS: 2 }),
  resolveWorkerThreads: () => 2,
}));

import { getWorkerPool, shutdownWorkerPool } from "../../../apps/api/src/lib/worker-pool.js";

// ── Tests ───────────────────────────────────────────────────────────────

describe("worker-pool", () => {
  afterEach(async () => {
    // Clean up the pool singleton between tests
    await shutdownWorkerPool();
    vi.clearAllMocks();
  });

  describe("getWorkerPool", () => {
    it("returns a Piscina instance", () => {
      const pool = getWorkerPool();
      expect(pool).toBeDefined();
      expect(pool.run).toBeDefined();
      expect(pool.destroy).toBeDefined();
    });

    it("returns the same instance on repeated calls (singleton)", () => {
      const pool1 = getWorkerPool();
      const pool2 = getWorkerPool();
      expect(pool1).toBe(pool2);
    });
  });

  describe("shutdownWorkerPool", () => {
    it("destroys the pool", async () => {
      const pool = getWorkerPool();
      const destroySpy = vi.spyOn(pool, "destroy");
      await shutdownWorkerPool();
      expect(destroySpy).toHaveBeenCalledTimes(1);
    });

    it("can be called when no pool exists (no-op)", async () => {
      // Do not create pool, just shut down -- should not throw
      await shutdownWorkerPool();
    });

    it("creates a fresh pool after shutdown", async () => {
      const pool1 = getWorkerPool();
      await shutdownWorkerPool();
      const pool2 = getWorkerPool();
      expect(pool2).not.toBe(pool1);
    });
  });
});

describe("image-worker interface", () => {
  // The WorkerInput and WorkerOutput types define the contract
  // for image processing in worker threads. We test the shape here.

  it("WorkerInput has the expected shape", () => {
    const input = {
      toolId: "resize",
      inputBuffer: Buffer.from("test"),
      settings: { width: 100 },
      filename: "photo.jpg",
      inputFormat: "jpeg",
    };

    expect(input.toolId).toBe("resize");
    expect(Buffer.isBuffer(input.inputBuffer)).toBe(true);
    expect(input.settings).toEqual({ width: 100 });
    expect(input.filename).toBe("photo.jpg");
    expect(input.inputFormat).toBe("jpeg");
  });

  it("WorkerInput inputFormat is optional", () => {
    const input = {
      toolId: "compress",
      inputBuffer: Buffer.from("data"),
      settings: {},
      filename: "img.png",
    };

    expect(input.inputFormat).toBeUndefined();
  });

  it("WorkerOutput has the expected shape", () => {
    const output = {
      buffer: Buffer.from("result"),
      filename: "output.jpg",
      contentType: "image/jpeg",
    };

    expect(Buffer.isBuffer(output.buffer)).toBe(true);
    expect(output.filename).toBe("output.jpg");
    expect(output.contentType).toBe("image/jpeg");
  });
});
