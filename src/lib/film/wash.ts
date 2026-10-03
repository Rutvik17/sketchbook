/**
 * THE WATERCOLOUR.
 *
 * A wash is not a filled shape. Pigment in water spreads a little further in
 * some places than others, pools where it dries, and is laid in several thin
 * glazes — so the colour is uneven inside and darkest at a soft, wandering
 * edge. This paints that the way it happens:
 *
 * 1. The shape is cut into short edges and each edge is pushed in or out at
 *    random — the paint's first spread. That is the wash's `base`.
 * 2. Each glaze deforms the base again, differently, and is filled at a few
 *    percent opacity. Where the glazes agree the colour builds up; where they
 *    wander apart the edge goes soft.
 * 3. Every few glazes the edge is traced again in a darker, thinner line: the
 *    pigment that migrated outward as the water dried.
 *
 * A glaze is one `pass`, so a wash can be painted all at once (for a layer
 * baked out of sight) or a pass at a time in front of the viewer, which is
 * what the film does while it is "painting".
 */

import { gauss, rgb, type Rng } from './random';

export type Pt = readonly [number, number];

export interface WashStyle {
  color: string;
  /** Glazes. More is smoother and slower. */
  layers?: number;
  /** Opacity of each glaze. */
  alpha?: number;
  /** How far the paint wanders, as a fraction of each edge's length. */
  spread?: number;
  /** How strongly the drying edge darkens, 0–1. */
  edge?: number;
  /** The longest edge the shape is cut into before it wanders, in world units. */
  grain?: number;
}

/** Cut long edges so the wander is proportional to the scale of the shape's parts, not its whole. */
function subdivide(poly: Pt[], max: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / max));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/** One round of midpoint displacement: every edge gains a new point, pushed along the edge's normal. */
function deform(poly: Pt[], spread: number, r: Rng): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const g = gauss(r) * spread;
    const t = 0.5 + gauss(r) * 0.12;
    out.push(a, [a[0] + dx * t - dy * g, a[1] + dy * t + dx * g]);
  }
  return out;
}

function trace(ctx: CanvasRenderingContext2D, p: Pt[]) {
  ctx.beginPath();
  ctx.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
  ctx.closePath();
}

/** Anything laid a glaze at a time: a wash, or a portrait's glaze of the photograph. */
export interface Glazed {
  readonly layers: number;
  readonly cx: number;
  readonly cy: number;
  pass(ctx: CanvasRenderingContext2D, i: number): void;
}

export class Wash implements Glazed {
  readonly layers: number;
  readonly cx: number;
  readonly cy: number;
  private base: Pt[];
  private fill: string;
  private dark: string;
  private alpha: number;
  private spread: number;
  private edge: number;
  private r: Rng;

  constructor(poly: Pt[], style: WashStyle, r: Rng) {
    this.r = r;
    this.layers = style.layers ?? 14;
    this.alpha = style.alpha ?? 0.07;
    this.spread = style.spread ?? 0.3;
    this.edge = style.edge ?? 0.5;
    const [cr, cg, cb] = rgb(style.color);
    this.fill = `rgb(${cr},${cg},${cb})`;
    this.dark = `rgb(${Math.round(cr * 0.72)},${Math.round(cg * 0.72)},${Math.round(cb * 0.76)})`;

    let size = 0;
    let sx = 0;
    let sy = 0;
    for (const p of poly) {
      sx += p[0];
      sy += p[1];
    }
    this.cx = sx / poly.length;
    this.cy = sy / poly.length;
    for (const p of poly) size = Math.max(size, Math.hypot(p[0] - this.cx, p[1] - this.cy));

    // Short edges, so the paint wanders at the scale of a brush, not of the
    // whole shape — long edges displaced once make teeth, not a soft edge.
    let base = subdivide(poly, style.grain ?? Math.max(10, Math.min(22, size / 4)));
    base = deform(base, this.spread, r);
    base = deform(base, this.spread * 0.75, r);
    this.base = base;
  }

  /** Lay glaze `i` of `layers`. */
  pass(ctx: CanvasRenderingContext2D, i: number) {
    const r = this.r;
    let p = deform(this.base, this.spread * 0.6, r);
    p = deform(p, this.spread * 0.5, r);
    ctx.globalAlpha = this.alpha * (0.75 + r() * 0.5);
    ctx.fillStyle = this.fill;
    trace(ctx, p);
    ctx.fill();
    if (this.edge > 0 && i % 3 === 1) {
      ctx.globalAlpha = 0.09 * this.edge;
      ctx.strokeStyle = this.dark;
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  paint(ctx: CanvasRenderingContext2D) {
    for (let i = 0; i < this.layers; i++) this.pass(ctx, i);
  }
}

/** A roughly round blob of paint — a tree's crown, a shrub, a cloud. */
export function blob(cx: number, cy: number, rx: number, ry: number, r: Rng, points = 9): Pt[] {
  const out: Pt[] = [];
  const turn = r() * Math.PI * 2;
  for (let i = 0; i < points; i++) {
    const a = turn + (i / points) * Math.PI * 2;
    const k = 0.82 + r() * 0.3;
    out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return out;
}
