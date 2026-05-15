import { existsSync } from "node:fs";
import { mkdir, rm, statfs } from "node:fs/promises";
import { join } from "node:path";
import { env } from "../config.js";

/**
 * Check available disk space before creating a workspace.
 * Triggers cleanup if free space is low, and rejects with 503 if
 * space remains critically low after cleanup.
 */
async function checkWorkspaceCapacity(workspaceRoot: string): Promise<void> {
  if (!existsSync(workspaceRoot)) return;

  let fsStats: Awaited<ReturnType<typeof statfs>>;
  try {
    fsStats = await statfs(workspaceRoot);
  } catch {
    return;
  }
  const freeBytes = fsStats.bavail * fsStats.bsize;
  const freeGB = freeBytes / 1024 ** 3;

  if (freeGB < 1) {
    // Attempt to reclaim space by cleaning up old workspaces
    const { readdir, stat: fsStat } = await import("node:fs/promises");
    const entries = await readdir(workspaceRoot, { withFileTypes: true }).catch(() => []);
    const now = Date.now();
    for (const entry of entries) {
      const fullPath = join(workspaceRoot, entry.name);
      try {
        const s = await fsStat(fullPath);
        // Remove workspaces older than 1 hour during emergency cleanup
        if (now - s.mtimeMs > 60 * 60 * 1000) {
          await rm(fullPath, { recursive: true, force: true });
        }
      } catch {
        // Skip entries that can't be stat'd
      }
    }

    // Recheck after cleanup
    let recheckStats: Awaited<ReturnType<typeof statfs>>;
    try {
      recheckStats = await statfs(workspaceRoot);
    } catch {
      return;
    }
    const freeGB2 = (recheckStats.bavail * recheckStats.bsize) / 1024 ** 3;
    if (freeGB2 < 0.5) {
      const error = new Error("Insufficient disk space for processing");
      (error as Error & { statusCode: number }).statusCode = 503;
      throw error;
    }
  }
}

/**
 * Create a workspace directory structure for a processing job.
 * Returns the workspace root path.
 */
export async function createWorkspace(jobId: string): Promise<string> {
  await checkWorkspaceCapacity(env.WORKSPACE_PATH);
  const root = getWorkspacePath(jobId);
  await mkdir(join(root, "input"), { recursive: true });
  await mkdir(join(root, "output"), { recursive: true });
  return root;
}

/**
 * Get the workspace root path for a job.
 */
export function getWorkspacePath(jobId: string): string {
  if (jobId.includes("..") || jobId.includes("/") || jobId.includes("\\") || jobId.includes("\0")) {
    throw new Error("Invalid job ID");
  }
  return join(env.WORKSPACE_PATH, jobId);
}

/**
 * Remove the entire workspace directory for a job.
 */
export async function cleanupWorkspace(jobId: string): Promise<void> {
  const root = getWorkspacePath(jobId);
  await rm(root, { recursive: true, force: true });
}
