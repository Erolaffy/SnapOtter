import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors } from "../../lib/errors.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { createWorkspace } from "../../lib/workspace.js";
import { updateSingleFileProgress } from "../progress.js";
import { registerToolProcessFn } from "../tool-factory.js";

const TOOL_ID = "transparency-fixer";

const CHROMA_OPAQUE = 35;
const CHROMA_TRANSPARENT = 8;
const GRAY_LOW = 120;
const GRAY_HIGH = 230;

const settingsSchema = z.object({
  defringe: z.number().min(0).max(100).optional().default(30),
  outputFormat: z.enum(["png", "webp"]).optional().default("png"),
  removeWatermark: z.boolean().optional().default(false),
});

async function applyDefringe(buffer: Buffer, intensity: number): Promise<Buffer> {
  if (intensity <= 0) return buffer;

  const img = sharp(buffer);
  const { width, height, channels } = await img.metadata();
  if (!width || !height || channels !== 4) return buffer;

  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;

  const alpha = Buffer.alloc(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    alpha[i] = data[i * 4 + 3];
  }

  const blurRadius = Math.max(0.3, Math.round(intensity / 20));
  const blurredAlphaRaw = await sharp(alpha, {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .blur(blurRadius)
    .raw()
    .toBuffer();

  const threshold = Math.round(128 + (intensity / 100) * 80);
  const result = Buffer.from(data);
  for (let i = 0; i < pixelCount; i++) {
    if (alpha[i] > 0 && blurredAlphaRaw[i] < threshold) {
      result[i * 4] = 0;
      result[i * 4 + 1] = 0;
      result[i * 4 + 2] = 0;
      result[i * 4 + 3] = 0;
    }
  }

  return sharp(result, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

async function fixCheckerboardTransparency(buffer: Buffer): Promise<Buffer> {
  const img = sharp(buffer).ensureAlpha();
  const meta = await img.metadata();
  if (!meta.width || !meta.height) return buffer;

  const { width, height } = meta;
  const rgba = await img.raw().toBuffer();
  const flat = await sharp(buffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .raw()
    .toBuffer();

  const pixelCount = width * height;
  const result = Buffer.alloc(pixelCount * 4);

  for (let i = 0; i < pixelCount; i++) {
    const r = flat[i * 3];
    const g = flat[i * 3 + 1];
    const b = flat[i * 3 + 2];
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const chroma = maxC - minC;
    const gray = (r + g + b) / 3;

    let a: number;
    if (chroma >= CHROMA_OPAQUE) {
      a = 255;
    } else if (chroma <= CHROMA_TRANSPARENT && gray > GRAY_LOW && gray < GRAY_HIGH) {
      a = 0;
    } else {
      a = Math.round(
        Math.min(
          1,
          Math.max(0, (chroma - CHROMA_TRANSPARENT) / (CHROMA_OPAQUE - CHROMA_TRANSPARENT)),
        ) * 255,
      );
    }

    result[i * 4] = rgba[i * 4];
    result[i * 4 + 1] = rgba[i * 4 + 1];
    result[i * 4 + 2] = rgba[i * 4 + 2];
    result[i * 4 + 3] = a;
  }

  return sharp(result, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

async function processTransparencyFix(
  inputBuffer: Buffer,
  settings: z.infer<typeof settingsSchema>,
  _outputDir: string,
  onProgress?: (percent: number, stage: string) => void,
): Promise<Buffer> {
  let workingBuffer = inputBuffer;

  if (settings.removeWatermark) {
    onProgress?.(5, "Removing watermark...");
    workingBuffer = await sharp(workingBuffer).median(5).toBuffer();
  }

  onProgress?.(20, "Detecting checkerboard...");
  let resultBuffer = await fixCheckerboardTransparency(workingBuffer);

  onProgress?.(70, "Cleaning edges...");
  resultBuffer = await applyDefringe(resultBuffer, settings.defringe);

  if (settings.outputFormat === "webp") {
    resultBuffer = await sharp(resultBuffer).webp({ lossless: true }).toBuffer();
  }

  onProgress?.(100, "Done");
  return resultBuffer;
}

export function registerTransparencyFixer(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/transparency-fixer",
    async (request: FastifyRequest, reply: FastifyReply) => {
      let fileBuffer: Buffer | null = null;
      let filename = "image";
      let settingsRaw: string | null = null;
      let clientJobId: string | null = null;

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) chunks.push(chunk);
            fileBuffer = Buffer.concat(chunks);
            filename = sanitizeFilename(part.filename ?? "image");
          } else if (part.fieldname === "settings") {
            settingsRaw = part.value as string;
          } else if (part.fieldname === "clientJobId") {
            const raw = part.value as string;
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
              clientJobId = raw;
            }
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse multipart request",
          details: err instanceof Error ? err.message : String(err),
        });
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      const validation = await validateImageBuffer(fileBuffer, filename);
      if (!validation.valid) {
        return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
      }

      let settings: z.infer<typeof settingsSchema>;
      try {
        const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
        const result = settingsSchema.safeParse(parsed);
        if (!result.success) {
          return reply
            .status(400)
            .send({ error: "Invalid settings", details: formatZodErrors(result.error.issues) });
        }
        settings = result.data;
      } catch {
        return reply.status(400).send({ error: "Settings must be valid JSON" });
      }

      try {
        if (validation.format === "heif") {
          fileBuffer = await decodeHeic(fileBuffer);
          const ext = filename.match(/\.[^.]+$/)?.[0];
          if (ext) filename = `${filename.slice(0, -ext.length)}.png`;
        }

        if (needsCliDecode(validation.format)) {
          fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format);
          const ext = filename.match(/\.[^.]+$/)?.[0];
          if (ext) filename = `${filename.slice(0, -ext.length)}.png`;
        }

        fileBuffer = await autoOrient(fileBuffer);
      } catch (err) {
        request.log.error({ err, toolId: TOOL_ID }, "Input decoding failed");
        return reply.status(422).send({
          error: "Transparency fix failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }

      const originalSize = fileBuffer.length;
      const jobId = randomUUID();
      const progressJobId = clientJobId || jobId;
      let workspacePath: string;
      try {
        workspacePath = await createWorkspace(jobId);
        const inputPath = join(workspacePath, "input", filename);
        await writeFile(inputPath, fileBuffer);
      } catch (err) {
        request.log.error({ err, toolId: TOOL_ID }, "Workspace creation failed");
        return reply.status(422).send({
          error: "Transparency fix failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }

      const log = request.log;
      log.info({ toolId: TOOL_ID, imageSize: originalSize }, "Starting transparency fix");

      const outputExt = settings.outputFormat === "webp" ? "webp" : "png";

      const onProgress = (percent: number, stage: string) => {
        updateSingleFileProgress({
          jobId: progressJobId,
          phase: "processing",
          stage,
          percent: Math.min(percent, 95),
        });
      };

      // Processing is fast (no AI model), but keep async pattern for consistency
      reply.status(202).send({ jobId: progressJobId, async: true });

      (async () => {
        const resultBuffer = await processTransparencyFix(
          fileBuffer,
          settings,
          join(workspacePath, "output"),
          onProgress,
        );

        const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_fixed.${outputExt}`;
        await writeFile(join(workspacePath, "output", outputFilename), resultBuffer);

        const downloadUrl = `/api/v1/download/${jobId}/${encodeURIComponent(outputFilename)}`;

        updateSingleFileProgress({
          jobId: progressJobId,
          phase: "complete",
          percent: 100,
          result: {
            jobId,
            downloadUrl,
            originalSize,
            processedSize: resultBuffer.length,
            filename,
          },
        });

        log.info({ toolId: TOOL_ID, jobId, downloadUrl }, "Transparency fix complete");
      })().catch((err) => {
        log.error({ err, toolId: TOOL_ID }, "Transparency fix failed");
        updateSingleFileProgress({
          jobId: progressJobId,
          phase: "failed",
          percent: 0,
          error: err instanceof Error ? err.message : "Transparency fix failed",
        });
      });
    },
  );

  registerToolProcessFn({
    toolId: TOOL_ID,
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const s = settings as z.infer<typeof settingsSchema>;
      const orientedBuffer = await autoOrient(inputBuffer);
      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);

      const resultBuffer = await processTransparencyFix(
        orientedBuffer,
        s,
        join(workspacePath, "output"),
      );

      const outputExt = s.outputFormat === "webp" ? "webp" : "png";
      const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_fixed.${outputExt}`;
      const contentType = outputExt === "webp" ? "image/webp" : "image/png";
      return { buffer: resultBuffer, filename: outputFilename, contentType };
    },
  });
}
