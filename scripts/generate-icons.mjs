import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const palette = {
  navy: [0, 49, 114, 255],
  navyDark: [0, 38, 90, 255],
  red: [220, 38, 38, 255],
  white: [255, 255, 255, 255],
  clear: [0, 0, 0, 0],
};

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return output;
}

function png(size, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const start = y * (size * 4 + 1);
    rows[start] = 0;
    pixels.copy(rows, start + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function roundedRect(x, y, left, top, right, bottom, radius) {
  const cx = Math.max(left + radius, Math.min(x, right - radius));
  const cy = Math.max(top + radius, Math.min(y, bottom - radius));
  return Math.hypot(x - cx, y - cy) <= radius;
}

function distanceToSegment(x, y, [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared)) : 0;
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function onStroke(x, y, points, width) {
  for (let index = 1; index < points.length; index += 1) {
    if (distanceToSegment(x, y, points[index - 1], points[index]) <= width / 2) return true;
  }
  return false;
}

const lowerLink = [[19.5, 29.5], [16.5, 32.5], [15.2, 33.6], [13.5, 34], [11.8, 33.5], [10.3, 32], [9.8, 30.3], [10.2, 28.5], [11.3, 27], [14.5, 23], [15.6, 21.6], [17.2, 20.8], [19, 20.8], [20.5, 21.5], [21.5, 22.5]];
const upperLink = [[28.5, 18.5], [31.5, 15.5], [32.6, 14.4], [34.2, 13.8], [36, 14.2], [37.5, 15.5], [38.2, 17.2], [37.8, 19], [36.7, 20.5], [33.5, 24.5], [32.4, 25.9], [30.8, 26.7], [29, 26.7], [27.5, 26], [26.5, 25]];

function sample(x, y, maskable) {
  let color = palette.clear;
  if (maskable) color = palette.navy;
  else if (roundedRect(x, y, 1, 1, 47, 47, 14)) color = palette.navyDark;
  if (!maskable && roundedRect(x, y, 2, 2, 46, 46, 13)) color = palette.navy;

  const insideBase = maskable || roundedRect(x, y, 1, 1, 47, 47, 14);
  if (insideBase && (onStroke(x, y, lowerLink, 3.5) || onStroke(x, y, upperLink, 3.5) || distanceToSegment(x, y, [17, 31], [31, 17]) <= 1.75)) color = palette.white;

  const badgeDistance = Math.hypot(x - 35, y - 13);
  if (badgeDistance <= 7.5) color = palette.white;
  if (badgeDistance <= 6.5) color = palette.red;
  if (distanceToSegment(x, y, [35, 9.75], [35, 16.25]) <= 1 || distanceToSegment(x, y, [31.75, 13], [38.25, 13]) <= 1) color = palette.white;
  return color;
}

function render(size, maskable = false) {
  const samples = 3;
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const x = ((px + (sx + 0.5) / samples) / size) * 48;
          const y = ((py + (sy + 0.5) / samples) / size) * 48;
          const color = sample(x, y, maskable);
          for (let channel = 0; channel < 4; channel += 1) sum[channel] += color[channel];
        }
      }
      const index = (py * size + px) * 4;
      for (let channel = 0; channel < 4; channel += 1) pixels[index + channel] = Math.round(sum[channel] / (samples * samples));
    }
  }
  return png(size, pixels);
}

writeFileSync('public/icons/icon-192.png', render(192));
writeFileSync('public/icons/icon-512.png', render(512));
writeFileSync('public/icons/icon-maskable-512.png', render(512, true));
