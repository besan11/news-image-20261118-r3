// news-image-20261118-r3 — round 3 entry for the make.fun bounty
// "Sum up 18 November's world news in one image".
//
// A broadsheet front page, 1024x1024, drawn entirely from code: smooth
// serif/sans text from subsetted Noto TTFs in fonts/ (rasterised
// by the small TrueType engine below), hand-built scenes, charts and a world
// map, and a small PNG encoder written from scratch. No external images, no
// network, no randomness and no clock in the render path, so two runs write
// identical bytes. Every story on the page happened or was first reported on
// Wednesday 18 November 2026, and every number was checked against live
// reporting before it was drawn.
//
// Rebuilt from zero for round 3. Each section is a deliberate step up from
// the previous round: serif broadsheet masthead, three large illustrated
// leads, ten medium illustrated panels, a BY THE NUMBERS strip, a large
// colour-coded map with a legend and pin list, numbered two-column briefs,
// and a footer that names its sources and its date discipline.
//
// Repair (commit 2): the briefs in commit 1 overlapped vertically (leading
// 11px = glyph height), all text was a blocky bitmap face, and the Gulf
// lead was an abstract burst instead of a recognisable Hormuz map. This
// commit fixes all three: briefs now run at 11px on a 13px leading with
// room to spare, the bitmap face is replaced by smooth Noto Serif (masthead
// and headlines) and Noto Sans (body, decks, briefs), and the lead panel
// is redrawn as a proper Strait of Hormuz map — Iran's coast, the Musandam
// peninsula, Qeshm Island, the shipping lane, and markers for Bahrain and
// Kuwait. Layout, story list and component counts are unchanged.

import { deflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  // Blend colour c over the pixel at (x, y) with coverage a (0..255).
  blend(x: number, y: number, c: number, a: number): void {
    if (a <= 0) return;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    if (a >= 255) {
      this.set(xi, yi, c);
      return;
    }
    const i = (yi * this.w + xi) * 4;
    const inv = 255 - a;
    this.buf[i] = ((((c >> 16) & 255) * a + this.buf[i] * inv + 127) / 255) | 0;
    this.buf[i + 1] = ((((c >> 8) & 255) * a + this.buf[i + 1] * inv + 127) / 255) | 0;
    this.buf[i + 2] = (((c & 255) * a + this.buf[i + 2] * inv + 127) / 255) | 0;
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
// Smooth text: subsetted Noto TTFs loaded from the fonts/ directory in
// this repo plus a small TrueType rasteriser (cmap formats 4/12, glyf
// outlines, 4x4-supersampled non-zero fill). The faces are the system
// Noto Serif / Noto Sans (SIL OFL 1.1), subsetted to printable ASCII
// plus · – — •, so the program stays fully self-contained: no system
// font lookup, no network, and the render is a pure function of this
// repo — two runs write identical bytes.
// Text is placed by baseline: drawText's y is the baseline of the text.
// ---------------------------------------------------------------------------

interface Face {
  buf: Buffer;
  upem: number;
  numGlyphs: number;
  locFmt: number;
  cmap4: {
    end: number[];
    start: number[];
    delta: number[];
    roBase: number;
    ro: number[];
  } | null;
  cmap12: Array<[number, number, number]> | null;
  loca: number[];
  glyf: number;
  hmtx: number;
  numH: number;
  asc: number;
  desc: number;
  cache: Map<string, Glyph>;
}

interface Glyph {
  w: number;
  h: number;
  bx: number; // bitmap left edge, in px right of the pen position
  by: number; // bitmap top edge, in px above the baseline
  adv: number; // advance width in px
  cov: Uint8Array; // per-pixel coverage 0..255, row-major w*h
}

function u16(b: Buffer, o: number): number {
  return b.readUInt16BE(o);
}
function i16(b: Buffer, o: number): number {
  return b.readInt16BE(o);
}
function u32(b: Buffer, o: number): number {
  return b.readUInt32BE(o);
}

function loadFace(buf: Buffer): Face {
  const nTab = u16(buf, 4);
  const tabs: Record<string, number> = {};
  for (let i = 0; i < nTab; i++) {
    const o = 12 + i * 16;
    tabs[buf.toString("ascii", o, o + 4)] = u32(buf, o + 8);
  }
  const head = tabs["head"];
  const upem = u16(buf, head + 18);
  const locFmt = i16(buf, head + 50);
  const maxp = tabs["maxp"];
  const numGlyphs = u16(buf, maxp + 4);
  const hhea = tabs["hhea"];
  const asc = i16(buf, hhea + 4);
  const desc = i16(buf, hhea + 6);
  const numH = u16(buf, hhea + 34);
  // cmap: prefer format 12, else format 4.
  const cmap = tabs["cmap"];
  let cmap4: Face["cmap4"] = null;
  let cmap12: Face["cmap12"] = null;
  const nSub = u16(buf, cmap + 2);
  for (let i = 0; i < nSub; i++) {
    const so = cmap + u32(buf, cmap + 4 + i * 8 + 4);
    const fmt = u16(buf, so);
    if (fmt === 12 && !cmap12) {
      const nG = u32(buf, so + 12);
      const groups: Array<[number, number, number]> = [];
      for (let g = 0; g < nG; g++) {
        const go = so + 16 + g * 12;
        groups.push([u32(buf, go), u32(buf, go + 4), u32(buf, go + 8)]);
      }
      cmap12 = groups;
    } else if (fmt === 4 && !cmap4) {
      const segCount = u16(buf, so + 6) / 2;
      const endBase = so + 14;
      const startBase = endBase + 2 * segCount + 2;
      const deltaBase = startBase + 2 * segCount;
      const roBase = deltaBase + 2 * segCount;
      const end: number[] = [];
      const start: number[] = [];
      const delta: number[] = [];
      const ro: number[] = [];
      for (let s = 0; s < segCount; s++) {
        end.push(u16(buf, endBase + 2 * s));
        start.push(u16(buf, startBase + 2 * s));
        delta.push(i16(buf, deltaBase + 2 * s));
        ro.push(u16(buf, roBase + 2 * s));
      }
      cmap4 = { end, start, delta, roBase, ro };
    }
  }
  const locaOff = tabs["loca"];
  const loca: number[] = [];
  for (let g = 0; g <= numGlyphs; g++) {
    loca.push(locFmt === 0 ? u16(buf, locaOff + 2 * g) * 2 : u32(buf, locaOff + 4 * g));
  }
  return {
    buf, upem, numGlyphs, locFmt, cmap4, cmap12, loca,
    glyf: tabs["glyf"], hmtx: tabs["hmtx"], numH, asc, desc,
    cache: new Map(),
  };
}

function glyphIndex(f: Face, code: number): number {
  if (f.cmap12) {
    const gs = f.cmap12;
    let lo = 0;
    let hi = gs.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const g = gs[mid];
      if (code < g[0]) hi = mid - 1;
      else if (code > g[1]) lo = mid + 1;
      else return g[2] + (code - g[0]);
    }
    return 0;
  }
  const c4 = f.cmap4;
  if (!c4) return 0;
  for (let s = 0; s < c4.end.length; s++) {
    if (code > c4.end[s]) continue;
    if (code < c4.start[s]) return 0;
    const ro = c4.ro[s];
    if (ro === 0) return (code + c4.delta[s]) & 0xffff;
    const addr = c4.roBase + 2 * s + ro + 2 * (code - c4.start[s]);
    const g = u16(f.buf, addr);
    return g === 0 ? 0 : (g + c4.delta[s]) & 0xffff;
  }
  return 0;
}

function glyphAdvance(f: Face, gid: number): number {
  const g = Math.min(gid, f.numH - 1);
  return u16(f.buf, f.hmtx + g * 4);
}

// One outline point: [x, y, onCurve], font units, y up.
type Pt = [number, number, boolean];

function glyphOutline(f: Face, gid: number): Pt[][] {
  const o0 = f.loca[gid];
  const o1 = f.loca[gid + 1];
  if (o1 <= o0) return [];
  const b = f.buf;
  const go = f.glyf + o0;
  const nC = i16(b, go);
  if (nC < 0) {
    // Composite glyph: recurse into components with their transform.
    const contours: Pt[][] = [];
    let p = go + 10;
    for (;;) {
      const flags = u16(b, p);
      const comp = u16(b, p + 2);
      p += 4;
      let dx = 0;
      let dy = 0;
      if (flags & 0x0001) {
        dx = i16(b, p);
        dy = i16(b, p + 2);
        p += 4;
      } else {
        dx = b.readInt8(p);
        dy = b.readInt8(p + 1);
        p += 2;
      }
      let a = 1;
      let b01 = 0;
      let b10 = 0;
      let d = 1;
      if (flags & 0x0008) {
        const s = i16(b, p) / 16384;
        a = s;
        d = s;
        p += 2;
      } else if (flags & 0x0040) {
        a = i16(b, p) / 16384;
        d = i16(b, p + 2) / 16384;
        p += 4;
      } else if (flags & 0x0080) {
        a = i16(b, p) / 16384;
        b01 = i16(b, p + 2) / 16384;
        b10 = i16(b, p + 4) / 16384;
        d = i16(b, p + 6) / 16384;
        p += 8;
      }
      if (!(flags & 0x0002)) {
        dx = 0;
        dy = 0;
      }
      for (const cont of glyphOutline(f, comp)) {
        contours.push(
          cont.map(([x, y, on]) => [x * a + y * b10 + dx, x * b01 + y * d + dy, on] as Pt),
        );
      }
      if (!(flags & 0x0020)) break;
    }
    return contours;
  }
  const endPts: number[] = [];
  for (let i = 0; i < nC; i++) endPts.push(u16(b, go + 10 + 2 * i));
  const nPts = nC === 0 ? 0 : endPts[nC - 1] + 1;
  const insLen = u16(b, go + 10 + 2 * nC);
  let p = go + 12 + 2 * nC + insLen;
  const flags: number[] = [];
  while (flags.length < nPts) {
    const fl = b[p++];
    flags.push(fl);
    if (fl & 0x08) {
      const rep = b[p++];
      for (let r = 0; r < rep; r++) flags.push(fl);
    }
  }
  const xs: number[] = [];
  let x = 0;
  for (let i = 0; i < nPts; i++) {
    const fl = flags[i];
    if (fl & 0x02) {
      const v = b[p++];
      x += fl & 0x10 ? v : -v;
    } else if (!(fl & 0x10)) {
      x += i16(b, p);
      p += 2;
    }
    xs.push(x);
  }
  const ys: number[] = [];
  let y = 0;
  for (let i = 0; i < nPts; i++) {
    const fl = flags[i];
    if (fl & 0x04) {
      const v = b[p++];
      y += fl & 0x20 ? v : -v;
    } else if (!(fl & 0x20)) {
      y += i16(b, p);
      p += 2;
    }
    ys.push(y);
  }
  const contours: Pt[][] = [];
  let start = 0;
  for (let c = 0; c < nC; c++) {
    const end = endPts[c];
    const cont: Pt[] = [];
    for (let i = start; i <= end; i++) cont.push([xs[i], ys[i], (flags[i] & 0x01) !== 0]);
    contours.push(cont);
    start = end + 1;
  }
  return contours;
}

// Flatten contours into line segments in device px (y down, baseline 0).
function flattenEdges(contours: Pt[][], scale: number): Array<[number, number, number, number]> {
  const edges: Array<[number, number, number, number]> = [];
  for (const pts of contours) {
    const n = pts.length;
    if (n === 0) continue;
    let start: [number, number];
    let i = 0;
    if (pts[0][2]) {
      start = [pts[0][0], pts[0][1]];
      i = 1;
    } else if (pts[n - 1][2]) {
      start = [pts[n - 1][0], pts[n - 1][1]];
      i = 0;
    } else {
      start = [(pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2];
      i = 0;
    }
    let cur: [number, number] = start;
    const lineTo = (x: number, y: number): void => {
      edges.push([cur[0] * scale, -cur[1] * scale, x * scale, -y * scale]);
      cur = [x, y];
    };
    const quadTo = (cx: number, cy: number, ex: number, ey: number): void => {
      const sx = cur[0];
      const sy = cur[1];
      const SEG = 12;
      for (let s = 1; s <= SEG; s++) {
        const t = s / SEG;
        const mt = 1 - t;
        lineTo(
          mt * mt * sx + 2 * mt * t * cx + t * t * ex,
          mt * mt * sy + 2 * mt * t * cy + t * t * ey,
        );
      }
    };
    while (i < n) {
      const p = pts[i];
      if (p[2]) {
        lineTo(p[0], p[1]);
        i++;
      } else if (i + 1 < n) {
        const q = pts[i + 1];
        if (q[2]) {
          quadTo(p[0], p[1], q[0], q[1]);
          i += 2;
        } else {
          quadTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
          i += 1;
        }
      } else {
        quadTo(p[0], p[1], start[0], start[1]);
        i += 1;
      }
    }
    if (cur[0] !== start[0] || cur[1] !== start[1]) lineTo(start[0], start[1]);
  }
  return edges;
}

const SS = 4; // supersampling per axis for antialiasing

function rasterGlyph(f: Face, code: number, size: number): Glyph {
  const key = code + ":" + size;
  const hit = f.cache.get(key);
  if (hit) return hit;
  const gid = glyphIndex(f, code);
  const adv = glyphAdvance(f, gid) * (size / f.upem);
  const scale = size / f.upem;
  const edges = flattenEdges(glyphOutline(f, gid), scale);
  let g: Glyph;
  if (edges.length === 0) {
    g = { w: 0, h: 0, bx: 0, by: 0, adv, cov: new Uint8Array(0) };
    f.cache.set(key, g);
    return g;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const e of edges) {
    minX = Math.min(minX, e[0], e[2]);
    maxX = Math.max(maxX, e[0], e[2]);
    minY = Math.min(minY, e[1], e[3]);
    maxY = Math.max(maxY, e[1], e[3]);
  }
  const leftSub = Math.floor(minX * SS);
  const topSub = Math.floor(minY * SS);
  const rightSub = Math.ceil(maxX * SS);
  const botSub = Math.ceil(maxY * SS);
  const wSub = rightSub - leftSub;
  const hSub = botSub - topSub;
  const w = Math.ceil(wSub / SS);
  const h = Math.ceil(hSub / SS);
  const counts = new Uint16Array(w * h);
  const xs: number[] = [];
  const ds: number[] = [];
  for (let sy = 0; sy < hSub; sy++) {
    const yDev = (topSub + sy + 0.5) / SS;
    xs.length = 0;
    ds.length = 0;
    for (const e of edges) {
      if ((e[1] <= yDev && yDev < e[3]) || (e[3] <= yDev && yDev < e[1])) {
        const t = (yDev - e[1]) / (e[3] - e[1]);
        xs.push((e[0] + t * (e[2] - e[0])) * SS);
        ds.push(e[3] > e[1] ? 1 : -1);
      }
    }
    const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
    let wind = 0;
    for (let k = 0; k + 1 < order.length; k++) {
      wind += ds[order[k]];
      if (wind !== 0) {
        const xa = xs[order[k]];
        const xb = xs[order[k + 1]];
        const c0 = Math.max(leftSub, Math.ceil(xa - 0.5));
        const c1 = Math.min(rightSub, Math.ceil(xb - 0.5));
        const py = sy >> 2;
        for (let c = c0; c < c1; c++) {
          counts[py * w + Math.floor((c - leftSub) / SS)]++;
        }
      }
    }
  }
  const cov = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) cov[i] = Math.min(255, Math.round((counts[i] * 255) / (SS * SS)));
  g = { w, h, bx: leftSub / SS, by: -topSub / SS, adv, cov };
  f.cache.set(key, g);
  return g;
}

// Font files live in fonts/ next to this script; the path is resolved
// relative to the script location, not the working directory.
function fontFile(name: string): Buffer {
  return readFileSync(new URL(`./fonts/${name}`, import.meta.url));
}

const F_SERIF = loadFace(fontFile("SERIF.ttf"));
const F_SERIF_B = loadFace(fontFile("SERIF_B.ttf"));
const F_SERIF_BLK = loadFace(fontFile("SERIF_BLK.ttf"));
const F_SANS = loadFace(fontFile("SANS.ttf"));
const F_SANS_B = loadFace(fontFile("SANS_B.ttf"));

// Width of one line of text at the given face/size (px). `ls` is extra
// tracking in px, added between characters (used for the kicker).
function textWidth(text: string, f: Face, size: number, ls = 0): number {
  let w = 0;
  for (const ch of text) {
    w += rasterGlyph(f, ch.codePointAt(0) as number, size).adv;
  }
  if (text.length > 1) w += ls * (text.length - 1);
  return w;
}

// Draw a single line of text. `y` is the baseline. Returns the width drawn.
function drawText(cv: Canvas, text: string, x: number, y: number, f: Face, size: number, c: number, ls = 0): number {
  let px = x;
  const startX = x;
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const g = rasterGlyph(f, chars[i].codePointAt(0) as number, size);
    if (g.w > 0) {
      const dx = Math.round(px + g.bx);
      const dy = Math.round(y - g.by);
      for (let yy = 0; yy < g.h; yy++) {
        for (let xx = 0; xx < g.w; xx++) {
          const a = g.cov[yy * g.w + xx];
          if (a !== 0) cv.blend(dx + xx, dy + yy, c, a);
        }
      }
    }
    px += g.adv;
    if (i + 1 < chars.length) px += ls;
  }
  return px - startX;
}

function drawTextCentered(cv: Canvas, text: string, cx: number, y: number, f: Face, size: number, c: number, ls = 0): void {
  const w = textWidth(text, f, size, ls);
  drawText(cv, text, cx - w / 2, y, f, size, c, ls);
}

// Wrap text into lines that fit maxWidth (in pixels) at the given face
// and size. Words are never split; a word longer than the line gets its
// own line.
function wrapText(text: string, f: Face, size: number, maxWidth: number, ls = 0): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur === "" ? w : cur + " " + w;
    if (textWidth(test, f, size, ls) <= maxWidth || cur === "") {
      cur = test;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// Draw wrapped text starting at (x, firstBaseline); returns the baseline
// just below the block (last baseline + lineH), so callers can chain the
// next block with `y + gap`.
function drawWrapped(cv: Canvas, text: string, x: number, y: number, f: Face, size: number, maxWidth: number, lineH: number, c: number, ls = 0): number {
  const lines = wrapText(text, f, size, maxWidth, ls);
  for (const line of lines) {
    drawText(cv, line, x, y, f, size, c, ls);
    y += lineH;
  }
  return y;
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

// 1 — Gulf strikes: a recognisable Strait of Hormuz. Iran's coast runs
// along the top, the Musandam peninsula of Oman juts up from the bottom,
// Qeshm Island sits in the strait between them, the shipping lane threads
// through it, and Bahrain and Kuwait are marked out in the Gulf.
function drawHormuz(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, SEA);
  const px = (u: number): number => x + u * w;
  const py = (v: number): number => y + v * h;
  // Iran: land along the top, coast dipping toward the strait.
  const iranCoast: Array<[number, number]> = [
    [0, 0.28], [0.24, 0.22], [0.45, 0.32], [0.62, 0.26], [0.8, 0.34], [1, 0.3],
  ];
  cv.poly(
    [[px(0), py(0)], [px(1), py(0)], [px(1), py(0.3)], [px(0.8), py(0.34)],
     [px(0.62), py(0.26)], [px(0.45), py(0.32)], [px(0.24), py(0.22)], [px(0), py(0.28)]],
    LAND,
  );
  // Oman / Musandam: land along the bottom-left, peninsula tip reaching up
  // toward the strait.
  const omanCoast: Array<[number, number]> = [
    [0, 0.74], [0.16, 0.68], [0.3, 0.72], [0.44, 0.58], [0.52, 0.52],
    [0.56, 0.66], [0.62, 0.86], [0.56, 1],
  ];
  cv.poly(
    [[px(0), py(1)], [px(0), py(0.74)], [px(0.16), py(0.68)], [px(0.3), py(0.72)],
     [px(0.44), py(0.58)], [px(0.52), py(0.52)], [px(0.56), py(0.66)],
     [px(0.62), py(0.86)], [px(0.56), py(1)]],
    LAND,
  );
  // Qeshm Island: long, low island in the strait below the Iranian coast.
  const qeshm: Array<[number, number]> = [
    [0.64, 0.4], [0.84, 0.38], [0.88, 0.46], [0.68, 0.48],
  ];
  cv.poly(qeshm.map(([u, v]) => [px(u), py(v)] as [number, number]), LAND);
  // Coastlines.
  for (let i = 0; i + 1 < iranCoast.length; i++) {
    cv.line(px(iranCoast[i][0]), py(iranCoast[i][1]), px(iranCoast[i + 1][0]), py(iranCoast[i + 1][1]), RULE);
  }
  for (let i = 0; i + 1 < omanCoast.length; i++) {
    cv.line(px(omanCoast[i][0]), py(omanCoast[i][1]), px(omanCoast[i + 1][0]), py(omanCoast[i + 1][1]), RULE);
  }
  for (let i = 0; i < qeshm.length; i++) {
    const a = qeshm[i];
    const b = qeshm[(i + 1) % qeshm.length];
    cv.line(px(a[0]), py(a[1]), px(b[0]), py(b[1]), RULE);
  }
  // Shipping lane through the strait: dashed, with an arrowhead leaving
  // toward the Gulf of Oman.
  const lane: Array<[number, number]> = [[0.02, 0.6], [0.4, 0.56], [0.62, 0.54], [0.98, 0.52]];
  for (let i = 0; i + 1 < lane.length; i++) {
    const ax = px(lane[i][0]);
    const ay = py(lane[i][1]);
    const bx = px(lane[i + 1][0]);
    const by = py(lane[i + 1][1]);
    const segs = 9;
    for (let s = 0; s < segs; s += 2) {
      cv.line(ax + ((bx - ax) * s) / segs, ay + ((by - ay) * s) / segs,
              ax + ((bx - ax) * (s + 1)) / segs, ay + ((by - ay) * (s + 1)) / segs, NAVY);
    }
  }
  cv.tri(px(0.98), py(0.52), px(0.94), py(0.52) - 4, px(0.94), py(0.52) + 4, NAVY);
  // Strike markers: the Qeshm missile site, and drones downed over Bahrain.
  burst(cv, px(0.76), py(0.43), 7, RED);
  cv.circle(px(0.1), py(0.48), 3, RED, true);
  burst(cv, px(0.1), py(0.48), 5, RED);
  cv.circle(px(0.06), py(0.36), 3, RED, true);
  // Labels.
  drawText(cv, "IRAN", px(0.44), py(0.13), F_SANS_B, 10, INK);
  drawText(cv, "OMAN", px(0.05), py(0.93), F_SANS_B, 10, INK);
  drawText(cv, "STRAIT OF HORMUZ", px(0.28), py(0.44), F_SANS_B, 9, NAVY);
  drawText(cv, "QESHM", px(0.88), py(0.44), F_SANS, 8, INK);
  drawText(cv, "BAHRAIN", px(0.15), py(0.5), F_SANS, 8, INK);
  drawText(cv, "KUWAIT", px(0.09), py(0.38), F_SANS, 8, INK);
  drawText(cv, "PERSIAN GULF", px(0.02), py(0.66), F_SANS, 8, NAVY2);
  drawText(cv, "GULF OF OMAN", px(0.8), py(0.84), F_SANS, 8, NAVY2);
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
  // Fallen span debris in the water, and a strait label.
  cv.fillRect(x + w * 0.4, y + h - 12, 12, 3, INK);
  cv.fillRect(x + w * 0.46, y + h - 8, 9, 3, INK);
  drawText(cv, "KERCH STRAIT", x + 6, y + h - 4, F_SANS, 8, INK);
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
  // APEC nameplate on the front of the table.
  const bw = 52;
  cv.fillRect(x + (w - bw) / 2, y + h * 0.68, bw, 11, RED);
  drawTextCentered(cv, "APEC", x + w / 2, y + h * 0.68 + 9, F_SANS_B, 9, 0xffffff);
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
  const tw = textWidth(label, F_SANS_B, 11);
  drawText(cv, label, cx - tw / 2, cy + 4, F_SANS_B, 11, 0xffffff);
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
//   masthead 8-100 · leads 108-290 · medium 296-420 / 426-550
//   numbers 556-626 · map 632-772 · briefs 775-985 · footer 988-1018
// ---------------------------------------------------------------------------
const W = 1024;
const H = 1024;
const MX = 14; // left margin
const CW = 996; // content width

function sectionHeader(cv: Canvas, text: string, x: number, y: number, w: number): void {
  cv.fillRect(x, y + 3, 8, 8, RED);
  drawText(cv, text, x + 14, y + 13, F_SERIF_B, 16, INK);
  cv.hline(x, x + w, y + 17, RULE);
}

// One brief line: "14. " + bold lead + " — " + rest, all 11px on a 13px
// leading (cap ~8px + descender ~2px leaves a clear gap between lines).
// Trims the rest (whole words) if the line would overflow the column.
function drawBriefLine(cv: Canvas, b: Brief, x: number, y: number, colW: number): void {
  const size = 11;
  let rest = b.rest;
  const lead = b.lead;
  const num = b.n + ". ";
  for (;;) {
    const total =
      textWidth(num, F_SANS, size) +
      textWidth(lead, F_SANS_B, size) +
      textWidth(" — " + rest, F_SANS, size);
    if (total <= colW || rest.indexOf(" ") < 0) break;
    rest = rest.slice(0, rest.lastIndexOf(" "));
    if (rest.length < 4) break;
  }
  let cx = x;
  cx += drawText(cv, num, cx, y, F_SANS, size, INK);
  cx += drawText(cv, lead, cx, y, F_SANS_B, size, INK);
  drawText(cv, " — " + rest, cx, y, F_SANS, size, INK);
}

function renderMasthead(cv: Canvas): void {
  cv.fillRect(8, 8, 1008, 92, NAVY);
  drawTextCentered(cv, "THE DAY IN WORLD NEWS", 512, 30, F_SERIF_B, 15, 0xe8ddc0, 3);
  drawTextCentered(cv, "WEDNESDAY 18 NOVEMBER 2026", 512, 75, F_SERIF_BLK, 50, 0xf7f3e8);
  drawTextCentered(cv, "42 STORIES · 6 CONTINENTS · ONE PAGE", 512, 93, F_SANS, 13, 0xe8ddc0, 1);
  cv.fillRect(8, 100, 1008, 2, RED);
}

function renderLeads(cv: Canvas): void {
  const colW = 326;
  const xs = [MX, MX + 334, MX + 668];
  for (let i = 0; i < 3; i++) {
    const f = FEATURES[i];
    const x = xs[i];
    f.draw(cv, x, 108, colW, 72);
    cv.rect(x, 108, colW, 72, INK);
    drawText(cv, f.n + " · " + f.tag, x, 192, F_SANS_B, 11, RED);
    let y = drawWrapped(cv, f.headline, x, 212, F_SERIF_B, 19, colW, 23, INK);
    drawWrapped(cv, f.deck, x, y + 5, F_SANS, 11, colW, 15, INK);
    if (i < 2) cv.vline(x + colW + 4, 108, 288, RULE);
  }
  cv.hline(MX, MX + CW, 290, INK);
}

function renderMedium(cv: Canvas, row: number, y0: number): void {
  const panelW = 192;
  const xs = [MX, MX + 200, MX + 400, MX + 600, MX + 800];
  for (let i = 0; i < 5; i++) {
    const f = FEATURES[row * 5 + 3 + i];
    const x = xs[i];
    f.draw(cv, x, y0, panelW, 34);
    cv.rect(x, y0, panelW, 34, INK);
    drawText(cv, f.n + " · " + f.tag, x, y0 + 46, F_SANS_B, 11, RED);
    let y = drawWrapped(cv, f.headline, x, y0 + 65, F_SERIF_B, 16, panelW, 19, INK);
    drawWrapped(cv, f.deck, x, y + 2, F_SANS, 11, panelW, 14, INK);
  }
  cv.hline(MX, MX + CW, y0 + 124, INK);
}

function renderNumbers(cv: Canvas): void {
  sectionHeader(cv, "BY THE NUMBERS", MX, 556, CW);
  const itemW = 243;
  const xs = [MX, MX + 251, MX + 502, MX + 753];
  for (let i = 0; i < 4; i++) {
    const x = xs[i];
    drawTextCentered(cv, NUMBERS[i].big, x + itemW / 2, 604, F_SERIF_BLK, 27, INK);
    drawTextCentered(cv, NUMBERS[i].cap, x + itemW / 2, 624, F_SANS, 11, GREY);
    if (i < 3) cv.vline(x + itemW + 4, 580, 626, RULE);
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
  sectionHeader(cv, "WHERE IT HAPPENED", MX, 632, CW);
  const mapX = MX;
  const mapY = 654;
  const mapW = 560;
  const mapH = 118;
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
  let ly = 660;
  drawText(cv, "PINS BY REGION", rx, ly, F_SANS_B, 10, INK);
  ly += 12;
  // Legend in two rows.
  let lx = rx;
  for (let i = 0; i < LEGEND.length; i++) {
    if (i === 4) {
      ly += 11;
      lx = rx;
    }
    cv.fillRect(lx, ly - 8, 10, 10, LEGEND[i].color);
    lx += 14;
    lx += drawText(cv, LEGEND[i].label, lx, ly, F_SANS, 10, INK);
    lx += 14;
  }
  ly += 13;
  // Pin list in two columns: features 1-7 left, 8-13 right.
  const col2x = rx + 210;
  for (let i = 0; i < FEATURES.length; i++) {
    const f = FEATURES[i];
    const colX = i < 7 ? rx : col2x;
    const rowY = ly + (i % 7) * 12;
    cv.fillRect(colX, rowY - 8, 8, 8, f.color);
    drawText(cv, f.n + " " + f.name, colX + 12, rowY, F_SANS, 10, INK);
  }
}

function renderBriefs(cv: Canvas): void {
  sectionHeader(cv, "ALSO ON WEDNESDAY 18 NOVEMBER", MX, 775, CW);
  const colW = 492;
  const y0 = 802;
  for (let i = 0; i < 15; i++) {
    drawBriefLine(cv, BRIEFS[i], MX, y0 + i * 13, colW);
  }
  for (let i = 0; i < 14; i++) {
    drawBriefLine(cv, BRIEFS[15 + i], MX + 504, y0 + i * 13, colW);
  }
}

function renderFooter(cv: Canvas): void {
  cv.hline(MX, MX + CW, 988, INK);
  drawTextCentered(
    cv,
    "Every story happened or was first reported on Wednesday 18 November 2026. Disputed claims are attributed.",
    512, 1000, F_SANS, 11, INK,
  );
  drawTextCentered(
    cv,
    "Sources: Reuters, AP, AFP, BBC, Al Jazeera, NASA, UN, WHO, IMD. Original drawings.",
    512, 1012, F_SANS, 11, GREY,
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
