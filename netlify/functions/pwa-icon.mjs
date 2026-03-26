import { deflateSync } from 'node:zlib';

const COLOR_BG_START = [0x35, 0x5f, 0x8c];
const COLOR_BG_END = [0x2d, 0x54, 0x7c];
const COLOR_ORANGE = [0xff, 0x7c, 0x35];
const COLOR_CREAM = [0xf8, 0xf5, 0xef];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function makeIconPixels(size, maskable = false) {
  const pixelBytes = Buffer.alloc(size * size * 4);
  const center = size / 2;
  const circleRadius = size * (176 / 512);
  const cornerRadius = maskable ? 0 : size * (108 / 512);
  const scale = size / 512;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = ((x / (size - 1)) + (y / (size - 1))) / 2;
      let r = Math.round(COLOR_BG_START[0] * (1 - t) + COLOR_BG_END[0] * t);
      let g = Math.round(COLOR_BG_START[1] * (1 - t) + COLOR_BG_END[1] * t);
      let b = Math.round(COLOR_BG_START[2] * (1 - t) + COLOR_BG_END[2] * t);
      let a = 255;

      if (!maskable && cornerRadius > 0) {
        const right = size - 1 - x;
        const bottom = size - 1 - y;
        const inTopLeft = x < cornerRadius && y < cornerRadius;
        const inTopRight = x > size - 1 - cornerRadius && y < cornerRadius;
        const inBottomLeft = x < cornerRadius && y > size - 1 - cornerRadius;
        const inBottomRight = x > size - 1 - cornerRadius && y > size - 1 - cornerRadius;

        if (inTopLeft && (((x - cornerRadius) ** 2 + (y - cornerRadius) ** 2) > cornerRadius ** 2)) a = 0;
        if (inTopRight && (((right - cornerRadius) ** 2 + (y - cornerRadius) ** 2) > cornerRadius ** 2)) a = 0;
        if (inBottomLeft && (((x - cornerRadius) ** 2 + (bottom - cornerRadius) ** 2) > cornerRadius ** 2)) a = 0;
        if (inBottomRight && (((right - cornerRadius) ** 2 + (bottom - cornerRadius) ** 2) > cornerRadius ** 2)) a = 0;
      }

      const dx = x + 0.5 - center;
      const dy = y + 0.5 - center;
      if ((dx * dx) + (dy * dy) <= circleRadius * circleRadius) {
        [r, g, b] = COLOR_ORANGE;
        a = 255;
      }

      const inE = (
        (x >= 172 * scale && x < 224 * scale && y >= 160 * scale && y < 352 * scale) ||
        (x >= 224 * scale && x < 360 * scale && y >= 160 * scale && y < 204 * scale) ||
        (x >= 224 * scale && x < 336 * scale && y >= 234 * scale && y < 278 * scale) ||
        (x >= 224 * scale && x < 360 * scale && y >= 308 * scale && y < 352 * scale)
      );

      if (inE) {
        [r, g, b] = COLOR_CREAM;
        a = 255;
      }

      const offset = (y * size + x) * 4;
      pixelBytes[offset] = r;
      pixelBytes[offset + 1] = g;
      pixelBytes[offset + 2] = b;
      pixelBytes[offset + 3] = a;
    }
  }

  return pixelBytes;
}

function encodePng(size, maskable = false) {
  const pixels = makeIconPixels(size, maskable);
  const scanlineLength = size * 4;
  const raw = Buffer.alloc((scanlineLength + 1) * size);

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (scanlineLength + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * scanlineLength, (y + 1) * scanlineLength);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const compressed = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function normalizeSize(value) {
  const parsed = Number.parseInt(String(value || '180'), 10);
  if ([180, 192, 512].includes(parsed)) return parsed;
  return 180;
}

export default async () => {
  return { statusCode: 405, body: 'Method Not Allowed' };
};

export async function handler(event) {
  const size = normalizeSize(event.queryStringParameters?.size);
  const variant = String(event.queryStringParameters?.variant || 'default');
  const maskable = variant === 'maskable';
  const image = encodePng(size, maskable);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable'
    },
    isBase64Encoded: true,
    body: image.toString('base64')
  };
}
