const QOI_MAGIC = 0x716f6966; // "qoif"
const QOI_OP_INDEX = 0x00;
const QOI_OP_DIFF = 0x40;
const QOI_OP_LUMA = 0x80;
const QOI_OP_RUN = 0xc0;
const QOI_OP_RGB = 0xfe;
const QOI_OP_RGBA = 0xff;
const QOI_END_MARKER = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]);

function hash(r: number, g: number, b: number, a: number): number {
  return (r * 3 + g * 5 + b * 7 + a * 11) % 64;
}

export interface QoiHeader {
  width: number;
  height: number;
  channels: 3 | 4;
  colorspace: 0 | 1;
}

export function qoiDecode(data: Uint8Array): { header: QoiHeader; pixels: Uint8Array } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(0) !== QOI_MAGIC) throw new Error("Not a QOI file");

  const width = view.getUint32(4);
  const height = view.getUint32(8);
  const channels = data[12] as 3 | 4;
  const colorspace = data[13] as 0 | 1;

  if (width === 0 || height === 0) throw new Error("Invalid QOI dimensions");
  if (channels !== 3 && channels !== 4) throw new Error("Invalid QOI channels");

  const totalPixels = width * height;
  const pixels = new Uint8Array(totalPixels * 4);
  const index = new Uint8Array(64 * 4);

  let r = 0,
    g = 0,
    b = 0,
    a = 255;
  let pos = 14;
  let px = 0;

  while (px < totalPixels) {
    const byte = data[pos++];

    if (byte === QOI_OP_RGB) {
      r = data[pos++];
      g = data[pos++];
      b = data[pos++];
    } else if (byte === QOI_OP_RGBA) {
      r = data[pos++];
      g = data[pos++];
      b = data[pos++];
      a = data[pos++];
    } else {
      const op = byte & 0xc0;
      if (op === QOI_OP_INDEX) {
        const idx = (byte & 0x3f) * 4;
        r = index[idx];
        g = index[idx + 1];
        b = index[idx + 2];
        a = index[idx + 3];
      } else if (op === QOI_OP_DIFF) {
        r = (r + ((byte >> 4) & 0x03) - 2) & 0xff;
        g = (g + ((byte >> 2) & 0x03) - 2) & 0xff;
        b = (b + (byte & 0x03) - 2) & 0xff;
      } else if (op === QOI_OP_LUMA) {
        const b2 = data[pos++];
        const dg = (byte & 0x3f) - 32;
        r = (r + dg + ((b2 >> 4) & 0x0f) - 8) & 0xff;
        g = (g + dg) & 0xff;
        b = (b + dg + (b2 & 0x0f) - 8) & 0xff;
      } else {
        // QOI_OP_RUN
        let run = (byte & 0x3f) + 1;
        while (run-- > 0 && px < totalPixels) {
          const off = px * 4;
          pixels[off] = r;
          pixels[off + 1] = g;
          pixels[off + 2] = b;
          pixels[off + 3] = a;
          px++;
        }
        const h = hash(r, g, b, a) * 4;
        index[h] = r;
        index[h + 1] = g;
        index[h + 2] = b;
        index[h + 3] = a;
        continue;
      }
    }

    const h = hash(r, g, b, a) * 4;
    index[h] = r;
    index[h + 1] = g;
    index[h + 2] = b;
    index[h + 3] = a;
    const off = px * 4;
    pixels[off] = r;
    pixels[off + 1] = g;
    pixels[off + 2] = b;
    pixels[off + 3] = a;
    px++;
  }

  return { header: { width, height, channels, colorspace }, pixels };
}

export function qoiEncode(
  pixels: Uint8Array,
  width: number,
  height: number,
  channels: 3 | 4 = 4,
): Uint8Array {
  const maxSize = 14 + width * height * (channels + 1) + QOI_END_MARKER.length;
  const out = new Uint8Array(maxSize);
  const view = new DataView(out.buffer);

  view.setUint32(0, QOI_MAGIC);
  view.setUint32(4, width);
  view.setUint32(8, height);
  out[12] = channels;
  out[13] = 0; // sRGB

  const index = new Uint8Array(64 * 4);
  let pos = 14;
  let prevR = 0,
    prevG = 0,
    prevB = 0,
    prevA = 255;
  let run = 0;
  const totalPixels = width * height;

  for (let px = 0; px < totalPixels; px++) {
    const off = px * channels;
    const r = pixels[off];
    const g = pixels[off + 1];
    const b = pixels[off + 2];
    const a = channels === 4 ? pixels[off + 3] : 255;

    if (r === prevR && g === prevG && b === prevB && a === prevA) {
      run++;
      if (run === 62 || px === totalPixels - 1) {
        out[pos++] = QOI_OP_RUN | (run - 1);
        run = 0;
      }
      continue;
    }

    if (run > 0) {
      out[pos++] = QOI_OP_RUN | (run - 1);
      run = 0;
    }

    const h = hash(r, g, b, a);
    const idx = h * 4;

    if (index[idx] === r && index[idx + 1] === g && index[idx + 2] === b && index[idx + 3] === a) {
      out[pos++] = QOI_OP_INDEX | h;
    } else {
      index[idx] = r;
      index[idx + 1] = g;
      index[idx + 2] = b;
      index[idx + 3] = a;

      if (a !== prevA) {
        out[pos++] = QOI_OP_RGBA;
        out[pos++] = r;
        out[pos++] = g;
        out[pos++] = b;
        out[pos++] = a;
      } else {
        const dr = r - prevR;
        const dg = g - prevG;
        const db = b - prevB;
        const drDg = dr - dg;
        const dbDg = db - dg;

        if (dr > -3 && dr < 2 && dg > -3 && dg < 2 && db > -3 && db < 2) {
          out[pos++] = QOI_OP_DIFF | ((dr + 2) << 4) | ((dg + 2) << 2) | (db + 2);
        } else if (dg > -33 && dg < 32 && drDg > -9 && drDg < 8 && dbDg > -9 && dbDg < 8) {
          out[pos++] = QOI_OP_LUMA | (dg + 32);
          out[pos++] = ((drDg + 8) << 4) | (dbDg + 8);
        } else {
          out[pos++] = QOI_OP_RGB;
          out[pos++] = r;
          out[pos++] = g;
          out[pos++] = b;
        }
      }
    }

    prevR = r;
    prevG = g;
    prevB = b;
    prevA = a;
  }

  out.set(QOI_END_MARKER, pos);
  pos += QOI_END_MARKER.length;
  return out.slice(0, pos);
}
