import { extname } from "node:path";
import { convert } from "@snapotter/image-engine";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { encodeBmp, encodeIco, encodeJp2, encodeQoi } from "../../lib/format-encoders.js";
import { encodeHeic } from "../../lib/heic-converter.js";
import { isSvgBuffer } from "../../lib/svg-sanitize.js";
import { createToolRoute } from "../tool-factory.js";

const FORMAT_CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  tiff: "image/tiff",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  jxl: "image/jxl",
  bmp: "image/bmp",
  ico: "image/x-icon",
  jp2: "image/jp2",
  qoi: "image/x-qoi",
};

const CLI_ENCODERS: Record<string, (buf: Buffer, quality?: number) => Promise<Buffer>> = {
  bmp: encodeBmp,
  ico: encodeIco,
  jp2: encodeJp2,
  qoi: encodeQoi,
};

const settingsSchema = z.object({
  format: z.enum([
    "jpg",
    "png",
    "webp",
    "avif",
    "tiff",
    "gif",
    "heic",
    "heif",
    "jxl",
    "bmp",
    "ico",
    "jp2",
    "qoi",
  ]),
  quality: z.number().min(1).max(100).optional(),
});

export function registerConvert(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "convert",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      // CLI-encoded formats bypass Sharp entirely
      const cliEncoder = CLI_ENCODERS[settings.format];
      if (cliEncoder) {
        const outputBuffer = await cliEncoder(inputBuffer, settings.quality);
        const ext = extname(filename);
        const baseName = ext ? filename.slice(0, -ext.length) : filename;
        const contentType = FORMAT_CONTENT_TYPES[settings.format] || "application/octet-stream";
        return {
          buffer: outputBuffer,
          filename: `${baseName}.${settings.format}`,
          contentType,
        };
      }

      const sharpOpts = isSvgBuffer(inputBuffer) ? { density: 300 } : undefined;
      const image = sharp(inputBuffer, sharpOpts);

      let buffer: Buffer;
      if (settings.format === "heic" || settings.format === "heif") {
        // Sharp cannot encode HEVC. Convert to PNG first, then use heif-enc.
        const pngBuffer = await image.png().toBuffer();
        buffer = await encodeHeic(pngBuffer, settings.quality);
      } else {
        const result = await convert(image, settings);
        buffer = await result.toBuffer();
      }

      // Change filename extension to match the output format
      const ext = extname(filename);
      const baseName = ext ? filename.slice(0, -ext.length) : filename;
      const outputFilename = `${baseName}.${settings.format}`;

      const contentType = FORMAT_CONTENT_TYPES[settings.format] || "application/octet-stream";

      return { buffer, filename: outputFilename, contentType };
    },
  });
}
