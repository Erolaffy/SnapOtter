import { colorBlindness } from "@snapotter/image-engine";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  simulationType: z
    .enum([
      "protanopia",
      "deuteranopia",
      "tritanopia",
      "protanomaly",
      "deuteranomaly",
      "tritanomaly",
      "achromatopsia",
      "blueConeMonochromacy",
    ])
    .default("deuteranomaly"),
});

export function registerColorBlindness(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "color-blindness",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const image = sharp(inputBuffer);
      const result = await colorBlindness(image, { type: settings.simulationType });

      const outputFormat = await resolveOutputFormat(inputBuffer, filename);
      const buffer = await result
        .toFormat(outputFormat.format, { quality: outputFormat.quality })
        .toBuffer();

      return { buffer, filename, contentType: outputFormat.contentType };
    },
  });
}
