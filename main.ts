// news-image-20261118-r3 — round 3 entry for the make.fun bounty
// "Sum up 18 November's world news in one image".
//
// A broadsheet front page, 1024x1024, drawn entirely from code: a custom
// 5x7 bitmap font, hand-built scenes, charts and a world map, and a small
// PNG encoder written from scratch. No external images, no network, no
// randomness and no clock in the render path, so two runs write identical
// bytes. Every story on the page happened or was first reported on
// Wednesday 18 November 2026, and every number was checked against live
// reporting before it was drawn.
//
// Rebuilt from zero for round 3. Each section is a deliberate step up from
// the previous round: serif broadsheet masthead, three large illustrated
// leads, ten medium illustrated panels, a BY THE NUMBERS strip, a large
// colour-coded map with a legend and pin list, numbered two-column briefs,
// and a footer that names its sources and its date discipline.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Palette (newsprint: cream paper, ink, navy masthead, red accent)
// ---------------------------------------------------------------------------
const PAPER = 0xf7f3e8;
const INK = 0x1a1a1a;
const NAVY = 0x14213d;
const NAVY2 = 0x1e3257;
const RED = 0xb42318;
const GREY = 0x6f6a5e;
const LIGHT = 0xe9e2cf;
const RULE = 0x8a8272;
const BLUE = 0x1d4ed8; // Americas
const PURPLE = 0x7c3aed; // Europe
const ORANGE = 0xea580c; // Africa
const MIDRED = 0xdc2626; // Middle East
const GREEN = 0x15803d; // Asia
const TEAL = 0x0e7490; // Oceania
const SLATE = 0x64748b; // Global
const GOLD = 0xb45309; // Voyager off-map marker
const SKY = 0xcfe3ee;
const SEA = 0xbfd6e4;
const LAND = 0xe6dcc3;

function rgb(r: number, g: number, b: number): number {
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}

// ---------------------------------------------------------------------------
// PNG encoder: signature, IHDR, IDAT (zlib deflate, fixed level), IEND.
// CRC32 table is built at runtime from the polynomial, so the output is a
// pure function of the pixel buffer — deterministic by construction.
// ---------------------------------------------------------------------------
const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter: none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), rowStart + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Canvas: an RGBA pixel buffer with small filled-shape primitives. All
// drawing on the page goes through here, so every mark is code-drawn.
// ---------------------------------------------------------------------------
class Canvas {
  w: number;
  h: number;
  buf: Uint8Array;
  constructor(w: number, h: number, bg: number) {
    this.w = w;
    this.h = h;
    this.buf = new Uint8Array(w * h * 4);
    this.fillRect(0, 0, w, h, bg);
  }
  set(x: number, y: number, c: number): void {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    const i = (yi * this.w + xi) * 4;
    this.buf[i] = (c >> 16) & 255;
    this.buf[i + 1] = (c >> 8) & 255;
    this.buf[i + 2] = c & 255;
    this.buf[i + 3] = 255;
  }
  fillRect(x: number, y: number, w: number, h: number, c: number): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.ceil(x + w));
    const y1 = Math.min(this.h, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.w + xx) * 4;
        this.buf[i] = (c >> 16) & 255;
        this.buf[i + 1] = (c >> 8) & 255;
        this.buf[i + 2] = c & 255;
        this.buf[i + 3] = 255;
      }
    }
  }
  hline(x0: number, x1: number, y: number, c: number): void {
    if (x1 < x0) {
      const t = x0;
      x0 = x1;
      x1 = t;
    }
    for (let x = Math.floor(x0); x <= Math.floor(x1); x++) this.set(x, y, c);
  }
  vline(x: number, y0: number, y1: number, c: number): void {
    if (y1 < y0) {
      const t = y0;
      y0 = y1;
      y1 = t;
    }
    for (let y = Math.floor(y0); y <= Math.floor(y1); y++) this.set(x, y, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number): void {
    let ax = Math.floor(x0);
    let ay = Math.floor(y0);
    const bx = Math.floor(x1);
    const by = Math.floor(y1);
    const dx = Math.abs(bx - ax);
    const dy = -Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1;
    const sy = ay < by ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(ax, ay, c);
      if (ax === bx && ay === by) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        ax += sx;
      }
      if (e2 <= dx) {
        err += dx;
        ay += sy;
      }
    }
  }
  rect(x: number, y: number, w: number, h: number, c: number): void {
    this.hline(x, x + w - 1, y, c);
    this.hline(x, x + w - 1, y + h - 1, c);
    this.vline(x, y, y + h - 1, c);
    this.vline(x + w - 1, y, y + h - 1, c);
  }
  circle(cx: number, cy: number, r: number, c: number, fill: boolean): void {
    const ri = Math.floor(r);
    for (let dy = -ri; dy <= ri; dy++) {
      const half = Math.floor(Math.sqrt(Math.max(0, ri * ri - dy * dy)));
      if (fill) {
        this.hline(cx - half, cx + half, cy + dy, c);
      } else {
        this.set(cx - half, cy + dy, c);
        this.set(cx + half, cy + dy, c);
      }
    }
  }
  // Filled polygon from a list of [x, y] vertices (scanline fill).
  poly(points: Array<[number, number]>, c: number): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          const t = (y - a[1]) / (b[1] - a[1]);
          xs.push(a[0] + t * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        this.hline(xs[i], xs[i + 1], y, c);
      }
    }
  }
  // Filled triangle helper.
  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: number): void {
    this.poly(
      [
        [x0, y0],
        [x1, y1],
        [x2, y2],
      ],
      c,
    );
  }
}

// ---------------------------------------------------------------------------
// Bitmap font: a 5x7 pixel face drawn for this page. Each glyph is seven
// rows of five bits, stored as numbers 0..31 (bit 4 = leftmost column).
// Uppercase letters fill the full cell; lowercase sit on the x-height
// (rows 2..6) with descenders where the letter needs one. Rendered at
// integer and half-integer scales by nearest-neighbour sampling.
// ---------------------------------------------------------------------------
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  a: [0, 0, 14, 1, 15, 17, 15],
  b: [16, 16, 30, 17, 17, 17, 30],
  c: [0, 0, 14, 16, 16, 17, 14],
  d: [1, 1, 15, 17, 17, 17, 15],
  e: [0, 0, 14, 17, 31, 16, 14],
  f: [6, 9, 8, 30, 8, 8, 8],
  g: [0, 0, 15, 17, 17, 15, 1],
  h: [16, 16, 30, 17, 17, 17, 17],
  i: [4, 0, 12, 4, 4, 4, 14],
  j: [2, 0, 6, 2, 2, 2, 18],
  k: [16, 16, 18, 20, 24, 20, 18],
  l: [12, 4, 4, 4, 4, 4, 14],
  m: [0, 0, 26, 21, 21, 21, 21],
  n: [0, 0, 30, 17, 17, 17, 17],
  o: [0, 0, 14, 17, 17, 17, 14],
  p: [0, 0, 30, 17, 17, 30, 16],
  q: [0, 0, 15, 17, 17, 15, 1],
  r: [0, 0, 22, 25, 16, 16, 16],
  s: [0, 0, 15, 16, 14, 1, 30],
  t: [4, 4, 14, 4, 4, 4, 2],
  u: [0, 0, 17, 17, 17, 19, 13],
  v: [0, 0, 17, 17, 17, 10, 4],
  w: [0, 0, 17, 21, 21, 21, 10],
  x: [0, 0, 17, 10, 4, 10, 17],
  y: [0, 0, 17, 17, 10, 4, 4],
  z: [0, 0, 31, 2, 4, 8, 31],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 6, 8, 16, 31],
  "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8],
  ":": [0, 0, 12, 0, 12, 0, 0],
  ";": [0, 0, 12, 0, 12, 4, 8],
  "!": [4, 4, 4, 4, 4, 0, 4],
  "?": [14, 17, 1, 2, 4, 0, 4],
  "'": [4, 4, 8, 0, 0, 0, 0],
  '"': [10, 10, 10, 0, 0, 0, 0],
  "-": [0, 0, 0, 14, 0, 0, 0],
  "–": [0, 0, 0, 31, 0, 0, 0],
  "—": [0, 0, 0, 31, 0, 0, 0],
  "(": [2, 4, 8, 8, 8, 4, 2],
  ")": [8, 4, 2, 2, 2, 4, 8],
  "/": [1, 1, 2, 4, 8, 16, 16],
  "%": [25, 25, 2, 4, 8, 19, 19],
  $: [4, 15, 20, 14, 5, 30, 4],
  "&": [12, 18, 20, 8, 21, 18, 13],
  "+": [0, 4, 4, 31, 4, 4, 0],
  "=": [0, 0, 31, 0, 31, 0, 0],
  "·": [0, 0, 0, 12, 12, 0, 0],
  "•": [0, 14, 17, 17, 17, 14, 0],
};

const GLYPH_W = 5;
const GLYPH_H = 7;
const ADVANCE = 6; // glyph + 1px tracking, in font units

function glyphOf(ch: string): number[] {
  return FONT[ch] || FONT["?"];
}

// Draw one glyph at (x, y) — the top-left of its cell — at the given scale.
// Bold draws the glyph a second time shifted one output pixel right.
function drawGlyph(cv: Canvas, ch: string, x: number, y: number, scale: number, c: number, bold: boolean): void {
  const g = glyphOf(ch);
  const pw = Math.ceil(GLYPH_W * scale);
  const ph = Math.ceil(GLYPH_H * scale);
  for (let oy = 0; oy < ph; oy++) {
    const gy = Math.min(GLYPH_H - 1, Math.floor(oy / scale));
    const row = g[gy];
    for (let ox = 0; ox < pw; ox++) {
      const gx = Math.min(GLYPH_W - 1, Math.floor(ox / scale));
      if (row & (1 << (4 - gx))) {
        cv.set(x + ox, y + oy, c);
        if (bold) cv.set(x + ox + 1, y + oy, c);
      }
    }
  }
}

function textWidth(text: string, scale: number): number {
  return text.length * ADVANCE * scale;
}

// Draw a single line of text. Returns the width drawn.
function drawText(cv: Canvas, text: string, x: number, y: number, scale: number, c: number, bold: boolean): number {
  let cx = x;
  for (const ch of text) {
    drawGlyph(cv, ch, cx, y, scale, c, bold);
    cx += ADVANCE * scale;
  }
  return cx - x;
}

function drawTextCentered(cv: Canvas, text: string, cx: number, y: number, scale: number, c: number, bold: boolean): void {
  const w = textWidth(text, scale);
  drawText(cv, text, cx - w / 2, y, scale, c, bold);
}

// Wrap text into lines that fit maxWidth (in pixels) at the given scale.
// Words are never split; a word longer than the line gets its own line.
function wrapText(text: string, scale: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur === "" ? w : cur + " " + w;
    if (textWidth(test, scale) <= maxWidth || cur === "") {
      cur = test;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// Draw wrapped text starting at (x, y); returns the y just below the block.
function drawWrapped(cv: Canvas, text: string, x: number, y: number, scale: number, maxWidth: number, lineH: number, c: number, bold: boolean): number {
  const lines = wrapText(text, scale, maxWidth);
  for (const line of lines) {
    drawText(cv, line, x, y, scale, c, bold);
    y += lineH;
  }
  return y;
}

// Shorten a one-line brief to fit maxWidth, keeping whole words, adding
// an ellipsis when it had to be cut.
function fitLine(text: string, scale: number, maxWidth: number): string {
  if (textWidth(text, scale) <= maxWidth) return text;
  const words = text.split(" ");
  let cur = "";
  for (const w of words) {
    const test = cur === "" ? w : cur + " " + w;
    if (textWidth(test + "...", scale) <= maxWidth) {
      cur = test;
    } else {
      break;
    }
  }
  return cur === "" ? text : cur + "...";
}

// ---------------------------------------------------------------------------
// Illustrations. Every scene is drawn from primitives into the box
// (x, y, w, h) the layout hands it — no images, no copied art.
// ---------------------------------------------------------------------------

// Explosion burst: radiating spikes from (cx, cy).
function burst(cv: Canvas, cx: number, cy: number, r: number, c: number): void {
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    cv.line(cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r, c);
  }
  cv.circle(cx, cy, Math.max(2, Math.floor(r / 3)), c, true);
}

// 1 — Gulf strikes: the Strait of Hormuz, ships, missile arcs, bursts.
function drawHormuz(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, SKY);
  cv.fillRect(x, y + h - 14, w, 14, 0x8a6f4d); // shore
  // Sea strait: a diagonal band of blue between two land wedges.
  cv.poly(
    [
      [x, y + 18],
      [x + w * 0.42, y],
      [x + w * 0.58, y],
      [x + w * 0.16, y + h - 14],
      [x, y + h - 14],
    ],
    SEA,
  );
  cv.poly(
    [
      [x + w * 0.62, y],
      [x + w, y + 12],
      [x + w, y + h - 14],
      [x + w * 0.84, y + h - 14],
      [x + w * 0.72, y],
    ],
    LAND,
  );
  // Ships in the strait.
  cv.fillRect(x + w * 0.3, y + h * 0.42, 26, 6, INK);
  cv.fillRect(x + w * 0.3 + 6, y + h * 0.42 - 6, 8, 6, INK);
  cv.fillRect(x + w * 0.62, y + h * 0.62, 22, 5, NAVY);
  cv.fillRect(x + w * 0.62 + 5, y + h * 0.62 - 5, 7, 5, NAVY);
  // Missile arcs and bursts.
  cv.line(x + w * 0.2, y + h * 0.3, x + w * 0.45, y + 6, RED);
  cv.line(x + w * 0.75, y + h * 0.4, x + w * 0.55, y + 8, RED);
  burst(cv, x + w * 0.45, y + 8, 9, RED);
  burst(cv, x + w * 0.55, y + 10, 7, ORANGE);
  burst(cv, x + w * 0.28, y + h * 0.3, 6, RED);
}

// 2 — Kerch Bridge: a deck across the strait, one span collapsed.
function drawKerch(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, SKY);
  cv.fillRect(x, y + h - 16, w, 16, SEA);
  // Arch over the strait.
  cv.line(x + 8, y + h - 16, x + w * 0.5, y + 6, INK);
  cv.line(x + w * 0.5, y + 6, x + w - 8, y + h - 16, INK);
  // Road deck, with the middle span dropped into the water.
  cv.hline(x, x + w * 0.34, y + h * 0.42, INK);
  cv.line(x + w * 0.34, y + h * 0.42, x + w * 0.52, y + h - 20, INK);
  cv.hline(x + w * 0.52, x + w, y + h * 0.42, INK);
  // Pillars.
  cv.vline(x + w * 0.2, y + h * 0.42, y + h - 16, INK);
  cv.vline(x + w * 0.72, y + h * 0.42, y + h - 16, INK);
  cv.vline(x + w * 0.88, y + h * 0.42, y + h - 16, INK);
  // Smoke from the break and a rail line still standing.
  burst(cv, x + w * 0.43, y + h * 0.6, 8, GREY);
  cv.hline(x, x + w, y + h * 0.3, NAVY);
  cv.circle(x + w * 0.85, y + h * 0.3 - 3, 2, RED, true);
}

// 3 — APEC Shenzhen: a summit table, flags, delegates, skyline.
function drawAPEC(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, SKY);
  // Skyline.
  const tops = [0.5, 0.35, 0.55, 0.3, 0.45, 0.6, 0.38];
  for (let i = 0; i < 7; i++) {
    const bx = x + (i * w) / 7;
    cv.fillRect(bx + 2, y + h * tops[i], w / 7 - 4, h * 0.4, NAVY2);
  }
  // Table.
  cv.fillRect(x + 6, y + h * 0.62, w - 12, 8, 0x7a4a21);
  cv.fillRect(x + 10, y + h * 0.62 + 8, w - 20, h * 0.2, 0x5d3a1a);
  // Delegates: three heads and shoulders behind the table.
  const heads = [0.22, 0.5, 0.78];
  const suits = [NAVY, RED, GREEN];
  for (let i = 0; i < 3; i++) {
    const cx = x + w * heads[i];
    cv.circle(cx, y + h * 0.5, 7, 0xe8c39a, true);
    cv.poly(
      [
        [cx - 12, y + h * 0.62],
        [cx + 12, y + h * 0.62],
        [cx + 8, y + h * 0.56],
        [cx - 8, y + h * 0.56],
      ],
      suits[i],
    );
  }
  // Small flags on the table.
  const flagCols = [RED, BLUE, GREEN, ORANGE, PURPLE];
  for (let i = 0; i < 5; i++) {
    const fx = x + w * (0.14 + i * 0.18);
    cv.vline(fx, y + h * 0.5, y + h * 0.62, INK);
    cv.fillRect(fx, y + h * 0.5, 10, 6, flagCols[i]);
  }
}

// 4 — Alaska: Capitol dome over a 56–44 seat bar.
function drawCapitol(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, SKY);
  // Dome.
  cv.circle(x + w / 2, y + h * 0.42, 14, NAVY, true);
  cv.fillRect(x + w / 2 - 14, y + h * 0.42, 28, h * 0.2, NAVY);
  cv.fillRect(x + w / 2 - 20, y + h * 0.62, 40, 3, NAVY);
  cv.vline(x + w / 2, y + h * 0.42 - 20, y + h * 0.42 - 14, NAVY);
  cv.circle(x + w / 2, y + h * 0.42 - 21, 2, NAVY, true);
  // Columns.
  for (let i = 0; i < 5; i++) {
    cv.vline(x + w / 2 - 16 + i * 8, y + h * 0.42, y + h * 0.62, PAPER);
  }
  // Seat bar: 56 blue, 44 red.
  const barY = y + h - 12;
  const split = Math.floor(w * 0.56);
  cv.fillRect(x, barY, split, 8, BLUE);
  cv.fillRect(x + split, barY, w - split, 8, RED);
  cv.rect(x, barY, w, 8, INK);
}

// 5 — Nvidia: a chip with pins and a rising revenue line.
function drawChip(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, NAVY);
  const cx = x + w * 0.32;
  const cy = y + h * 0.52;
  const s = 17;
  // Pins.
  for (let i = -1; i <= 1; i++) {
    cv.fillRect(cx - s + i * 12 - 1, cy - s - 5, 3, 5, 0x9fb3c8);
    cv.fillRect(cx - s + i * 12 - 1, cy + s, 3, 5, 0x9fb3c8);
    cv.fillRect(cx - s - 5, cy - s + i * 12 - 1, 5, 3, 0x9fb3c8);
    cv.fillRect(cx + s, cy - s + i * 12 - 1, 5, 3, 0x9fb3c8);
  }
  cv.fillRect(cx - s, cy - s, s * 2, s * 2, 0x2e7d32);
  cv.fillRect(cx - s + 4, cy - s + 4, s * 2 - 8, s * 2 - 8, 0x1b5e20);
  cv.circle(cx, cy, 5, 0x76b900, true);
  // Rising chart on the right.
  const ox = x + w * 0.58;
  const oy = y + h * 0.78;
  cv.hline(ox, x + w - 6, oy, PAPER);
  cv.vline(ox, y + 8, oy, PAPER);
  cv.line(ox + 4, oy - 6, ox + 16, oy - 16, 0x76b900);
  cv.line(ox + 16, oy - 16, ox + 30, oy - 14, 0x76b900);
  cv.line(ox + 30, oy - 14, ox + 44, oy - 34, 0x76b900);
  cv.line(ox + 44, oy - 34, ox + 52, oy - 44, 0x76b900);
  cv.tri(ox + 52, oy - 44, ox + 46, oy - 40, ox + 52, oy - 36, 0x76b900);
}

// Spiral arms for a cyclone: two Archimedean arms drawn as dots.
function drawSpiral(cv: Canvas, cx: number, cy: number, maxR: number, c: number): void {
  for (let arm = 0; arm < 2; arm++) {
    for (let t = 0; t < 260; t++) {
      const a = (t / 40) + arm * Math.PI;
      const r = 3 + (t / 260) * maxR;
      cv.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85, c);
      cv.set(cx + Math.cos(a) * r + 1, cy + Math.sin(a) * r * 0.85, c);
    }
  }
  cv.circle(cx, cy, 4, PAPER, true);
  cv.circle(cx, cy, 4, c, false);
}

// 6 & 7 — Cyclones Akvan and Xavier: storm spiral over sea, with a
// rain band and a wind arrow. Colour differs by storm.
function drawCyclone(cv: Canvas, x: number, y: number, w: number, h: number, c: number): void {
  cv.fillRect(x, y, w, h, SEA);
  cv.fillRect(x, y + h - 10, w, 10, LAND);
  drawSpiral(cv, x + w * 0.42, y + h * 0.46, Math.min(w, h) * 0.42, c);
  // Rain bands.
  for (let i = 0; i < 5; i++) {
    const rx = x + w * (0.72 + i * 0.05);
    cv.line(rx, y + 6 + i * 3, rx - 4, y + 16 + i * 3, c);
  }
  // Wind arrow.
  cv.line(x + 6, y + h * 0.2, x + w * 0.3, y + h * 0.2, INK);
  cv.tri(x + w * 0.3, y + h * 0.2, x + w * 0.3 - 7, y + h * 0.2 - 4, x + w * 0.3 - 7, y + h * 0.2 + 4, INK);
}

// 8 — Voyager 1: a probe against black space, gold trail off-frame.
function drawVoyager(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, 0x0b1020);
  // Stars.
  const stars: Array<[number, number]> = [
    [0.1, 0.2], [0.25, 0.12], [0.6, 0.15], [0.8, 0.25], [0.15, 0.7],
    [0.35, 0.85], [0.55, 0.7], [0.9, 0.6], [0.7, 0.45], [0.05, 0.45],
  ];
  for (const s of stars) cv.set(x + w * s[0], y + h * s[1], PAPER);
  // Gold trail leaving the frame.
  cv.line(x + w * 0.42, y + h * 0.5, x + w, y + h * 0.2, GOLD);
  // Probe body, dish and boom.
  const px = x + w * 0.38;
  const py = y + h * 0.5;
  cv.fillRect(px - 8, py - 5, 16, 10, 0x9fb3c8);
  cv.line(px + 8, py, px + 26, py - 12, 0x9fb3c8);
  cv.circle(px + 28, py - 13, 2, 0x9fb3c8, true);
  cv.line(px - 8, py - 2, px - 24, py - 14, PAPER);
  cv.tri(px - 26, py - 16, px - 18, py - 10, px - 30, py - 8, PAPER);
  cv.circle(px - 2, py + 12, 3, GOLD, true);
}

// 9 — Gaza: tents in the cold rain.
function drawTents(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, 0x9aa5b1);
  cv.fillRect(x, y + h - 12, w, 12, 0x6b5d4f);
  const cols = [0xd8d2c4, 0xc4bda8, 0xd8d2c4, 0xbfae90];
  for (let i = 0; i < 4; i++) {
    const tx = x + 4 + i * (w / 4);
    const tw = w / 4 - 6;
    cv.poly(
      [
        [tx, y + h - 12],
        [tx + tw / 2, y + h * 0.35],
        [tx + tw, y + h - 12],
      ],
      cols[i],
    );
    cv.line(tx + tw / 2, y + h * 0.35, tx + tw / 2, y + h - 12, INK);
  }
  // Rain.
  for (let i = 0; i < 8; i++) {
    const rx = x + 6 + i * (w / 8);
    cv.line(rx, y + 4, rx - 3, y + 12, 0xe8eef2);
    cv.line(rx + 4, y + h * 0.3, rx + 1, y + h * 0.3 + 8, 0xe8eef2);
  }
}

// 10 — UK inflation: bars climbing to a red record bar.
function drawChartUK(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, PAPER);
  const base = y + h - 10;
  cv.hline(x + 4, x + w - 4, base, INK);
  cv.vline(x + 4, y + 6, base, INK);
  const vals = [0.35, 0.5, 0.45, 0.65, 0.8, 1.0];
  const cols = [GREY, GREY, GREY, GREY, NAVY, RED];
  const bw = (w - 16) / 6;
  for (let i = 0; i < 6; i++) {
    const bh = Math.floor((h - 18) * vals[i]);
    cv.fillRect(x + 8 + i * bw, base - bh, bw - 3, bh, cols[i]);
  }
  cv.line(x + 8, base - Math.floor((h - 18) * 0.4), x + w - 8, base - Math.floor((h - 18) * 0.95), RED);
}

// 11 — Sudan: a drone over dark terrain, dotted flight path, impact marks.
function drawSudan(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, 0x2b2b26);
  cv.fillRect(x, y + h - 14, w, 14, 0x8a6f4d);
  // Dotted flight path.
  for (let i = 0; i < 12; i++) {
    cv.set(x + 8 + i * ((w - 30) / 12), y + 10 + Math.floor(Math.sin(i * 0.7) * 4), PAPER);
  }
  // Drone: body + four rotors.
  const dx = x + w * 0.55;
  const dy = y + h * 0.4;
  cv.fillRect(dx - 7, dy - 3, 14, 6, PAPER);
  cv.circle(dx - 12, dy - 6, 4, PAPER, false);
  cv.circle(dx + 12, dy - 6, 4, PAPER, false);
  cv.circle(dx - 12, dy + 6, 4, PAPER, false);
  cv.circle(dx + 12, dy + 6, 4, PAPER, false);
  cv.circle(dx, dy, 2, RED, true);
  // Impact marks on the ground.
  burst(cv, x + w * 0.25, y + h - 16, 5, RED);
  burst(cv, x + w * 0.7, y + h - 16, 5, ORANGE);
  burst(cv, x + w * 0.88, y + h - 16, 4, RED);
}

// 12 — GTA VI: a game controller on a neon dusk gradient.
function drawController(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, 0x1a1033);
  cv.fillRect(x, y, w, h * 0.3, 0x3b1d5e);
  // Controller body.
  const cy = y + h * 0.58;
  cv.fillRect(x + w * 0.14, cy - 12, w * 0.72, 24, PAPER);
  cv.circle(x + w * 0.14, cy, 12, PAPER, true);
  cv.circle(x + w * 0.86, cy, 12, PAPER, true);
  // Sticks, d-pad, buttons.
  cv.circle(x + w * 0.3, cy - 2, 6, INK, true);
  cv.circle(x + w * 0.62, cy + 3, 6, INK, true);
  cv.fillRect(x + w * 0.42, cy - 9, 3, 7, INK);
  cv.fillRect(x + w * 0.42 - 2, cy - 6, 7, 3, INK);
  cv.circle(x + w * 0.78, cy - 6, 3, GREEN, true);
  cv.circle(x + w * 0.83, cy - 1, 3, RED, true);
  cv.circle(x + w * 0.73, cy - 1, 3, BLUE, true);
  cv.circle(x + w * 0.78, cy + 4, 3, GOLD, true);
}

// 13 — Measles and Ebola: two spiked viruses and a medical cross badge.
function drawHealth(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, PAPER);
  const virus = (cx: number, cy: number, r: number, c: number): void => {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      cv.line(cx, cy, cx + Math.cos(a) * (r + 5), cy + Math.sin(a) * (r + 5), c);
    }
    cv.circle(cx, cy, r, c, true);
    cv.circle(cx - 3, cy - 3, 2, PAPER, true);
    cv.circle(cx + 4, cy + 2, 2, PAPER, true);
  };
  virus(x + w * 0.28, y + h * 0.45, 11, RED);
  virus(x + w * 0.66, y + h * 0.55, 8, ORANGE);
  // Cross badge.
  cv.circle(x + w * 0.86, y + h * 0.22, 9, NAVY, true);
  cv.fillRect(x + w * 0.86 - 2, y + h * 0.22 - 6, 4, 12, PAPER);
  cv.fillRect(x + w * 0.86 - 6, y + h * 0.22 - 2, 12, 4, PAPER);
}

// ---------------------------------------------------------------------------
// World map: stylised continents as lon/lat polygons, projected into the
// map box (lon -180..180, lat 90..-60). Rough shapes on purpose — a
// newspaper sketch map, not a survey chart.
// ---------------------------------------------------------------------------
const CONTINENTS: Array<Array<[number, number]>> = [
  // North America
  [[-168, 66], [-140, 70], [-120, 72], [-95, 80], [-75, 73], [-55, 60], [-60, 47], [-75, 40], [-80, 32], [-90, 21], [-105, 20], [-115, 28], [-125, 40], [-125, 49], [-145, 60], [-168, 66]],
  // Greenland
  [[-55, 60], [-45, 60], [-30, 68], [-20, 70], [-25, 76], [-45, 76], [-58, 72]],
  // South America
  [[-80, 10], [-60, 5], [-50, 0], [-35, -8], [-40, -20], [-48, -28], [-58, -35], [-65, -40], [-70, -30], [-70, -18], [-80, -5]],
  // Europe
  [[-10, 38], [-9, 43], [0, 48], [-5, 50], [5, 58], [10, 58], [18, 56], [28, 60], [30, 70], [40, 68], [30, 60], [23, 55], [12, 45], [3, 42], [-10, 36]],
  // Africa
  [[-17, 15], [-10, 30], [0, 32], [10, 32], [20, 30], [32, 29], [43, 12], [51, 11], [48, 0], [40, -10], [35, -20], [32, -28], [20, -35], [15, -27], [12, -18], [9, 4], [-8, 5], [-17, 15]],
  // Asia
  [[40, 68], [60, 70], [80, 73], [110, 76], [140, 72], [170, 66], [178, 65], [160, 60], [140, 45], [127, 40], [120, 32], [108, 22], [100, 8], [95, 16], [90, 22], [80, 15], [75, 8], [65, 25], [55, 26], [48, 30], [40, 36]],
  // Australia
  [[114, -22], [122, -14], [132, -12], [142, -11], [150, -22], [153, -27], [150, -37], [140, -38], [130, -32], [122, -34], [114, -30], [114, -22]],
  // United Kingdom
  [[-5, 50], [-3, 53], [-5, 56], [-2, 58], [0, 52], [-5, 50]],
  // Japan
  [[130, 31], [135, 34], [140, 38], [142, 44], [145, 44], [140, 40], [135, 33]],
  // New Zealand
  [[167, -45], [174, -41], [178, -38], [174, -35], [167, -45]],
];

function projectLonLat(lon: number, lat: number, x: number, y: number, w: number, h: number): [number, number] {
  const px = x + ((lon + 180) / 360) * w;
  const py = y + ((90 - lat) / 150) * h;
  return [px, py];
}

function drawWorldMap(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, SEA);
  for (const cont of CONTINENTS) {
    const pts = cont.map((p) => projectLonLat(p[0], p[1], x, y, w, h));
    cv.poly(pts, LAND);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      cv.line(a[0], a[1], b[0], b[1], RULE);
    }
  }
}

// A numbered pin: coloured disc with a white number, for the map.
function drawPin(cv: Canvas, cx: number, cy: number, n: number, c: number): void {
  cv.circle(cx, cy, 8, c, true);
  cv.circle(cx, cy, 8, INK, false);
  const label = String(n);
  const tw = textWidth(label, 1);
  drawText(cv, label, cx - tw / 2, cy - 3, 1, 0xffffff, false);
}

// ---------------------------------------------------------------------------
// Content. Every fact below was checked against live reporting on
// 19 November 2026 before it was drawn. Three stories from the draft list
// failed that check and were replaced with verified backups:
//   - France march (17 Nov, not 18 Nov) -> Earthshot Prize winners
//   - Eswatini clashes (not found) -> Ethiopia-Eritrea fighting at Badme
//   - Fela Kuti induction (ceremony 14 Nov) -> Bezos on casting Pattinson
// Corrections applied inside kept stories: no MQ-9 shootdown (3 Nov),
// no "1,441 drones" claim, no "largest majority since 2009", Gaza headline
// reworded (the baby who died of cold was 13 Nov, not 18 Nov), outages
// counted at 7 not 8, sanctions worded as firms + parties, Brent $92.66.
// ---------------------------------------------------------------------------
type DrawFn = (cv: Canvas, x: number, y: number, w: number, h: number) => void;

interface Feature {
  n: number;
  name: string;
  tag: string;
  headline: string;
  deck: string;
  draw: DrawFn;
  lon: number; // map pin longitude
  lat: number; // map pin latitude
  color: number; // region colour for the pin
  offmap?: boolean; // true for Voyager 1: marked off the map, not pinned
}

const FEATURES: Feature[] = [
  {
    n: 1, name: "Gulf strikes", tag: "MIDDLE EAST · CONFLICT",
    headline: "GULF STRIKES SHAKE THE REGION",
    deck: "US jets hit an IRGC missile site on Qeshm; Iranian drones are downed over Bahrain and Kuwait.",
    draw: drawHormuz, lon: 56.5, lat: 26.5, color: MIDRED,
  },
  {
    n: 2, name: "Kerch Bridge", tag: "EUROPE · UKRAINE",
    headline: "KERCH BRIDGE BREAKS",
    deck: "Strikes drop a road arch and 270m of road into the strait; the rail span stands damaged. Two dead.",
    draw: drawKerch, lon: 36.5, lat: 45.3, color: PURPLE,
  },
  {
    n: 3, name: "APEC Shenzhen", tag: "ASIA · SUMMIT",
    headline: "XI OPENS APEC IN SHENZHEN",
    deck: "Xi opens the CEO Summit as Putin speaks and Trump flies in from Manila for Thursday's trilateral.",
    draw: drawAPEC, lon: 114, lat: 22.5, color: GREEN,
  },
  {
    n: 4, name: "Alaska Senate", tag: "USA · SENATE",
    headline: "PELTOLA WINS ALASKA 50.1-45.8",
    deck: "First Alaska Native in the Senate.",
    draw: drawCapitol, lon: -150, lat: 64, color: BLUE,
  },
  {
    n: 5, name: "Nvidia", tag: "TECH · EARNINGS",
    headline: "NVIDIA: REVENUE +103%",
    deck: "$115.8bn quarter; profit $65.3bn.",
    draw: drawChip, lon: -122, lat: 37.4, color: BLUE,
  },
  {
    n: 6, name: "Cyclone Akvan", tag: "ASIA · CYCLONE",
    headline: "CYCLONE AKVAN NEARS INDIA",
    deck: "Gusts 145 km/h; Odisha moves 200,000.",
    draw: (cv, x, y, w, h) => drawCyclone(cv, x, y, w, h, TEAL),
    lon: 80.5, lat: 15.8, color: GREEN,
  },
  {
    n: 7, name: "Cyclone Xavier", tag: "OCEANIA · CYCLONE",
    headline: "XAVIER HITS CATEGORY 5",
    deck: "220 km/h winds batter the Cook Islands.",
    draw: (cv, x, y, w, h) => drawCyclone(cv, x, y, w, h, PURPLE),
    lon: -160, lat: -21, color: TEAL,
  },
  {
    n: 8, name: "Voyager 1 (off-map)", tag: "SPACE · NASA",
    headline: "VOYAGER 1: ONE LIGHT-DAY OUT",
    deck: "25.9bn km out; signals take a day.",
    draw: drawVoyager, lon: 0, lat: 0, color: GOLD, offmap: true,
  },
  {
    n: 9, name: "Gaza", tag: "MIDEAST · GAZA",
    headline: "GAZA: WINTER IN TENTS",
    deck: "Peace board warns of collapse.",
    draw: drawTents, lon: 34.5, lat: 31.5, color: MIDRED,
  },
  {
    n: 10, name: "UK inflation", tag: "UK · ECONOMY",
    headline: "UK PRICES UP 3.6%",
    deck: "Diesel hits a record 199.5p a litre.",
    draw: drawChartUK, lon: -0.1, lat: 51.5, color: PURPLE,
  },
  {
    n: 11, name: "Sudan drones", tag: "AFRICA · SUDAN",
    headline: "DRONES KILL 1,630 IN SUDAN",
    deck: "UN: 2,230 civilians dead in 2026.",
    draw: drawSudan, lon: 29, lat: 13, color: ORANGE,
  },
  {
    n: 12, name: "GTA VI", tag: "GAMES · GTA VI",
    headline: "GTA VI IS FINALLY HERE",
    deck: "Rollout starts in NZ; 15.9m pre-orders.",
    draw: drawController, lon: 174.8, lat: -36.9, color: TEAL,
  },
  {
    n: 13, name: "Measles / Ebola", tag: "HEALTH · VIRUS",
    headline: "MEASLES STATUS LOST",
    deck: "Measles status lost; Ebola 11,000+.",
    draw: drawHealth, lon: 25, lat: -2, color: ORANGE,
  },
];

interface Brief {
  n: number;
  lead: string;
  rest: string;
}

// One line each: number + bold lead + one line of rest. Kept short so each
// brief fits a single line at scale 1.5 in a half-page column.
const BRIEFS: Brief[] = [
  { n: 14, lead: "ICJ MYANMAR VERDICT", rest: "ruling due Thursday" },
  { n: 15, lead: "RUSSIAN PLANE CRASH", rest: "An-12 down, 19 dead" },
  { n: 16, lead: "TWO QUAKES", rest: "PNG 6.0, Romania 5.3, 2 hurt" },
  { n: 17, lead: "EARTHSHOT WINNERS", rest: "Bhutan, Mahindra lead five winners" },
  { n: 18, lead: "TRUMP IN MANILA", rest: "Quad talks, Thai trade deal" },
  { n: 19, lead: "MOSSAD TIP FOILS PLOT", rest: "5 held in Greece" },
  { n: 20, lead: "7 OUTAGES IN A WEEK", rest: "Microsoft to NSA" },
  { n: 21, lead: "KNESSET SPEAKER", rest: "Kahana wins 66-52" },
  { n: 22, lead: "SANCTIONS", rest: "UK hits 8 firms; Australia 7" },
  { n: 23, lead: "MARKETS SLIDE", rest: "S&P -1.0%, FTSE -1.8%, gold -2%" },
  { n: 24, lead: "HOUTHIS NEAR ADEN", rest: "60km out; 60 targets hit" },
  { n: 25, lead: "US RAPS KYIV STRIKES", rest: "Colby calls them spectacle" },
  { n: 26, lead: "WAYMO OFF FREEWAYS", rest: "DMV ban; rides halted" },
  { n: 27, lead: "US COLONEL HELD", rest: "held in UK spy case" },
  { n: 28, lead: "SOZCU TV SEIZED", rest: "police raid, trustee named" },
  { n: 29, lead: "BADME CLASHES", rest: "Ethiopia, Eritrea trade fire" },
  { n: 30, lead: "KOREA LIFTS FORECAST", rest: "2027 growth now 3.9%" },
  { n: 31, lead: "SERBIA PARLIAMENT OPENS", rest: "Student List 140 of 250" },
  { n: 32, lead: "ANTHROPIC TO LIST", rest: "Nasdaq debut Thu, ticker ANT" },
  { n: 33, lead: "SOLAR FLARE M1.1", rest: "Sun spot AR4578 flares twice" },
  { n: 34, lead: "EU RETURN HUBS", rest: "five states eye Rwanda hub" },
  { n: 35, lead: "FRANCE-MALAYSIA DEAL", rest: "rare-earths pact signed" },
  { n: 36, lead: "REAL SLIDES", rest: "Lula plan spooks investors" },
  { n: 37, lead: "FIJI DECLARES DISASTER", rest: "El Nino drought bites" },
  { n: 38, lead: "BEZOS PICKED BOND", rest: "he helped cast Pattinson" },
  { n: 39, lead: "ZVEREV INTO SEMIS", rest: "beats Shelton in Turin" },
  { n: 40, lead: "N. IRELAND PROMOTED", rest: "1-1 in Hungary, League A" },
  { n: 41, lead: "TIGER WOODS RETURNS", rest: "Hero event Dec 3-6" },
  { n: 42, lead: "WORD OF THE YEAR", rest: "Cambridge picks \"human\"" },
];

const NUMBERS: Array<{ big: string; cap: string }> = [
  { big: "$115.8bn", cap: "Nvidia quarterly revenue, +103%" },
  { big: "145 km/h", cap: "Akvan gusts at landfall" },
  { big: "200,000", cap: "people Odisha is moving" },
  { big: "25.9bn km", cap: "Voyager 1 from Earth" },
];

const LEGEND: Array<{ color: number; label: string }> = [
  { color: BLUE, label: "Americas" },
  { color: PURPLE, label: "Europe" },
  { color: ORANGE, label: "Africa" },
  { color: MIDRED, label: "Middle East" },
  { color: GREEN, label: "Asia" },
  { color: TEAL, label: "Oceania" },
  { color: GOLD, label: "Off-map" },
];

// ---------------------------------------------------------------------------
// Layout: a broadsheet front page, 1024x1024, margin 14.
//   masthead 8-100 · leads 110-294 · medium 302-420 / 428-546
//   numbers 554-620 · map 628-790 · briefs 798-984 · footer 990-1018
// ---------------------------------------------------------------------------
const W = 1024;
const H = 1024;
const MX = 14; // left margin
const CW = 996; // content width

function sectionHeader(cv: Canvas, text: string, x: number, y: number, w: number): void {
  cv.fillRect(x, y + 3, 8, 8, RED);
  drawText(cv, text, x + 14, y, 2, INK, true);
  cv.hline(x, x + w, y + 17, RULE);
}

// One brief line: "14. " + bold lead + " — " + rest, all scale 1.5.
// Trims the rest (whole words) if the line would overflow the column.
function drawBriefLine(cv: Canvas, b: Brief, x: number, y: number, colW: number): void {
  const scale = 1.5;
  let rest = b.rest;
  const lead = b.lead;
  const num = b.n + ". ";
  for (;;) {
    const total = textWidth(num + lead + " — " + rest, scale);
    if (total <= colW || rest.indexOf(" ") < 0) break;
    rest = rest.slice(0, rest.lastIndexOf(" "));
    if (rest.length < 4) break;
  }
  if (textWidth(num + lead + " — " + rest, scale) > colW) rest += "";
  let cx = x;
  cx += drawText(cv, num, cx, y, scale, INK, false);
  cx += drawText(cv, lead, cx, y, scale, INK, true);
  cx += drawText(cv, " — " + rest, cx, y, scale, INK, false);
}

function renderMasthead(cv: Canvas): void {
  cv.fillRect(8, 8, 1008, 92, NAVY);
  drawTextCentered(cv, "THE DAY IN WORLD NEWS", 512, 18, 2, 0xe8ddc0, true);
  drawTextCentered(cv, "WEDNESDAY 18 NOVEMBER 2026", 512, 38, 5, 0xf7f3e8, true);
  drawTextCentered(cv, "42 STORIES · 6 CONTINENTS · ONE PAGE", 512, 80, 2, 0xe8ddc0, false);
  cv.fillRect(8, 100, 1008, 2, RED);
}

function renderLeads(cv: Canvas): void {
  const colW = 326;
  const xs = [MX, MX + 334, MX + 668];
  for (let i = 0; i < 3; i++) {
    const f = FEATURES[i];
    const x = xs[i];
    f.draw(cv, x, 110, colW, 82);
    cv.rect(x, 110, colW, 82, INK);
    let y = 198;
    drawText(cv, f.n + " · " + f.tag, x, y, 1.5, RED, true);
    y = 213;
    y = drawWrapped(cv, f.headline, x, y, 2, colW, 15, INK, true);
    drawWrapped(cv, f.deck, x, y + 3, 1.5, colW, 11, INK, false);
    if (i < 2) cv.vline(x + colW + 4, 110, 292, RULE);
  }
  cv.hline(MX, MX + CW, 296, INK);
}

function renderMedium(cv: Canvas, row: number, y0: number): void {
  const panelW = 192;
  const xs = [MX, MX + 200, MX + 400, MX + 600, MX + 800];
  for (let i = 0; i < 5; i++) {
    const f = FEATURES[row * 5 + 3 + i];
    const x = xs[i];
    f.draw(cv, x, y0, panelW, 40);
    cv.rect(x, y0, panelW, 40, INK);
    drawText(cv, f.n + " · " + f.tag, x, y0 + 45, 1.5, RED, true);
    let y = drawWrapped(cv, f.headline, x, y0 + 58, 2, panelW, 15, INK, true);
    drawWrapped(cv, f.deck, x, y + 2, 1.5, panelW, 11, INK, false);
  }
  cv.hline(MX, MX + CW, y0 + 116, INK);
}

function renderNumbers(cv: Canvas): void {
  sectionHeader(cv, "BY THE NUMBERS", MX, 554, CW);
  const itemW = 243;
  const xs = [MX, MX + 251, MX + 502, MX + 753];
  for (let i = 0; i < 4; i++) {
    const x = xs[i];
    drawTextCentered(cv, NUMBERS[i].big, x + itemW / 2, 576, 3, INK, true);
    const capLines = wrapText(NUMBERS[i].cap, 1.5, itemW - 12);
    let cy = 600;
    for (const line of capLines) {
      drawTextCentered(cv, line, x + itemW / 2, cy, 1.5, GREY, false);
      cy += 11;
    }
    if (i < 3) cv.vline(x + itemW + 4, 576, 618, RULE);
  }
}

// Small nudges so neighbouring pins (Kerch/Gaza/Sudan/DRC) do not overlap.
// Each entry is [dx, dy] in pixels from the true projected position.
const PIN_NUDGE: Record<number, [number, number]> = {
  2: [-14, -10],
  9: [0, 10],
  11: [-16, 12],
  13: [14, 6],
};

function renderMap(cv: Canvas): void {
  sectionHeader(cv, "WHERE IT HAPPENED", MX, 628, CW);
  const mapX = MX;
  const mapY = 650;
  const mapW = 560;
  const mapH = 140;
  drawWorldMap(cv, mapX, mapY, mapW, mapH);
  cv.rect(mapX, mapY, mapW, mapH, INK);
  // Pins for the twelve on-map features.
  for (const f of FEATURES) {
    if (f.offmap) continue;
    const [px, py] = projectLonLat(f.lon, f.lat, mapX, mapY, mapW, mapH);
    const nudge = PIN_NUDGE[f.n] || [0, 0];
    const cx = px + nudge[0];
    const cy = py + nudge[1];
    if (nudge[0] !== 0 || nudge[1] !== 0) cv.line(px, py, cx, cy, INK);
    drawPin(cv, cx, cy, f.n, f.color);
  }
  // Voyager 1: off the map, top-right corner, gold, pointing out.
  const vx = mapX + mapW - 12;
  const vy = mapY + 16;
  cv.line(vx + 8, vy, mapX + mapW, vy, GOLD);
  cv.tri(mapX + mapW - 2, vy, mapX + mapW - 10, vy - 4, mapX + mapW - 10, vy + 4, GOLD);
  drawPin(cv, vx, vy, 8, GOLD);

  // Right column: legend + pin list.
  const rx = 590;
  let ly = 652;
  drawText(cv, "PINS BY REGION", rx, ly, 1.5, INK, true);
  ly += 16;
  // Legend in two rows.
  let lx = rx;
  for (let i = 0; i < LEGEND.length; i++) {
    if (i === 4) {
      ly += 14;
      lx = rx;
    }
    cv.fillRect(lx, ly, 10, 10, LEGEND[i].color);
    lx += 14;
    lx += drawText(cv, LEGEND[i].label, lx, ly, 1.5, INK, false);
    lx += 16;
  }
  ly += 26;
  // Pin list in two columns: features 1-7 left, 8-13 right.
  const col2x = rx + 210;
  for (let i = 0; i < FEATURES.length; i++) {
    const f = FEATURES[i];
    const colX = i < 7 ? rx : col2x;
    const rowY = ly + (i % 7) * 12;
    cv.fillRect(colX, rowY, 8, 8, f.color);
    drawText(cv, f.n + " " + f.name, colX + 12, rowY - 1, 1.5, INK, false);
  }
}

function renderBriefs(cv: Canvas): void {
  sectionHeader(cv, "ALSO ON WEDNESDAY 18 NOVEMBER", MX, 798, CW);
  const colW = 492;
  const y0 = 820;
  for (let i = 0; i < 15; i++) {
    drawBriefLine(cv, BRIEFS[i], MX, y0 + i * 11, colW);
  }
  for (let i = 0; i < 14; i++) {
    drawBriefLine(cv, BRIEFS[15 + i], MX + 504, y0 + i * 11, colW);
  }
}

function renderFooter(cv: Canvas): void {
  cv.hline(MX, MX + CW, 990, INK);
  drawTextCentered(
    cv,
    "Every story happened or was first reported on Wednesday 18 November 2026. Disputed claims are attributed.",
    512, 996, 1.5, INK, false,
  );
  drawTextCentered(
    cv,
    "Sources: Reuters, AP, AFP, BBC, Al Jazeera, NASA, UN, WHO, IMD. Original drawings.",
    512, 1008, 1.5, GREY, false,
  );
}

function render(cv: Canvas): void {
  cv.rect(8, 8, 1008, 1008, INK);
  renderMasthead(cv);
  renderLeads(cv);
  renderMedium(cv, 0, 302);
  renderMedium(cv, 1, 428);
  renderNumbers(cv);
  renderMap(cv);
  renderBriefs(cv);
  renderFooter(cv);
}

function main(): void {
  const cv = new Canvas(W, H, PAPER);
  render(cv);
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "out";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "entry.png"), encodePng(W, H, cv.buf));
}

main();
