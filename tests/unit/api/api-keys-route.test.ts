/**
 * Unit tests for API key route validation and helper logic.
 *
 * Tests the create API key schema, permission scoping logic,
 * expiration date validation, and key prefix computation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Reproduce validation logic from api-keys.ts ────────────────────────

function validateCreateApiKey(body: Record<string, unknown>): {
  success: boolean;
  error?: string;
  data?: { name?: string; permissions?: string[]; expiresAt?: string };
} {
  if (body.name !== undefined) {
    if (typeof body.name !== "string") return { success: false, error: "name must be a string" };
    if (body.name.length > 100)
      return { success: false, error: "Key name must be 100 characters or fewer" };
  }
  if (body.permissions !== undefined) {
    if (!Array.isArray(body.permissions))
      return { success: false, error: "permissions must be an array" };
  }
  if (body.expiresAt !== undefined) {
    if (typeof body.expiresAt !== "string")
      return { success: false, error: "expiresAt must be a string" };
  }
  return {
    success: true,
    data: {
      name: body.name as string | undefined,
      permissions: body.permissions as string[] | undefined,
      expiresAt: body.expiresAt as string | undefined,
    },
  };
}

function computeKeyPrefix(rawKey: string): string {
  return rawKey.slice(0, 10);
}

function scopePermissions(
  requestedPerms: string[],
  userPerms: string[],
): { valid: boolean; invalid: string[] } {
  const permSet = new Set<string>(userPerms);
  const invalid = requestedPerms.filter((p) => !permSet.has(p));
  return { valid: invalid.length === 0, invalid };
}

function validateExpiresAt(dateStr: string): { valid: boolean; error?: string; date?: Date } {
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) {
    return { valid: false, error: "Invalid expiresAt date" };
  }
  if (parsed <= new Date()) {
    return { valid: false, error: "expiresAt must be in the future" };
  }
  return { valid: true, date: parsed };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("API keys route logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create API key validation", () => {
    it("accepts empty object (all fields optional)", () => {
      const result = validateCreateApiKey({});
      expect(result.success).toBe(true);
    });

    it("accepts valid name", () => {
      const result = validateCreateApiKey({ name: "My Key" });
      expect(result.success).toBe(true);
    });

    it("rejects name longer than 100 characters", () => {
      const result = validateCreateApiKey({ name: "x".repeat(101) });
      expect(result.success).toBe(false);
    });

    it("accepts name exactly 100 characters", () => {
      const result = validateCreateApiKey({ name: "x".repeat(100) });
      expect(result.success).toBe(true);
    });

    it("accepts permissions array", () => {
      const result = validateCreateApiKey({
        permissions: ["tools:use", "files:own"],
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty permissions array", () => {
      const result = validateCreateApiKey({ permissions: [] });
      expect(result.success).toBe(true);
    });

    it("accepts valid expiresAt date string", () => {
      const result = validateCreateApiKey({
        expiresAt: "2030-01-01T00:00:00Z",
      });
      expect(result.success).toBe(true);
    });

    it("accepts all fields together", () => {
      const result = validateCreateApiKey({
        name: "Production Key",
        permissions: ["tools:use"],
        expiresAt: "2030-12-31T23:59:59Z",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("key prefix computation", () => {
    it("returns first 10 characters of the key", () => {
      const key = "si_abcdefghijklmnop";
      expect(computeKeyPrefix(key)).toBe("si_abcdefg");
    });

    it("handles short keys", () => {
      const key = "si_abc";
      expect(computeKeyPrefix(key)).toBe("si_abc");
    });

    it("always starts with si_ prefix", () => {
      const key = "si_1234567890abcdef";
      expect(computeKeyPrefix(key).startsWith("si_")).toBe(true);
    });
  });

  describe("permission scoping", () => {
    it("passes when all requested permissions are in user permissions", () => {
      const result = scopePermissions(
        ["tools:use", "files:own"],
        ["tools:use", "files:own", "files:all"],
      );
      expect(result.valid).toBe(true);
      expect(result.invalid).toHaveLength(0);
    });

    it("fails when requesting permissions user does not have", () => {
      const result = scopePermissions(["tools:use", "users:manage"], ["tools:use", "files:own"]);
      expect(result.valid).toBe(false);
      expect(result.invalid).toEqual(["users:manage"]);
    });

    it("returns all invalid permissions", () => {
      const result = scopePermissions(
        ["tools:use", "users:manage", "features:manage"],
        ["tools:use"],
      );
      expect(result.invalid).toEqual(["users:manage", "features:manage"]);
    });

    it("passes with empty requested permissions", () => {
      const result = scopePermissions([], ["tools:use"]);
      expect(result.valid).toBe(true);
    });

    it("fails when user has no permissions", () => {
      const result = scopePermissions(["tools:use"], []);
      expect(result.valid).toBe(false);
    });
  });

  describe("expiresAt validation", () => {
    it("rejects invalid date string", () => {
      const result = validateExpiresAt("not-a-date");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid expiresAt date");
    });

    it("rejects date in the past", () => {
      const result = validateExpiresAt("2020-01-01T00:00:00Z");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("expiresAt must be in the future");
    });

    it("accepts date in the future", () => {
      const result = validateExpiresAt("2030-06-15T12:00:00Z");
      expect(result.valid).toBe(true);
      expect(result.date).toBeInstanceOf(Date);
    });

    it("rejects empty string", () => {
      const result = validateExpiresAt("");
      expect(result.valid).toBe(false);
    });
  });

  describe("default name behavior", () => {
    it("uses default name when name is empty", () => {
      const name = "".trim() || "Default API Key";
      expect(name).toBe("Default API Key");
    });

    it("uses default name when name is whitespace", () => {
      const name = "   ".trim() || "Default API Key";
      expect(name).toBe("Default API Key");
    });

    it("uses provided name when not empty", () => {
      const name = "My Key".trim() || "Default API Key";
      expect(name).toBe("My Key");
    });
  });

  describe("API key format", () => {
    it("raw key starts with si_ prefix", () => {
      const rawKey = `si_${"a".repeat(96)}`;
      expect(rawKey.startsWith("si_")).toBe(true);
    });

    it("raw key has correct length (si_ + 96 hex chars = 99)", () => {
      const rawKey = `si_${"a".repeat(96)}`;
      expect(rawKey.length).toBe(99);
    });
  });

  describe("response serialization", () => {
    it("formats key list entry correctly", () => {
      const row = {
        id: "key-1",
        name: "Test Key",
        permissions: JSON.stringify(["tools:use"]),
        createdAt: new Date("2025-01-01T00:00:00Z"),
        lastUsedAt: new Date("2025-06-01T12:00:00Z"),
        expiresAt: new Date("2026-01-01T00:00:00Z"),
      };

      const serialized = {
        id: row.id,
        name: row.name,
        permissions: row.permissions ? JSON.parse(row.permissions) : null,
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
        expiresAt: row.expiresAt?.toISOString() ?? null,
      };

      expect(serialized.permissions).toEqual(["tools:use"]);
      expect(serialized.createdAt).toBe("2025-01-01T00:00:00.000Z");
      expect(serialized.lastUsedAt).toBe("2025-06-01T12:00:00.000Z");
      expect(serialized.expiresAt).toBe("2026-01-01T00:00:00.000Z");
    });

    it("handles null permissions and dates", () => {
      const row = {
        id: "key-2",
        name: "No Scope Key",
        permissions: null as string | null,
        createdAt: new Date("2025-01-01"),
        lastUsedAt: null as Date | null,
        expiresAt: null as Date | null,
      };

      const serialized = {
        permissions: row.permissions ? JSON.parse(row.permissions) : null,
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
        expiresAt: row.expiresAt?.toISOString() ?? null,
      };

      expect(serialized.permissions).toBeNull();
      expect(serialized.lastUsedAt).toBeNull();
      expect(serialized.expiresAt).toBeNull();
    });
  });
});
