// Generates the PWA icons — golden World Cup trophy on a striped grass pitch.
// Zero deps: raw PNG encoding via Node's zlib. Run: node scripts/gen-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

// ---- minimal PNG writer (8-bit RGB) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function png(width, height, pixelAt) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelAt(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- helpers ----
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [
  Math.round(lerp(c1[0], c2[0], t)),
  Math.round(lerp(c1[1], c2[1], t)),
  Math.round(lerp(c1[2], c2[2], t)),
];
const smooth = (t) => t * t * (3 - 2 * t);

// piecewise-smooth half-width profile of the trophy body, in fractions of N
const PROFILE = [
  [0.395, 0.062], // neck just under the globe
  [0.44, 0.118], // shoulders (the figures' backs)
  [0.50, 0.092],
  [0.60, 0.052], // waist
  [0.655, 0.072], // flare into the base
  [0.67, 0.105],
];
function bodyHalfWidth(fy) {
  if (fy < PROFILE[0][0] || fy > PROFILE[PROFILE.length - 1][0]) return 0;
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [y1, w1] = PROFILE[i];
    const [y2, w2] = PROFILE[i + 1];
    if (fy >= y1 && fy <= y2) return lerp(w1, w2, smooth((fy - y1) / (y2 - y1)));
  }
  return 0;
}

function makeIcon(N) {
  const px = 1 / N;
  // pitch greens
  const G_DARK = [21, 128, 61]; // green-700
  const G_LITE = [34, 167, 90];
  // golds
  const GOLD_HI = [253, 224, 71]; // highlight
  const GOLD = [234, 179, 8];
  const GOLD_DK = [161, 98, 7]; // shaded edge
  const MALACHITE = [6, 78, 59]; // the two green bands on the real base
  const SHADOW = [10, 60, 30];

  const cx = 0.5;
  const globe = { x: 0.5, y: 0.295, r: 0.135 };

  // coverage of a circle / band with ~1px anti-aliasing (all in fractions)
  const circ = (fx, fy, c) =>
    clamp01((c.r - Math.hypot(fx - c.x, fy - c.y)) / px + 0.5);
  const band = (fy, y1, y2, fx, hw) => {
    const v = clamp01((Math.min(fy - y1, y2 - fy)) / px + 0.5);
    const h = clamp01((hw - Math.abs(fx - cx)) / px + 0.5);
    return Math.min(v, h);
  };

  // gold with vertical depth + left-side light
  const goldAt = (fx, fy, top, bottom) => {
    const t = clamp01((fy - top) / (bottom - top));
    let c = mix(GOLD_HI, GOLD_DK, t * 0.85 + 0.05);
    const side = clamp01((fx - (cx - 0.16)) / 0.32); // 0 left → 1 right
    c = mix(c, GOLD, side * 0.55);
    return c;
  };

  return png(N, N, (X, Y) => {
    const fx = X / N;
    const fy = Y / N;

    // --- striped pitch ---
    const stripe = Math.floor(fx * 7) % 2 === 0 ? 0 : 1;
    let c = mix(G_DARK, G_LITE, 0.25 + 0.4 * fy + (stripe ? 0.14 : 0));

    // soft shadow ellipse under the trophy
    const sd = Math.hypot((fx - cx) / 0.21, (fy - 0.842) / 0.035);
    if (sd < 1) c = mix(c, SHADOW, 0.5 * (1 - sd));

    // --- trophy ---
    // globe — smooth sphere shading, light from the top-left
    const gl = circ(fx, fy, globe);
    if (gl > 0) {
      let g = goldAt(fx, fy, globe.y - globe.r, globe.y + globe.r + 0.1);
      const dHi = Math.hypot(fx - (globe.x - 0.05), fy - (globe.y - 0.055));
      const hl = clamp01(1 - dHi / (globe.r * 1.5));
      g = mix(g, [255, 244, 184], 0.5 * hl * hl);
      const dSh = Math.hypot(fx - (globe.x + 0.07), fy - (globe.y + 0.08));
      const sh = clamp01(1 - dSh / (globe.r * 1.3));
      g = mix(g, GOLD_DK, 0.3 * sh * sh);
      c = mix(c, g, gl);
    }

    // flowing body
    const hw = bodyHalfWidth(fy);
    if (hw > 0) {
      const hit = clamp01((hw - Math.abs(fx - cx)) / px + 0.5);
      if (hit > 0) c = mix(c, goldAt(fx, fy, 0.395, 0.67), hit);
    }

    // base: gold rim · malachite band · gold rim · malachite · gold foot
    const layers = [
      [0.67, 0.695, 0.112, "gold"],
      [0.695, 0.735, 0.125, "mal"],
      [0.735, 0.755, 0.132, "gold"],
      [0.755, 0.795, 0.142, "mal"],
      [0.795, 0.825, 0.152, "gold"],
    ];
    for (const [y1, y2, hwL, kind] of layers) {
      const hit = band(fy, y1, y2, fx, hwL);
      if (hit > 0)
        c = mix(
          c,
          kind === "mal" ? MALACHITE : goldAt(fx, fy, y1 - 0.05, y2 + 0.05),
          hit,
        );
    }

    return c;
  });
}

mkdirSync("public", { recursive: true });
writeFileSync("public/icon-192.png", makeIcon(192));
writeFileSync("public/icon-512.png", makeIcon(512));
writeFileSync("app/apple-icon.png", makeIcon(180));
console.log("✓ icons written: public/icon-192.png, public/icon-512.png, app/apple-icon.png");
