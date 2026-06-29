import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const iconsetDir = path.resolve("assets/icon.iconset");

const specs = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024]
];

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function writePng(filePath, width, height, pixels) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const scanlineOffset = y * (width * 4 + 1);
    scanlines[scanlineOffset] = 0;
    pixels.copy(scanlines, scanlineOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
  fs.writeFileSync(filePath, png);
}

function setPixel(pixels, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const offset = (Math.floor(y) * size + Math.floor(x)) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

function blendPixel(pixels, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const offset = (Math.floor(y) * size + Math.floor(x)) * 4;
  const alpha = color[3] / 255;
  pixels[offset] = Math.round(color[0] * alpha + pixels[offset] * (1 - alpha));
  pixels[offset + 1] = Math.round(color[1] * alpha + pixels[offset + 1] * (1 - alpha));
  pixels[offset + 2] = Math.round(color[2] * alpha + pixels[offset + 2] * (1 - alpha));
  pixels[offset + 3] = Math.min(255, Math.round(color[3] + pixels[offset + 3] * (1 - alpha)));
}

function roundedRect(pixels, size, x, y, w, h, radius, color) {
  for (let py = Math.floor(y); py < Math.ceil(y + h); py += 1) {
    for (let px = Math.floor(x); px < Math.ceil(x + w); px += 1) {
      const cx = Math.max(x + radius, Math.min(px, x + w - radius));
      const cy = Math.max(y + radius, Math.min(py, y + h - radius));
      const distance = Math.hypot(px - cx, py - cy);
      if (distance <= radius) blendPixel(pixels, size, px, py, color);
    }
  }
}

function rect(pixels, size, x, y, w, h, color) {
  for (let py = Math.floor(y); py < Math.ceil(y + h); py += 1) {
    for (let px = Math.floor(x); px < Math.ceil(x + w); px += 1) {
      blendPixel(pixels, size, px, py, color);
    }
  }
}

function circle(pixels, size, cx, cy, radius, color) {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      if (Math.hypot(x - cx, y - cy) <= radius) blendPixel(pixels, size, x, y, color);
    }
  }
}

function line(pixels, size, x1, y1, x2, y2, width, color) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2;
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    circle(pixels, size, x, y, width / 2, color);
  }
}

function createIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = size / 1024;
  const s = (value) => value * scale;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = (x + y) / (size * 2);
      setPixel(pixels, size, x, y, [
        Math.round(8 + 18 * t),
        Math.round(15 + 32 * t),
        Math.round(20 + 42 * t),
        255
      ]);
    }
  }

  roundedRect(pixels, size, s(86), s(86), s(852), s(852), s(190), [10, 19, 24, 255]);
  roundedRect(pixels, size, s(156), s(204), s(712), s(560), s(54), [18, 32, 39, 255]);
  rect(pixels, size, s(156), s(302), s(712), s(8), [52, 73, 85, 255]);

  circle(pixels, size, s(220), s(254), s(24), [255, 95, 86, 255]);
  circle(pixels, size, s(292), s(254), s(24), [255, 189, 46, 255]);
  circle(pixels, size, s(364), s(254), s(24), [39, 201, 63, 255]);

  line(pixels, size, s(292), s(438), s(398), s(512), s(44), [155, 209, 229, 255]);
  line(pixels, size, s(398), s(512), s(292), s(586), s(44), [155, 209, 229, 255]);
  rect(pixels, size, s(464), s(584), s(190), s(44), [247, 201, 72, 255]);

  roundedRect(pixels, size, s(674), s(402), s(112), s(112), s(56), [68, 199, 114, 255]);
  circle(pixels, size, s(730), s(458), s(31), [17, 24, 28, 90]);

  return pixels;
}

fs.mkdirSync(iconsetDir, { recursive: true });
for (const [fileName, size] of specs) {
  writePng(path.join(iconsetDir, fileName), size, size, createIcon(size));
}

