/**
 * THE SKY, AND WHAT CROSSES IT.
 *
 * A sky in watercolour is mostly the paper. The clear day is a few pale
 * blotches of blue above the roofs and nothing else; the storm is heavy
 * slate laid wet into wet; dusk is bands — violet over rose over orange —
 * and night is the whole sheet flooded with blue.
 *
 * Skies are soft, so they are painted small, a fraction of the screen's
 * resolution, and scaled up: nothing in them needs a crisp edge, and at a
 * quarter of the size they cost a sixteenth of the time.
 */

import type { SkyId } from '@/content/film';
import { between, pick, rng } from './random';
import { blob, Wash, type Pt } from './wash';

/** Bigger than any screen shape can reveal, so the edge of the sky is never seen. */
export const SKY_BOUNDS = { x: -900, y: -1100, w: 3400, h: 2050 };
const SKY_SCALE = 0.3;

function band(y0: number, y1: number, r: () => number): Pt[] {
  const pts: Pt[] = [];
  const x0 = SKY_BOUNDS.x + 60;
  const x1 = SKY_BOUNDS.x + SKY_BOUNDS.w - 60;
  for (let x = x0; x <= x1; x += 200) pts.push([x, y0 + between(r, -30, 30)]);
  for (let x = x1; x >= x0; x -= 200) pts.push([x, y1 + between(r, -40, 40)]);
  return pts;
}

export function paintSky(id: SkyId): HTMLCanvasElement {
  const r = rng(id.length * 131 + 7);
  const c = document.createElement('canvas');
  c.width = Math.round(SKY_BOUNDS.w * SKY_SCALE);
  c.height = Math.round(SKY_BOUNDS.h * SKY_SCALE);
  const ctx = c.getContext('2d')!;
  ctx.setTransform(SKY_SCALE, 0, 0, SKY_SCALE, -SKY_BOUNDS.x * SKY_SCALE, -SKY_BOUNDS.y * SKY_SCALE);
  const wash = (poly: Pt[], color: string, alpha: number, layers = 10, spread = 0.3, edge = 0.3) => new Wash(poly, { color, alpha, layers, spread, edge }, r).paint(ctx);

  if (id === 'clear') {
    for (let k = 0; k < 7; k++) {
      wash(blob(between(r, 150, 1450), between(r, 40, 200), between(r, 120, 260), between(r, 40, 80), r), pick(r, ['#b7cde2', '#c5d6e6', '#a9c2dc']), 0.05, 10, 0.35, 0.4);
    }
  } else if (id === 'storm') {
    wash(band(-1000, 900, r), '#8a91a6', 0.05, 8, 0.2, 0.1);
    for (let k = 0; k < 22; k++) {
      wash(blob(between(r, -500, 2100), between(r, -700, 420), between(r, 200, 420), between(r, 90, 200), r), pick(r, ['#59627d', '#6f7791', '#4d5470', '#828aa1']), 0.06, 10, 0.35, 0.5);
    }
  } else if (id === 'dusk') {
    wash(band(-1000, -150, r), '#5d5496', 0.09, 10, 0.2, 0.2);
    wash(band(-250, 180, r), '#b8779c', 0.08, 10, 0.2, 0.3);
    wash(band(100, 360, r), '#e4917a', 0.09, 10, 0.2, 0.3);
    wash(band(280, 470, r), '#f2b86a', 0.09, 10, 0.2, 0.3);
    wash(band(430, 900, r), '#e8a47c', 0.04, 8, 0.2, 0.1);
    for (let k = 0; k < 8; k++) wash(blob(between(r, 0, 1600), between(r, 60, 300), between(r, 150, 300), between(r, 16, 34), r), '#8d5a86', 0.07, 8, 0.4, 0.5);
  } else if (id === 'night') {
    wash(band(-1050, 920, r), '#4a5790', 0.14, 12, 0.15, 0.1);
    for (let k = 0; k < 20; k++) {
      wash(blob(between(r, -500, 2100), between(r, -800, 700), between(r, 200, 420), between(r, 120, 260), r), pick(r, ['#3a4680', '#56639f', '#2f3a6e']), 0.06, 10, 0.4, 0.3);
    }
  } else {
    wash(band(-1000, -100, r), '#9086bb', 0.08, 10, 0.2, 0.2);
    wash(band(-200, 260, r), '#dca9bb', 0.08, 10, 0.2, 0.3);
    wash(band(200, 470, r), '#f4cfa2', 0.1, 10, 0.2, 0.3);
    wash(band(430, 900, r), '#e8c1b5', 0.04, 8, 0.2, 0.1);
    for (let k = 0; k < 6; k++) wash(blob(between(r, 0, 1600), between(r, 40, 260), between(r, 160, 280), between(r, 18, 36), r), '#c48fa8', 0.07, 8, 0.4, 0.5);
  }
  return c;
}

/* ---------------- clouds: small paintings that drift ---------------- */

export interface Cloud {
  x: number;
  y: number;
  speed: number;
  art: HTMLCanvasElement;
  storm: boolean;
  w: number;
  h: number;
}

const CLOUD_SCALE = 0.5;

function paintCloud(seed: number, storm: boolean): HTMLCanvasElement {
  const r = rng(seed);
  const w = 420;
  const h = 170;
  const c = document.createElement('canvas');
  c.width = w * CLOUD_SCALE;
  c.height = h * CLOUD_SCALE;
  const ctx = c.getContext('2d')!;
  ctx.scale(CLOUD_SCALE, CLOUD_SCALE);
  const cols = storm ? ['#5a6380', '#4a526c', '#6c7590'] : ['#b3c1d3', '#c3cfdd', '#a2b3c9'];
  for (let k = 0; k < 9; k++) {
    const cx = between(r, 90, w - 90);
    const cy = between(r, 60, h - 50) + (Math.abs(cx - w / 2) / w) * 30;
    new Wash(blob(cx, cy, between(r, 50, 90), between(r, 26, 44), r), { color: pick(r, cols), layers: 9, alpha: storm ? 0.08 : 0.06, spread: 0.35, edge: 0.6 }, r).paint(ctx);
  }
  // The flat, darker underside a cloud sits on.
  new Wash([[70, h - 60], [w - 70, h - 64], [w - 110, h - 40], [110, h - 38]], { color: cols[1], layers: 6, alpha: 0.07, spread: 0.3, edge: 0.5 }, r).paint(ctx);
  return c;
}

export function makeClouds(): Cloud[] {
  const r = rng(99);
  const out: Cloud[] = [];
  for (let k = 0; k < 7; k++) {
    const storm = k >= 3;
    out.push({ x: between(r, -300, 1800), y: storm ? between(r, 120, 260) : between(r, 130, 240), speed: between(r, 6, 14), art: paintCloud(200 + k, storm), storm, w: 420, h: 170 });
  }
  return out;
}
