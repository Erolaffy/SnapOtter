import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { runMigrations } from "../../../apps/api/src/db/migrate.js";
import {
  getMaxAgeMs,
  shouldRunStartupCleanup,
  startCleanupCron,
} from "../../../apps/api/src/lib/cleanup.js";

beforeAll(() => {
  runMigrations();
});

function setSetting(key: string, value: string) {
  const existing = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  if (existing) {
    db.update(schema.settings)
      .set({ value, updatedAt: new Date() })
      .where(eq(schema.settings.key, key))
      .run();
  } else {
    db.insert(schema.settings).values({ key, value }).run();
  }
}

function removeSetting(key: string) {
  db.delete(schema.settings).where(eq(schema.settings.key, key)).run();
}

async function waitForCleanup(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

afterEach(() => {
  removeSetting("tempFileMaxAgeHours");
  removeSetting("startupCleanup");
});

describe("getMaxAgeMs", () => {
  it("returns DB value when tempFileMaxAgeHours is set", () => {
    setSetting("tempFileMaxAgeHours", "48");
    const result = getMaxAgeMs();
    expect(result).toBe(48 * 60 * 60 * 1000);
  });

  it("returns env fallback when no DB setting exists", () => {
    removeSetting("tempFileMaxAgeHours");
    const result = getMaxAgeMs();
    expect(result).toBe(1 * 60 * 60 * 1000);
  });

  it("returns env fallback for invalid (non-numeric) DB value", () => {
    setSetting("tempFileMaxAgeHours", "notanumber");
    const result = getMaxAgeMs();
    expect(result).toBe(1 * 60 * 60 * 1000);
  });

  it("returns env fallback for zero or negative DB value", () => {
    setSetting("tempFileMaxAgeHours", "0");
    const result = getMaxAgeMs();
    expect(result).toBe(1 * 60 * 60 * 1000);

    setSetting("tempFileMaxAgeHours", "-5");
    const result2 = getMaxAgeMs();
    expect(result2).toBe(1 * 60 * 60 * 1000);
  });

  it("handles fractional hours", () => {
    setSetting("tempFileMaxAgeHours", "0.5");
    const result = getMaxAgeMs();
    expect(result).toBe(0.5 * 60 * 60 * 1000);
  });
});

describe("shouldRunStartupCleanup", () => {
  it("returns false when setting is 'false'", () => {
    setSetting("startupCleanup", "false");
    expect(shouldRunStartupCleanup()).toBe(false);
  });

  it("returns true when setting is 'true'", () => {
    setSetting("startupCleanup", "true");
    expect(shouldRunStartupCleanup()).toBe(true);
  });

  it("returns true when setting is not set", () => {
    removeSetting("startupCleanup");
    expect(shouldRunStartupCleanup()).toBe(true);
  });

  it("returns true for any value other than 'false'", () => {
    setSetting("startupCleanup", "yes");
    expect(shouldRunStartupCleanup()).toBe(true);

    setSetting("startupCleanup", "1");
    expect(shouldRunStartupCleanup()).toBe(true);
  });
});

describe("startCleanupCron", () => {
  let tempDir: string;
  let originalWorkspacePath: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `cleanup-test-${randomUUID().slice(0, 8)}`);
    originalWorkspacePath = env.WORKSPACE_PATH;
    env.WORKSPACE_PATH = tempDir;
    setSetting("startupCleanup", "false");
  });

  afterEach(() => {
    env.WORKSPACE_PATH = originalWorkspacePath;
    removeSetting("startupCleanup");
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns object with stop() method", () => {
    vi.useFakeTimers();
    const cron = startCleanupCron();
    expect(typeof cron.stop).toBe("function");
    cron.stop();
    vi.useRealTimers();
  });

  it("creates workspace directory", () => {
    vi.useFakeTimers();
    expect(existsSync(tempDir)).toBe(false);
    const cron = startCleanupCron();
    expect(existsSync(tempDir)).toBe(true);
    cron.stop();
    vi.useRealTimers();
  });

  it("stop() clears intervals", () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const cron = startCleanupCron();
    cron.stop();
    expect(clearSpy).toHaveBeenCalledTimes(2);
    clearSpy.mockRestore();
    vi.useRealTimers();
  });

  it("removes old files on startup cleanup", async () => {
    mkdirSync(tempDir, { recursive: true });
    const oldFile = join(tempDir, "old-file.txt");
    writeFileSync(oldFile, "old content");
    const pastTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(oldFile, pastTime, pastTime);

    setSetting("startupCleanup", "true");
    const cron = startCleanupCron();
    await waitForCleanup();
    expect(existsSync(oldFile)).toBe(false);
    cron.stop();
  });

  it("keeps recent files on startup cleanup", async () => {
    mkdirSync(tempDir, { recursive: true });
    const recentFile = join(tempDir, "recent-file.txt");
    writeFileSync(recentFile, "recent content");

    setSetting("startupCleanup", "true");
    const cron = startCleanupCron();
    await waitForCleanup();
    expect(existsSync(recentFile)).toBe(true);
    cron.stop();
  });

  it("removes old subdirectory when its mtime is expired", async () => {
    mkdirSync(tempDir, { recursive: true });
    const oldDir = join(tempDir, "old-dir");
    mkdirSync(oldDir);
    const nestedFile = join(oldDir, "nested.txt");
    writeFileSync(nestedFile, "nested");
    const pastTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(nestedFile, pastTime, pastTime);
    utimesSync(oldDir, pastTime, pastTime);

    setSetting("startupCleanup", "true");
    const cron = startCleanupCron();
    await waitForCleanup();
    expect(existsSync(oldDir)).toBe(false);
    cron.stop();
  });

  it("skips startup cleanup when startupCleanup is false", async () => {
    mkdirSync(tempDir, { recursive: true });
    const oldFile = join(tempDir, "skip-old.txt");
    writeFileSync(oldFile, "old");
    const pastTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(oldFile, pastTime, pastTime);

    setSetting("startupCleanup", "false");
    const cron = startCleanupCron();
    await waitForCleanup();
    expect(existsSync(oldFile)).toBe(true);
    cron.stop();
  });

  it("purges expired sessions on startup when enabled", () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const userId = `test-user-${randomUUID().slice(0, 8)}`;
    const existing = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
    if (!existing) {
      db.insert(schema.users)
        .values({
          id: userId,
          username: `cleanup-test-${randomUUID().slice(0, 8)}`,
          passwordHash: "hash",
          role: "user",
          team: "Default",
          mustChangePassword: false,
        })
        .run();
    }

    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    db.insert(schema.sessions)
      .values({
        id: sessionId,
        userId,
        expiresAt: pastDate,
      })
      .run();

    setSetting("startupCleanup", "true");
    const cron = startCleanupCron();

    const session = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .get();
    expect(session).toBeUndefined();
    cron.stop();

    db.delete(schema.users).where(eq(schema.users.id, userId)).run();
  });

  it("does not purge non-expired sessions", () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const userId = `test-user-${randomUUID().slice(0, 8)}`;
    db.insert(schema.users)
      .values({
        id: userId,
        username: `cleanup-keep-${randomUUID().slice(0, 8)}`,
        passwordHash: "hash",
        role: "user",
        team: "Default",
        mustChangePassword: false,
      })
      .run();

    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    db.insert(schema.sessions)
      .values({
        id: sessionId,
        userId,
        expiresAt: futureDate,
      })
      .run();

    setSetting("startupCleanup", "true");
    const cron = startCleanupCron();

    const session = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .get();
    expect(session).toBeDefined();
    cron.stop();

    db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId)).run();
    db.delete(schema.users).where(eq(schema.users.id, userId)).run();
  });

  it("handles empty workspace directory gracefully", async () => {
    mkdirSync(tempDir, { recursive: true });
    setSetting("startupCleanup", "true");
    const cron = startCleanupCron();
    await waitForCleanup();
    expect(existsSync(tempDir)).toBe(true);
    cron.stop();
  });
});
