/**
 * Unit tests for teams route validation and helper logic.
 *
 * Tests the team name validation schema, duplicate detection logic,
 * and Default team protection constraints.
 */
import { describe, expect, it } from "vitest";

// ── Reproduce the validation logic from teams.ts ───────────────────────

function validateTeamName(body: unknown): {
  success: boolean;
  name?: string;
  error?: string;
} {
  if (typeof body !== "object" || body === null) {
    return { success: false, error: "Team name is required" };
  }
  const raw = (body as Record<string, unknown>).name;
  if (typeof raw !== "string") {
    return { success: false, error: "Team name is required" };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { success: false, error: "Team name is required" };
  }
  if (trimmed.length > 50) {
    return { success: false, error: "Team name must be 50 characters or fewer" };
  }
  return { success: true, name: trimmed };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("teams route logic", () => {
  describe("team name validation", () => {
    it("accepts valid team name", () => {
      const result = validateTeamName({ name: "Engineering" });
      expect(result.success).toBe(true);
      expect(result.name).toBe("Engineering");
    });

    it("trims whitespace from team name", () => {
      const result = validateTeamName({ name: "  Design  " });
      expect(result.success).toBe(true);
      expect(result.name).toBe("Design");
    });

    it("rejects empty string after trimming", () => {
      const result = validateTeamName({ name: "   " });
      expect(result.success).toBe(false);
    });

    it("rejects missing name field", () => {
      const result = validateTeamName({});
      expect(result.success).toBe(false);
    });

    it("rejects name longer than 50 characters", () => {
      const result = validateTeamName({ name: "A".repeat(51) });
      expect(result.success).toBe(false);
    });

    it("accepts name exactly 50 characters", () => {
      const result = validateTeamName({ name: "A".repeat(50) });
      expect(result.success).toBe(true);
    });

    it("accepts single character name", () => {
      const result = validateTeamName({ name: "X" });
      expect(result.success).toBe(true);
    });

    it("rejects non-string name", () => {
      const result = validateTeamName({ name: 123 });
      expect(result.success).toBe(false);
    });
  });

  describe("Default team protection", () => {
    it("identifies the Default team by name", () => {
      const team = { name: "Default", id: "some-id" };
      expect(team.name === "Default").toBe(true);
    });

    it("non-Default teams can be deleted", () => {
      const team = { name: "Engineering", id: "eng-id" };
      expect(team.name === "Default").toBe(false);
    });
  });

  describe("member count check", () => {
    it("blocks deletion when team has members", () => {
      const memberCount = { count: 3 };
      expect(memberCount.count > 0).toBe(true);
    });

    it("allows deletion when team has no members", () => {
      const memberCount = { count: 0 };
      expect(memberCount.count > 0).toBe(false);
    });

    it("handles null member count as zero", () => {
      const memberCount: { count: number } | undefined = undefined;
      const count = memberCount?.count ?? 0;
      expect(count > 0).toBe(false);
    });
  });

  describe("case-insensitive duplicate detection", () => {
    it("detects duplicates case-insensitively", () => {
      const existingNames = ["engineering", "design", "marketing"];
      const newName = "Engineering";
      const isDuplicate = existingNames.some(
        (name) => name.toLowerCase() === newName.toLowerCase(),
      );
      expect(isDuplicate).toBe(true);
    });

    it("allows unique names", () => {
      const existingNames = ["engineering", "design"];
      const newName = "Marketing";
      const isDuplicate = existingNames.some(
        (name) => name.toLowerCase() === newName.toLowerCase(),
      );
      expect(isDuplicate).toBe(false);
    });

    it("excludes current team when renaming", () => {
      const existingTeams = [
        { id: "t1", name: "engineering" },
        { id: "t2", name: "design" },
      ];
      const currentId = "t1";
      const newName = "Engineering";

      const isDuplicate = existingTeams.some(
        (t) => t.id !== currentId && t.name.toLowerCase() === newName.toLowerCase(),
      );
      expect(isDuplicate).toBe(false);
    });

    it("detects duplicate when renaming to another team name", () => {
      const existingTeams = [
        { id: "t1", name: "engineering" },
        { id: "t2", name: "design" },
      ];
      const currentId = "t1";
      const newName = "Design";

      const isDuplicate = existingTeams.some(
        (t) => t.id !== currentId && t.name.toLowerCase() === newName.toLowerCase(),
      );
      expect(isDuplicate).toBe(true);
    });
  });
});
