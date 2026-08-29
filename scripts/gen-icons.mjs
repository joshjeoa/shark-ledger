/**
 * 纯 Node 生成 PWA 图标（无外部依赖）：
 * public/pwa-192.png、public/pwa-512.png、public/apple-touch-icon.png
 * 图案：iOS 系统蓝圆角方块 + 白色 ¥ 符号（与品牌一致）
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
mkdirSync(publicDir, { recursive: true });

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- 绘图 ----------
function drawIcon(size, transparentCorners) {
  const px = Buffer.alloc(size * size * 4); // 全透明
  const bg = [0x00, 0x7a, 0xff, 0xff]; // #007AFF（iOS 系统蓝）
  const fg = [0xff, 0xff, 0xff, 0xff]; // 白色 ¥
  const r = size * 0.22;

  const inRoundRect = (x, y) => {
    if (!transparentCorners) return true;
    const cx = Math.min(Math.max(x, r), size - r);
    const cy = Math.min(Math.max(y, r), size - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };

  // ¥ 符号线段（比例坐标）
  const c = size / 2;
  const strokes = [
    [c - size * 0.17, size * 0.26, c, size * 0.46], // 左斜臂
    [c + size * 0.17, size * 0.26, c, size * 0.46], // 右斜臂
    [c, size * 0.46, c, size * 0.76], // 竖干
    [c - size * 0.13, size * 0.52, c + size * 0.13, size * 0.52], // 横杠 1
    [c - size * 0.13, size * 0.62, c + size * 0.13, size * 0.62], // 横杠 2
  ];
  const thickness = size * 0.058;

  const put = (x, y, color) => {
    const i = (Math.round(y) * size + Math.round(x)) * 4;
    px[i] = color[0];
    px[i + 1] = color[1];
    px[i + 2] = color[2];
    px[i + 3] = color[3];
  };

  // 背景圆角矩形
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inRoundRect(x + 0.5, y + 0.5)) put(x, y, bg);
    }
  }

  // 线段以圆头刷笔画出
  const stamp = (x, y) => {
    const rad = thickness / 2;
    const x0 = Math.max(0, Math.floor(x - rad));
    const x1 = Math.min(size - 1, Math.ceil(x + rad));
    const y0 = Math.max(0, Math.floor(y - rad));
    const y1 = Math.min(size - 1, Math.ceil(y + rad));
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= rad * rad) put(xx, yy, fg);
      }
    }
  };

  for (const [x0, y0, x1, y1] of strokes) {
    const len = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
    const steps = Math.ceil(len);
    for (let i = 0; i <= steps; i++) {
      stamp(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
    }
  }

  return px;
}

const targets = [
  { file: 'pwa-192.png', size: 192, transparentCorners: false },
  { file: 'pwa-512.png', size: 512, transparentCorners: false },
  { file: 'apple-touch-icon.png', size: 180, transparentCorners: false },
];

for (const t of targets) {
  const png = encodePNG(t.size, drawIcon(t.size, t.transparentCorners));
  writeFileSync(join(publicDir, t.file), png);
  console.log(`✔ ${t.file} (${t.size}x${t.size}, ${png.length} bytes)`);
}
