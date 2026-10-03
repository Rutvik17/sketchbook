/**
 * THE PENCIL.
 *
 * A ruled line drawn by hand is not straight: it starts a little early, bows
 * slightly along its length, and runs on past where it was aimed. Each stroke
 * here is a polyline carrying that — a gentle wobble across the line, a small
 * overshoot at both ends — and a pressure for every segment, so the graphite
 * is darker where the hand pressed and breaks up where it lifted.
 *
 * Strokes are data first and drawing second. The film draws them a length at
 * a time during the sketch, so the pencil can be watched moving; out of sight
 * they are drawn whole.
 */

import { gauss, type Rng } from './random';
import type { Pt } from './wash';

export interface Stroke {
  pts: Pt[];
  /** Pressure of each segment, 0–1 (segment i runs from pts[i] to pts[i+1]). */
  press: number[];
  /** Cumulative length at each point. */
  at: number[];
  length: number;
  width: number;
  tone: number;
}

export interface PencilStyle {
  width?: number;
  /** Darkness, 0–1. */
  tone?: number;
  /** Sideways wobble, in world units. */
  wobble?: number;
  /** Run past each end by up to this much. */
  overshoot?: number;
}

function measure(pts: Pt[]): number[] {
  const at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return at;
}

/** A hand-drawn version of the polyline through `path`. */
export function pencil(path: Pt[], r: Rng, style: PencilStyle = {}): Stroke {
  const wobble = style.wobble ?? 0.7;
  const over = style.overshoot ?? 3;
  const src = path.slice();
  if (src.length >= 2 && over > 0) {
    const [a, b] = [src[0], src[1]];
    const la = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const ea = r() * over;
    src[0] = [a[0] - ((b[0] - a[0]) / la) * ea, a[1] - ((b[1] - a[1]) / la) * ea];
    const [y, z] = [src[src.length - 2], src[src.length - 1]];
    const lz = Math.hypot(z[0] - y[0], z[1] - y[1]) || 1;
    const ez = r() * over;
    src[src.length - 1] = [z[0] + ((z[0] - y[0]) / lz) * ez, z[1] + ((z[1] - y[1]) / lz) * ez];
  }

  const pts: Pt[] = [];
  // A slow bow along the whole stroke and a faster tremor on top of it.
  const phase = r() * 6.28;
  const bow = gauss(r) * wobble;
  const total = measure(src);
  const len = total[total.length - 1] || 1;
  for (let i = 0; i < src.length - 1; i++) {
    const a = src[i];
    const b = src[i + 1];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(seg / 7));
    const nx = -(b[1] - a[1]) / (seg || 1);
    const ny = (b[0] - a[0]) / (seg || 1);
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const u = (total[i] + seg * t) / len;
      const off = Math.sin(u * Math.PI) * bow + Math.sin(phase + u * 17) * wobble * 0.3;
      pts.push([a[0] + (b[0] - a[0]) * t + nx * off, a[1] + (b[1] - a[1]) * t + ny * off]);
    }
  }
  pts.push(src[src.length - 1]);

  const press: number[] = [];
  const lift = r() * 6.28;
  for (let i = 0; i < pts.length - 1; i++) {
    const u = i / Math.max(1, pts.length - 2);
    // Lighter at the start and end of a stroke, with a slow waver of pressure.
    const ends = Math.min(1, 0.35 + Math.min(u, 1 - u) * 5);
    press.push(ends * (0.75 + 0.25 * Math.sin(lift + i * 0.6)));
  }
  const at = measure(pts);
  return { pts, press, at, length: at[at.length - 1], width: style.width ?? 1.1, tone: style.tone ?? 0.8 };
}

/** A straight ruled line, often gone over twice the way a sketch is. */
export function ruled(a: Pt, b: Pt, r: Rng, style: PencilStyle = {}, twice = 0.35): Stroke[] {
  const out = [pencil([a, b], r, style)];
  if (r() < twice) out.push(pencil([a, b], r, { ...style, tone: (style.tone ?? 0.8) * 0.45, wobble: (style.wobble ?? 0.7) * 1.6 }));
  return out;
}

/** Points on a curve through `pts`, for strokes that bend (branches, fronds, hills). */
export function curve(pts: Pt[], steps = 8): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Graphite, by darkness. */
function lead(tone: number): string {
  return `rgba(38,36,42,${tone.toFixed(3)})`;
}

/**
 * Draw the part of `s` between lengths `from` and `to`. Drawing a stroke in
 * pieces across frames joins up exactly, because each piece is whole segments
 * plus the fraction of one.
 */
export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, from = 0, to = s.length) {
  if (to <= from) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = s.width;
  const { pts, at } = s;
  for (let i = 0; i < pts.length - 1; i++) {
    const a0 = at[i];
    const a1 = at[i + 1];
    if (a1 <= from || a0 >= to) continue;
    const seg = a1 - a0 || 1;
    const t0 = Math.max(0, (from - a0) / seg);
    const t1 = Math.min(1, (to - a0) / seg);
    const a = pts[i];
    const b = pts[i + 1];
    ctx.strokeStyle = lead(s.tone * s.press[i]);
    ctx.beginPath();
    ctx.moveTo(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0);
    ctx.lineTo(a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1);
    ctx.stroke();
  }
}

/** Where the pencil's point is, `d` along the stroke. */
export function pointAt(s: Stroke, d: number): Pt {
  const { pts, at } = s;
  for (let i = 0; i < pts.length - 1; i++) {
    if (at[i + 1] >= d) {
      const t = (d - at[i]) / (at[i + 1] - at[i] || 1);
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
    }
  }
  return pts[pts.length - 1];
}

