/**
 * THE SUBJECT: NVIDIA'S CAMPUS IN SANTA CLARA, FROM THE AIR.
 *
 * Drawn to NVIDIA's own aerial photograph of the campus ("Aerial View of
 * NVIDIA Voyager and Endeavor", Gensler / Jason O'Rear Photography, on the
 * NVIDIA newsroom), and to the buildings' published facts:
 *
 * - **Endeavor**, in front and to the left: a triangular floor plate with
 *   beveled corners, two storeys. Its roof is WHITE — a crystalline field of
 *   big triangular facets, each tilted a little differently so each catches
 *   the light differently, set with rows of small triangular skylights, with
 *   a little courtyard cut into it. The roof oversails the walls, which are
 *   dark sloped glass above a planted green bank.
 * - **Voyager**, behind it and to the right: the same language, larger —
 *   four storeys, 68 ft. In front of its southwest face stands the trellis:
 *   white steel columns branching like trees, carrying a canopy of dark solar
 *   panels 70 ft up, 240 ft across.
 * - San Tomas Expressway sweeps up the right-hand side, a covered footbridge
 *   crossing it from Voyager; another road runs up to the left from the
 *   junction in the foreground; between them, in front of Endeavor, a lawn
 *   wedge with a path cut diagonally across it to the door. Beyond, low
 *   white-roofed Santa Clara runs to the hills.
 *
 * Everything is described on a PLAN, in metres (x to the right, y away from
 * the camera, z up), and projected through one camera — high, looking across
 * the campus — so the buildings, trees, people, cars and rain all share one
 * perspective. Nothing on screen is placed by eye.
 *
 * Out of the geometry come:
 * - `ink`, the pencil drawing, in the order the hand draws it;
 * - washes: the `build` layer (painted once), and for each season a ground
 *   layer (grass, under the buildings) and a top layer (trees, snow);
 * - the fittings the living scene needs, kept on the plan for `life.ts`.
 */

import { between, pick, rng } from './random';
import { blob, Wash, type Pt, type WashStyle } from './wash';
import { curve, pencil, ruled, type Stroke } from './pencil';

/** The part of the world that is painted. */
export const PAINTED = { x: 200, y: 150, w: 1260, h: 830 };

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

/* ------------------------------------------------------------------ *
 * The camera                                                          *
 * ------------------------------------------------------------------ */

// High to the south-west, 20° down, as the photograph is taken: the junction
// at the foot of the frame, the expressway sweeping up the right, the town
// and the hills above.
const PITCH = (20 * Math.PI) / 180;
const CAM_H = 260;
const CAM_Y = -760;
const FOCAL = 1500;
const CX = 820;
const CY = 640;
const cosP = Math.cos(PITCH);
const sinP = Math.sin(PITCH);

/** A point on the plan, `z` metres up, into the world the film draws in. */
export function proj(x: number, y: number, z = 0): Pt {
  const qy = y - CAM_Y;
  const qz = z - CAM_H;
  const depth = qy * cosP - qz * sinP;
  const up = qy * sinP + qz * cosP;
  return [CX + (x / depth) * FOCAL, CY - (up / depth) * FOCAL];
}

/** World units per metre at a depth `y` on the plan (and height `z`): how far across does not change it. */
export function scaleAt(y: number, z = 0): number {
  return FOCAL / ((y - CAM_Y) * cosP - (z - CAM_H) * sinP);
}

/** How much a circle on the ground is squashed on screen. */
export const GROUND_SQUASH = Math.sin(PITCH + 0.12);

export type P3 = readonly [number, number, number];

export interface Tree {
  cx: number;
  cy: number;
  r: number;
  base: number;
  kind: 'shade' | 'blossom' | 'palm' | 'street';
}

export interface Walk {
  path: Pt[];
  spread: number;
  weight: number;
  door?: boolean;
}

export interface Lane {
  path: Pt[];
}

export interface Window {
  quad: [Pt, Pt, Pt, Pt];
  warm: boolean;
}

/** A strip of hard surface on the plan — a road, a path — that rain splashes on. */
export interface Strip {
  a: Pt;
  b: Pt;
  width: number;
}

export interface Campus {
  ink: Stroke[];
  build: Wash[];
  seasons: Record<Season, Wash[]>;
  ground: Record<Season, Wash[]>;
  windows: Window[];
  /** The roof's edge above Endeavor's front glass, lit in sequence at night. */
  fascia: [Pt, Pt, Pt][];
  skylights: [Pt, Pt, Pt][];
  lamps: Pt[];
  lampFeet: Pt[];
  trees: Tree[];
  walks: Walk[];
  terrace: Pt[];
  lanes: Lane[];
  wet: Strip[];
  /** Each building's silhouette on screen: anything drawn behind one is hidden by it. */
  occluders: Pt[][];
}

/** The convex hull of some screen points (Andrew's monotone chain). */
function hull(points: Pt[]): Pt[] {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Is screen point (x, y) hidden behind any of the silhouettes? */
export function hidden(occluders: Pt[][], x: number, y: number): boolean {
  return occluders.some((o) => inside(o, x, y));
}

/* ------------------------------------------------------------------ *
 * The palette                                                         *
 * ------------------------------------------------------------------ */

const PAINT = {
  skylight: '#5f7488',
  glass: '#46546a',
  glassLight: '#8aa2b8',
  shadow: '#4b4d57',
  solar: '#2c3654',
  steel: '#f4f3ef',
  paving: '#cfc6b6',
  road: '#8d919b',
  roofFar: '#e8e4dc',
  townRoof: '#ebe7df',
  townWall: '#bdb6aa',
  hills: '#8f98b6',
  hillsFar: '#aeb5cc',
  bank: '#5f8a45',
};

const GRASS: Record<Season, [string, string]> = {
  spring: ['#9dbb5e', '#7fa84c'],
  summer: ['#86a846', '#6f9a3c'],
  autumn: ['#b9a456', '#a88d45'],
  winter: ['#edf1f7', '#cfd8e6'],
};
const CROWN: Record<Season, string[]> = {
  spring: ['#9cc45a', '#78ad4b', '#b4d173'],
  summer: ['#4d8a34', '#3f7a33', '#6fa443', '#2f6a35'],
  autumn: ['#e08a2b', '#d4602a', '#eba42c', '#b8392c', '#c9772e'],
  winter: [],
};
const BLOSSOM = ['#f2a9bb', '#e98aa5', '#f7c6d2'];
const EVERGREEN: Record<Season, string[]> = {
  spring: ['#5f8f45', '#4d7d3c'],
  summer: ['#4a7d38', '#3d6d33'],
  autumn: ['#587a3c', '#6b8440'],
  winter: ['#5b7a55', '#4e6c4c'],
};

/* ------------------------------------------------------------------ *
 * Plan geometry                                                       *
 * ------------------------------------------------------------------ */

function bevelled(cx: number, cy: number, side: number, rot: number, bevel: number): Pt[] {
  const R = side / Math.sqrt(3);
  const v: Pt[] = [0, 1, 2].map((k) => [cx + Math.cos(rot + (k * 2 * Math.PI) / 3) * R, cy + Math.sin(rot + (k * 2 * Math.PI) / 3) * R]);
  const out: Pt[] = [];
  for (let k = 0; k < 3; k++) {
    const a = v[k];
    const toward = (b: Pt): Pt => {
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return [a[0] + ((b[0] - a[0]) / d) * bevel, a[1] + ((b[1] - a[1]) / d) * bevel];
    };
    out.push(toward(v[(k + 2) % 3]), toward(v[(k + 1) % 3]));
  }
  return out;
}

function inset(poly: Pt[], d: number): Pt[] {
  const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
  const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  return poly.map(([x, y]) => {
    const l = Math.hypot(x - cx, y - cy);
    return [cx + ((x - cx) * (l - d)) / l, cy + ((y - cy) * (l - d)) / l] as Pt;
  });
}

function inside(poly: Pt[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const lerp2 = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** The quadrilateral of a strip of width `w` from a to b. */
function band(a: Pt, b: Pt, w: number): Pt[] {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const nx = (-(b[1] - a[1]) / l) * (w / 2);
  const ny = ((b[0] - a[0]) / l) * (w / 2);
  return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
}

/* The roads, on the plan. */
/** San Tomas Expressway's western kerb, as a function of y. */
const expressWest = (y: number) => 120 + (y + 300) * 0.24;
const EXPRESS_W = 46;
/** The road running up to the left from the junction. */
const ROAD_A: Pt = [80, -320];
const ROAD_B: Pt = [-760, 300];
const ROAD_W = 26;

export function buildCampus(seed = 17): Campus {
  const r = rng(seed);
  const ink: Stroke[] = [];
  const build: Wash[] = [];
  const under: Wash[] = [];
  const seasons: Record<Season, Wash[]> = { spring: [], summer: [], autumn: [], winter: [] };
  const ground: Record<Season, Wash[]> = { spring: [], summer: [], autumn: [], winter: [] };
  const windows: Window[] = [];
  const fascia: [Pt, Pt, Pt][] = [];
  const skylights: [Pt, Pt, Pt][] = [];
  const lamps: Pt[] = [];
  const lampFeet: Pt[] = [];
  const trees: Tree[] = [];

  const stageOf: number[] = [];
  const stage = (n: number) => {
    while (stageOf.length < ink.length) stageOf.push(n);
  };

  const P = (x: number, y: number, z = 0) => proj(x, y, z);
  const flat = (poly: Pt[], z = 0) => poly.map(([x, y]) => P(x, y, z));
  type Style = Parameters<typeof pencil>[2];
  const line3 = (a: P3, b: P3, style?: Style, twice = 0.25) => ink.push(...ruled(P(a[0], a[1], a[2]), P(b[0], b[1], b[2]), r, style, twice));
  const lineOn = (a: Pt, b: Pt, z: number, style?: Style, twice = 0.25) => line3([a[0], a[1], z], [b[0], b[1], z], style, twice);
  const post = (x: number, y: number, z0: number, z1: number, style?: Style) => ink.push(pencil([P(x, y, z0), P(x, y, z1)], r, { overshoot: 0, ...style }));
  const outline = (poly: Pt[], z: number, style?: Style) => {
    for (let i = 0; i < poly.length; i++) lineOn(poly[i], poly[(i + 1) % poly.length], z, style, 0.35);
  };
  const paint = (into: Wash[], poly: Pt[], style: WashStyle) => into.push(new Wash(poly, style, r));
  const everySeason = (fn: (s: Season, into: Wash[]) => void) => SEASONS.forEach((s) => fn(s, seasons[s]));
  const everyGround = (fn: (s: Season, into: Wash[]) => void) => SEASONS.forEach((s) => fn(s, ground[s]));
  const facing = (a: Pt, b: Pt) => {
    const nx = b[1] - a[1];
    const ny = -(b[0] - a[0]);
    return nx * (0 - (a[0] + b[0]) / 2) + ny * (CAM_Y - (a[1] + b[1]) / 2) > 0;
  };
  /** Light comes from the upper left, low: the photograph's late sun. */
  const SUN = (() => {
    const v = [-0.55, -0.35, 0.76];
    const l = Math.hypot(...v);
    return v.map((c) => c / l);
  })();

  /* ---------------- a building: dark sloped glass under a white faceted roof ---------------- */

  const building = (o: { cx: number; cy: number; side: number; rot: number; bevel: number; glass: number; roof: number; floors: number; facets: number; lattice: number; skyShare: number; rise: number }) => {
    const top = bevelled(o.cx, o.cy, o.side, o.rot, o.bevel);
    // The roof oversails the glass: the wall stands well back under it.
    const foot = inset(top, 7);
    const n = top.length;

    for (let i = 0; i < n; i++) {
      const a = top[i];
      const b = top[(i + 1) % n];
      if (!facing(a, b)) continue;
      const fa = foot[i];
      const fb = foot[(i + 1) % n];
      const at = (tt: number, zz: number) => {
        const p = lerp2(fa, fb, tt);
        return P(p[0], p[1], zz);
      };
      const q: Pt[] = [at(0, 0), at(1, 0), at(1, o.glass), at(0, o.glass)];
      paint(build, q, { color: PAINT.glass, layers: 14, alpha: 0.085, spread: 0.08, edge: 0.5, grain: 14 });
      for (let k = 0; k < 3; k++) {
        const t = between(r, 0.1, 0.85);
        paint(build, [lerp2(q[3], q[2], t), lerp2(q[3], q[2], t + 0.05), lerp2(q[0], q[1], t + 0.02), lerp2(q[0], q[1], t - 0.03)], { color: PAINT.glassLight, layers: 4, alpha: 0.08, spread: 0.1, edge: 0 });
      }
      // The deep shadow under the roof's edge.
      paint(build, [P(a[0], a[1], o.roof - 1), P(b[0], b[1], o.roof - 1), at(1, o.glass), at(0, o.glass)], { color: PAINT.shadow, layers: 8, alpha: 0.08, spread: 0.08, edge: 0.2 });
      lineOn(fa, fb, 0, { width: 1 }, 0.3);
      lineOn(fa, fb, o.glass, { width: 0.8, tone: 0.7 }, 0);
      const bands = Math.round(o.glass / 2.4);
      const perFloor = Math.max(1, Math.round(bands / o.floors));
      for (let k = 1; k < bands; k++) lineOn(fa, fb, (o.glass * k) / bands, { width: 0.45, tone: k % perFloor === 0 ? 0.5 : 0.18, overshoot: 0, wobble: 0.2 }, 0);
      const len = Math.hypot(fb[0] - fa[0], fb[1] - fa[1]);
      const cols = Math.max(1, Math.round(len / 11));
      for (let k = 0; k < cols; k++) {
        if (k > 0) ink.push(pencil([at(k / cols, 0), at(k / cols, o.glass)], r, { width: 0.4, tone: 0.2, overshoot: 0, wobble: 0.2 }));
        for (let f = 0; f < o.floors; f++) {
          if (r() < 0.5) continue;
          const z0 = (o.glass / o.floors) * f + 0.5;
          const z1 = (o.glass / o.floors) * (f + 1) - 0.5;
          windows.push({ quad: [at(k / cols, z0), at((k + 1) / cols, z0), at((k + 1) / cols, z1), at(k / cols, z1)], warm: r() < 0.75 });
        }
      }
      // The roof's thick white edge, seen face on.
      paint(build, [P(a[0], a[1], o.roof - 2), P(b[0], b[1], o.roof - 2), P(b[0], b[1], o.roof), P(a[0], a[1], o.roof)], { color: '#dcdad4', layers: 6, alpha: 0.12, spread: 0.06, edge: 0.4 });
      lineOn(a, b, o.roof - 2, { width: 0.8, tone: 0.7 }, 0);
    }

    // The roof: a lattice of big facets, each lifted a little at its corners,
    // shaded by how squarely it faces the sun.
    const R = o.side / Math.sqrt(3);
    const V: Pt[] = [0, 1, 2].map((k) => [o.cx + Math.cos(o.rot + (k * 2 * Math.PI) / 3) * R, o.cy + Math.sin(o.rot + (k * 2 * Math.PI) / 3) * R]);
    const baryAt = (m: number) => (i: number, j: number): Pt => [
      V[0][0] + (V[1][0] - V[0][0]) * (i / m) + (V[2][0] - V[0][0]) * (j / m),
      V[0][1] + (V[1][1] - V[0][1]) * (i / m) + (V[2][1] - V[0][1]) * (j / m),
    ];
    const m = o.facets;
    const big = baryAt(m);
    const edgeDist = (x: number, y: number) =>
      Math.min(
        ...top.map((p, i) => {
          const q = top[(i + 1) % n];
          const ex = q[0] - p[0];
          const ey = q[1] - p[1];
          return Math.abs((x - p[0]) * ey - (y - p[1]) * ex) / Math.hypot(ex, ey);
        }),
      );
    const lift = new Map<string, number>();
    const zAt = (i: number, j: number) => {
      const key = `${i},${j}`;
      if (!lift.has(key)) {
        const [x, y] = big(i, j);
        const d = inside(top, x, y) ? edgeDist(x, y) : 0;
        lift.set(key, o.roof + Math.min(1, d / 30) * o.rise * (0.35 + 0.65 * r()));
      }
      return lift.get(key)!;
    };
    // The roof's own white, then each facet's shade over it.
    paint(build, flat(top, o.roof), { color: '#ecebe6', layers: 14, alpha: 0.09, spread: 0.05, edge: 0.4, grain: 16 });
    const room = inset(top, 5);
    const facetsDrawn: [Pt, Pt, Pt][] = [];
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m - i; j++) {
        for (const tri of [[[i, j], [i + 1, j], [i, j + 1]], [[i + 1, j], [i + 1, j + 1], [i, j + 1]]] as [number, number][][]) {
          if (tri.some(([a, b]) => a + b > m)) continue;
          const pts = tri.map(([a, b]) => big(a, b));
          if (!pts.every((p) => inside(room, p[0], p[1]))) continue;
          const p3 = tri.map(([a, b], k) => [pts[k][0], pts[k][1], zAt(a, b)]);
          const u = [p3[1][0] - p3[0][0], p3[1][1] - p3[0][1], p3[1][2] - p3[0][2]];
          const v = [p3[2][0] - p3[0][0], p3[2][1] - p3[0][1], p3[2][2] - p3[0][2]];
          let nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
          if (nrm[2] < 0) nrm = nrm.map((c) => -c);
          const nl = Math.hypot(...nrm);
          const lit = (nrm[0] * SUN[0] + nrm[1] * SUN[1] + nrm[2] * SUN[2]) / nl;
          const scr = p3.map(([x, y, z]) => P(x, y, z)) as [Pt, Pt, Pt];
          facetsDrawn.push(scr);
          const shade = Math.max(0, Math.min(1, (0.99 - lit) * 5));
          build.push(new Wash([...scr], { color: '#9ea3ad', layers: 3, alpha: 0.02 + shade * 0.13, spread: 0.02, edge: 0, grain: 60 }, r));
          ink.push(pencil([scr[0], scr[1], scr[2], scr[0]], r, { width: 0.45, tone: 0.22, wobble: 0.15, overshoot: 0 }));
        }
      }
    }
    outline(top, o.roof, { width: 1.2, tone: 0.85 });
    // Skylights: small dark triangles in rows along the facets.
    const small = baryAt(o.lattice);
    const room2 = inset(top, 9);
    for (let i = 0; i < o.lattice; i++) {
      for (let j = 0; j < o.lattice - i; j++) {
        if ((i + 2 * j) % 3 !== 0) continue;
        const tri: Pt[] = [small(i, j), small(i + 1, j), small(i, j + 1)];
        const c: Pt = [(tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][1] + tri[1][1] + tri[2][1]) / 3];
        if (!inside(room2, c[0], c[1]) || r() > o.skyShare) continue;
        const zc = o.roof + Math.min(1, edgeDist(c[0], c[1]) / 30) * o.rise * 0.6;
        const s = tri.map((p) => { const q = lerp2(c, p, 0.55); return P(q[0], q[1], zc); }) as [Pt, Pt, Pt];
        skylights.push(s);
        build.push(new Wash([...s], { color: PAINT.skylight, layers: 3, alpha: 0.15, spread: 0.03, edge: 0, grain: 30 }, r));
      }
    }
    return { top, foot, zAt, big };
  };

  /* ---------------- Endeavor ---------------- */

  // A vertex points left; the long southwest face looks toward the camera.
  const E = building({ cx: 0, cy: 20, side: 256, rot: Math.PI, bevel: 40, glass: 10, roof: 14, floors: 2, facets: 11, lattice: 24, skyShare: 0.5, rise: 6 });
  // The courtyard cut into its roof, near the back edge, with planting in it.
  {
    const c = lerp2(E.top[3], E.top[4], 0.5);
    const cc: Pt = [c[0] - 26, c[1] - 12];
    const tri: Pt[] = [[cc[0] - 14, cc[1] + 8], [cc[0] + 12, cc[1] + 12], [cc[0] - 2, cc[1] - 14]];
    paint(build, flat(tri, 12), { color: '#6d8f58', layers: 8, alpha: 0.12, spread: 0.1, edge: 0.4 });
    outline(tri, 14, { width: 0.8, tone: 0.7 });
  }
  // The front edge of the roof, as a band of triangles lit in sequence at night.
  for (let i = 0; i < E.top.length; i++) {
    const a = E.top[i];
    const b = E.top[(i + 1) % E.top.length];
    if (!facing(a, b)) continue;
    const k = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 7));
    for (let j = 0; j < k; j++) {
      const p0 = lerp2(a, b, j / k);
      const p1 = lerp2(a, b, (j + 0.5) / k);
      const p2 = lerp2(a, b, (j + 1) / k);
      fascia.push([P(p0[0], p0[1], 12), P(p1[0], p1[1], 14), P(p2[0], p2[1], 12)]);
    }
  }
  stage(1);

  /* ---------------- Voyager ---------------- */

  const Vy = building({ cx: 100, cy: 335, side: 286, rot: Math.PI, bevel: 44, glass: 17, roof: 21, floors: 4, facets: 12, lattice: 26, skyShare: 0.45, rise: 7 });
  // Its southwest face: the one the trellis stands in front of.
  let sw: [Pt, Pt] = [Vy.top[1], Vy.top[2]];
  let best = -Infinity;
  for (let i = 0; i < Vy.top.length; i++) {
    const a = Vy.top[i];
    const b = Vy.top[(i + 1) % Vy.top.length];
    const nx = b[1] - a[1];
    const ny = -(b[0] - a[0]);
    const score = (nx * Math.cos((4 * Math.PI) / 3) + ny * Math.sin((4 * Math.PI) / 3)) / Math.hypot(nx, ny) + Math.hypot(b[0] - a[0], b[1] - a[1]) / 1000;
    if (score > best) {
      best = score;
      sw = [a, b];
    }
  }
  stage(2);

  /* ---------------- the trellis ---------------- */

  // White steel trees in front of Voyager's southwest face, carrying a canopy
  // of dark solar panels 70 ft (21 m) up, 240 ft (73 m) across.
  const [sa, sb] = sw;
  const mid = lerp2(sa, sb, 0.62);
  const sl = Math.hypot(sb[0] - sa[0], sb[1] - sa[1]);
  const along: Pt = [(sb[0] - sa[0]) / sl, (sb[1] - sa[1]) / sl];
  const out: Pt = [along[1], -along[0]];
  const CZ = 21;
  const cpt = (u: number, v: number): Pt => [mid[0] + along[0] * u * 36.5 + out[0] * (v * 44 + 24), mid[1] + along[1] * u * 36.5 + out[1] * (v * 44 + 24)];
  const hub = cpt(0, 0.5);
  // The canopy's outline: a broad, irregular star of panels.
  const canopy: Pt[] = Array.from({ length: 12 }, (_, k) => {
    const a = (k / 12) * Math.PI * 2;
    const rr = (k % 2 ? 26 : 38) * between(r, 0.9, 1.08);
    return [hub[0] + Math.cos(a) * rr, hub[1] + Math.sin(a) * rr * 0.72] as Pt;
  });
  const forecourt = inset(canopy, -14);
  paint(under, flat(forecourt), { color: PAINT.paving, layers: 10, alpha: 0.07, spread: 0.1, edge: 0.3 });
  paint(under, flat(canopy.map(([x, y]) => [x + 10, y - 16] as Pt)), { color: '#7d7a78', layers: 8, alpha: 0.07, spread: 0.1, edge: 0.2 });
  // The trees: trunks, then three or four branches spreading to the canopy.
  const trunks: Pt[] = [cpt(-0.45, 0.35), cpt(0.1, 0.25), cpt(0.5, 0.55), cpt(-0.1, 0.8), cpt(-0.6, 0.85)];
  for (const [bx, by] of trunks) {
    paint(build, [P(bx - 0.9, by, 0), P(bx + 0.9, by, 0), P(bx + 0.9, by, 10), P(bx - 0.9, by, 10)], { color: PAINT.steel, layers: 4, alpha: 0.4, spread: 0.02, edge: 0 });
    post(bx, by, 0, 10, { width: 0.9, tone: 0.55 });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      const tip: Pt = [bx + Math.cos(a) * 13, by + Math.sin(a) * 10];
      line3([bx, by, 10], [tip[0], tip[1], CZ - 0.6], { width: 0.7, tone: 0.5, overshoot: 0 }, 0);
    }
  }
  paint(build, flat(inset(canopy, -2), CZ), { color: '#f1efe9', layers: 6, alpha: 0.3, spread: 0.04, edge: 0.3 });
  paint(build, flat(inset(canopy, 3), CZ), { color: PAINT.solar, layers: 12, alpha: 0.09, spread: 0.05, edge: 0.4 });
  // Its white frame: spokes and rings, the panels between them.
  canopy.forEach((p, k) => {
    lineOn(hub, p, CZ, { width: 0.6, tone: 0.45, overshoot: 0 }, 0);
    lineOn(p, canopy[(k + 1) % canopy.length], CZ, { width: 0.9, tone: 0.8 }, 0.2);
    const q = lerp2(hub, p, 0.55);
    const q2 = lerp2(hub, canopy[(k + 1) % canopy.length], 0.55);
    lineOn(q, q2, CZ, { width: 0.5, tone: 0.4, overshoot: 0 }, 0);
  });
  stage(3);

  /* ---------------- the ground ---------------- */

  const campus: Pt[] = [[-720, 300], [70, -296], [expressWest(-296) - 6, -296], [expressWest(760) - 6, 760], [-720, 760]];
  // The lawn wedge in front of Endeavor, between the two roads.
  const wedge: Pt[] = [[-660, 270], [60, -286], [expressWest(-286) - 10, -286], [expressWest(-80) - 10, -80], [90, -120], [-40, -110], [-160, -30], [-300, 100], [-420, 190]];
  // Round Voyager, and on beyond the buildings.
  const lawns: Pt[][] = [
    campus,
    wedge,
    [[-30, 170], [70, 150], [90, 230], [-10, 262]],
    [[-720, 330], [-240, 110], [-180, 420], [-720, 520]],
    [[-300, 450], [260, 520], [expressWest(520) - 10, 520], [expressWest(760) - 10, 760], [-720, 760], [-720, 560]],
    [[expressWest(-40) - 8, -40], [expressWest(160) - 8, 160], [120, 90], [110, -40]],
  ];
  everyGround((s, into) => {
    const [g0, g1] = GRASS[s];
    const alpha = s === 'winter' ? 0.13 : 0.08;
    lawns.forEach((lawn, i) => paint(into, flat(lawn), { color: i === 1 ? g1 : g0, layers: i === 0 ? 10 : 12, alpha: i === 0 ? alpha * 0.8 : alpha, spread: 0.12, edge: 0.4, grain: 22 }));
    if (s === 'winter') paint(into, flat(campus), { color: '#eef2f8', layers: 10, alpha: 0.12, spread: 0.15, edge: 0.2, grain: 30 });
  });
  // The planted bank along Endeavor's front, under the glass.
  for (let i = 0; i < E.foot.length; i++) {
    const a = E.foot[i];
    const b = E.foot[(i + 1) % E.foot.length];
    if (!facing(a, b)) continue;
    const o = inset(E.foot, -10);
    everyGround((s, into) => paint(into, flat([a, b, o[(i + 1) % o.length], o[i]]), { color: s === 'winter' ? '#dfe6ee' : PAINT.bank, layers: 10, alpha: s === 'winter' ? 0.2 : 0.1, spread: 0.1, edge: 0.4 }));
  }
  everySeason((s, into) => {
    if (s !== 'winter') return;
    paint(into, flat(canopy, CZ + 0.2), { color: '#f6f8fb', layers: 8, alpha: 0.25, spread: 0.1, edge: 0.3 });
  });
  const plazaE = inset(E.top, -16);
  const plazaV = inset(Vy.top, -14);
  paint(under, flat(plazaE), { color: PAINT.paving, layers: 10, alpha: 0.07, spread: 0.08, edge: 0.3 });
  paint(under, flat(plazaV), { color: PAINT.paving, layers: 10, alpha: 0.07, spread: 0.08, edge: 0.3 });
  outline(plazaE, 0, { width: 0.5, tone: 0.3 });

  // The path cut diagonally across the lawn, from the junction to Endeavor's door.
  const door = lerp2(plazaE[1], plazaE[2], 0.6);
  const junction: Pt = [70, -280];
  paint(under, flat(band(junction, door, 6)), { color: PAINT.paving, layers: 10, alpha: 0.09, spread: 0.06, edge: 0.3 });
  const [p0, p1, p2, p3] = band(junction, door, 6);
  lineOn(p0, p1, 0, { width: 0.6, tone: 0.45 }, 0);
  lineOn(p3, p2, 0, { width: 0.6, tone: 0.45 }, 0);
  // A second path, from the corner along the lawn toward Voyager.
  const path2: [Pt, Pt] = [[expressWest(-200) - 14, -200], cpt(0.2, 1.3)];
  paint(under, flat(band(path2[0], path2[1], 5)), { color: PAINT.paving, layers: 8, alpha: 0.08, spread: 0.06, edge: 0.3 });
  // The walk from Endeavor's back corner to the trellis.
  const walkA = lerp2(plazaE[3], plazaE[4], 0.2);
  const walkB = cpt(-0.3, 1.2);
  paint(under, flat(band(walkA, walkB, 7)), { color: PAINT.paving, layers: 8, alpha: 0.08, spread: 0.06, edge: 0.3 });
  stage(4);

  /* ---------------- roads ---------------- */

  const exPoly: Pt[] = [[expressWest(-700), -700], [expressWest(1400), 1400], [expressWest(1400) + EXPRESS_W, 1400], [expressWest(-700) + EXPRESS_W, -700]];
  paint(under, flat(exPoly), { color: PAINT.road, layers: 12, alpha: 0.08, spread: 0.06, edge: 0.4 });
  for (const off of [0, EXPRESS_W]) line3([expressWest(-700) + off, -700, 0], [expressWest(1400) + off, 1400, 0], { width: 0.8, tone: 0.55 }, 0.2);
  // The median, and the lane lines either side of it.
  line3([expressWest(-700) + EXPRESS_W / 2, -700, 0], [expressWest(1400) + EXPRESS_W / 2, 1400, 0], { width: 0.9, tone: 0.6 }, 0);
  for (const off of [7, 14, 32, 39]) {
    for (let y = -600; y < 1300; y += 22) line3([expressWest(y) + off, y, 0], [expressWest(y + 9) + off, y + 9, 0], { width: 0.4, tone: 0.3, overshoot: 0 }, 0);
  }
  paint(under, flat(band(ROAD_A, ROAD_B, ROAD_W)), { color: PAINT.road, layers: 12, alpha: 0.08, spread: 0.06, edge: 0.4 });
  {
    const [q0, q1, q2, q3] = band(ROAD_A, ROAD_B, ROAD_W);
    lineOn(q0, q1, 0, { width: 0.8, tone: 0.55 }, 0.2);
    lineOn(q3, q2, 0, { width: 0.8, tone: 0.55 }, 0.2);
    for (let t = 0; t < 1; t += 0.025) lineOn(lerp2(ROAD_A, ROAD_B, t), lerp2(ROAD_A, ROAD_B, t + 0.01), 0, { width: 0.5, tone: 0.45, overshoot: 0 }, 0);
  }
  // The junction in the foreground, where the roads meet.
  paint(under, flat([[-20, -360], [expressWest(-360) + EXPRESS_W + 20, -360], [expressWest(-280) + EXPRESS_W, -280], [60, -280]]), { color: PAINT.road, layers: 10, alpha: 0.08, spread: 0.08, edge: 0.4 });

  // The covered footbridge over the expressway, from Voyager's side.
  const brA: Pt = [expressWest(330) - 50, 330];
  const brB: Pt = [expressWest(290) + EXPRESS_W + 40, 290];
  const bridge = band(brA, brB, 5);
  paint(under, flat(bridge.map(([x, y]) => [x + 3, y - 5] as Pt)), { color: '#6f6f78', layers: 6, alpha: 0.08, spread: 0.06 });
  paint(build, flat(bridge, 8), { color: '#e9e7e1', layers: 8, alpha: 0.18, spread: 0.04, edge: 0.4 });
  outline(bridge, 8, { width: 0.8, tone: 0.75 });
  for (const t of [0.2, 0.5, 0.8]) {
    const [x, y] = lerp2(brA, brB, t);
    post(x, y, 0, 8, { width: 0.7, tone: 0.55 });
  }

  // Street lamps.
  const lampAt: Pt[] = [
    ...Array.from({ length: 18 }, (_, k) => [expressWest(-260 + k * 60) - 3, -260 + k * 60] as Pt),
    ...Array.from({ length: 13 }, (_, k) => lerp2(ROAD_A, ROAD_B, 0.06 + k * 0.07)).map(([x, y]) => [x + 10, y + 12] as Pt),
  ];
  for (const [lx, ly] of lampAt) {
    post(lx, ly, 0, 9, { width: 0.55, tone: 0.5 });
    lamps.push(P(lx, ly, 9));
    lampFeet.push(P(lx, ly, 0));
  }
  stage(5);

  // Parking across the expressway, rows of cars.
  const lotX = expressWest(0) + EXPRESS_W + 18;
  const lot: Pt[] = [[lotX, -160], [lotX + 150, -160], [lotX + 190, 260], [lotX + 90, 260]];
  paint(under, flat(lot), { color: '#a9a9ad', layers: 10, alpha: 0.07, spread: 0.08, edge: 0.4 });
  const parked = ['#e9e4d8', '#3a3d46', '#8fa9bd', '#c8423a', '#f2efe8', '#6b6f78', '#2b3f9e'];
  for (let row = 0; row < 12; row++) {
    const y = -150 + row * 34;
    const x0 = lotX + 8 + (row / 12) * 60;
    for (let x = x0; x < x0 + 110; x += 4.2) {
      if (r() < 0.35) continue;
      for (const dy of [0, 7.5]) under.push(new Wash(flat([[x + 0.6, y + dy], [x + 3.2, y + dy], [x + 3.2, y + dy + 4.6], [x + 0.6, y + dy + 4.6]], 0.8), { color: pick(r, parked), layers: 2, alpha: 0.5, spread: 0.02, edge: 0, grain: 40 }, r));
    }
  }

  // Santa Clara beyond and to the sides: low buildings with white flat roofs.
  const clear = (x: number, y: number, w: number, d: number) =>
    [[x, y], [x + w, y], [x + w, y + d], [x, y + d]].every(([px, py]) => !inside(campus, px, py) && !inside(lot, px, py) && Math.abs(px - (expressWest(py) + EXPRESS_W / 2)) > 40);
  for (let k = 0; k < 110; k++) {
    const y = between(r, -150, 1500);
    const x = between(r, -1100, 1200);
    const w = between(r, 40, 120);
    const d = between(r, 25, 70);
    if (!clear(x, y, w, d)) continue;
    const h = between(r, 6, 16);
    const fade = Math.max(0.15, 1 - Math.max(0, y - 300) / 1300);
    const box: Pt[] = [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
    paint(build, [P(x, y, 0), P(x + w, y, 0), P(x + w, y, h), P(x, y, h)], { color: PAINT.townWall, layers: 5, alpha: 0.08 * fade, spread: 0.06, edge: 0.3 });
    paint(build, flat(box, h), { color: PAINT.townRoof, layers: 4, alpha: 0.1 * fade, spread: 0.05 });
    if (fade > 0.35) outline(box, h, { width: 0.45, tone: 0.3 * fade });
    if (fade > 0.35) lineOn([x, y], [x + w, y], 0, { width: 0.45, tone: 0.3 * fade }, 0);
  }
  stage(6);

  // The hills far off, above the town.
  const hy = P(0, 2300, 0)[1];
  const ridge: Pt[] = [[20, hy + 20], [160, hy - 6], [300, hy - 18], [430, hy - 8], [560, hy - 30], [700, hy - 16], [840, hy - 36], [980, hy - 22], [1120, hy - 32], [1260, hy - 10], [1400, hy - 20], [1580, hy + 16]];
  ink.push(pencil(curve(ridge, 5), r, { width: 0.8, tone: 0.3 }));
  paint(build, [...ridge, [1500, hy + 34], [1200, hy + 44], [900, hy + 30], [600, hy + 46], [300, hy + 30], [60, hy + 40]], { color: PAINT.hills, layers: 12, alpha: 0.05, spread: 0.3, edge: 0.3, grain: 26 });
  everySeason((s, into) => {
    if (s === 'winter') paint(into, [ridge[4], ridge[5], ridge[6], ridge[7], ridge[8], [1120, hy - 18], [840, hy - 22], [560, hy - 16]], { color: '#f6f8fb', layers: 8, alpha: 0.28, spread: 0.2 });
  });
  stage(7);

  /* ---------------- trees ---------------- */

  const occluders = [hull([...flat(E.top, 14), ...flat(E.foot, 0)]), hull([...flat(Vy.top, 21), ...flat(Vy.foot, 0)])];
  // A tree standing behind a building (its foot inside the silhouette) is
  // hidden; so is one whose crown would poke through the canopy or bridge.
  const overhead = [flat(canopy, CZ), flat(bridge, 8)];
  const tree = (x: number, y: number, kind: Tree['kind'], size = 1) => {
    const h = (kind === 'palm' ? 16 : 10) * size;
    const [tx, ty] = P(x, y, h * 0.75);
    const foot = P(x, y, 0);
    if (hidden(occluders, foot[0], foot[1]) || overhead.some((o) => inside(o, tx, ty + 4))) return;
    if (inside(inset(E.top, -4), x, y) || inside(inset(Vy.top, -4), x, y)) return;
    const s = scaleAt(y);
    const [bx, by] = P(x, y, 0);
    const rad = (kind === 'palm' ? 3.5 : 5.5) * size * s;
    trees.push({ cx: tx, cy: ty, r: rad, base: by, kind });
    paint(under, blob(bx + rad * 0.6, by - rad * 0.1, rad * 0.9, rad * 0.35, r, 7), { color: '#6b6a70', layers: 4, alpha: 0.07, spread: 0.2, edge: 0 });
    ink.push(pencil([[bx, by], [tx, ty + rad * 0.3]], r, { width: 0.6, tone: 0.55, overshoot: 0 }));
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + (k - 1) * 0.7;
      ink.push(pencil([[tx, ty + rad * 0.3], [tx + Math.cos(a) * rad * 0.7, ty + rad * 0.3 + Math.sin(a) * rad * 0.7]], r, { width: 0.45, tone: 0.4, overshoot: 0 }));
    }
    everySeason((season, into) => {
      if (kind === 'palm') {
        paint(into, blob(tx, ty + rad * 0.2, rad * 1.3, rad * 0.65, r, 9), { color: pick(r, EVERGREEN[season]), layers: 8, alpha: 0.1, spread: 0.4, edge: 0.5 });
        return;
      }
      const cols = kind === 'blossom' && season === 'spring' ? BLOSSOM : CROWN[season];
      if (!cols.length) {
        paint(into, blob(tx, ty, rad * 0.5, rad * 0.2, r, 7), { color: '#f3f5f9', layers: 4, alpha: 0.28, spread: 0.3 });
        return;
      }
      for (let k = 0; k < 3; k++) {
        const col = k === 2 ? cols[Math.min(cols.length - 1, 1)] : pick(r, cols);
        paint(into, blob(tx + between(r, -0.35, 0.35) * rad, ty + between(r, -0.3, 0.3) * rad, rad * between(r, 0.6, 0.85), rad * between(r, 0.5, 0.7), r), { color: col, layers: 9, alpha: 0.085, spread: 0.3, edge: 0.55 });
      }
    });
  };

  // Along the expressway's western side, a continuous row.
  for (let y = -260; y < 760; y += 24) tree(expressWest(y) - 12 + between(r, -3, 3), y, r() < 0.15 ? 'palm' : 'shade', between(r, 0.85, 1.15));
  // Along the left road.
  for (let t = 0.05; t < 0.95; t += 0.035) {
    const [x, y] = lerp2(ROAD_A, ROAD_B, t);
    tree(x + 16, y + 20, 'street', 0.85);
    tree(x - 16, y - 20, 'street', 0.85);
  }
  // Scattered across the lawn wedge, a few big ones.
  for (let k = 0; k < 16; k++) {
    const x = between(r, -460, 150);
    const y = between(r, -260, 100);
    if (inside(wedge, x, y)) tree(x, y, r() < 0.3 ? 'blossom' : 'shade', between(r, 1, 1.5));
  }
  // Round the plazas.
  for (const ring of [inset(E.top, -26), inset(Vy.top, -24)]) {
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k];
      const b = ring[(k + 1) % ring.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = 0.1; t < 0.95; t += 24 / len) {
        const p = lerp2(a, b, t);
        if (Math.hypot(p[0] - hub[0], p[1] - hub[1]) > 60) tree(p[0], p[1], r() < 0.2 ? 'blossom' : 'shade', 0.9);
      }
    }
  }
  // Between the buildings, and beyond them.
  for (let k = 0; k < 30; k++) tree(between(r, -600, 330), between(r, 140, 700), r() < 0.2 ? 'blossom' : 'shade', between(r, 0.8, 1.3));
  // The town has its own trees.
  for (let k = 0; k < 60; k++) {
    const x = between(r, -1000, 1100);
    const y = between(r, -100, 1100);
    if (!inside(campus, x, y)) tree(x, y, 'street', between(r, 0.7, 1));
  }
  stage(9);

  const drawn = ink.map((s, i) => [s, stageOf[i] ?? 9, i] as const).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(([s]) => s);
  const ringE = inset(E.top, -10);
  const exLane = (off: number, dir: 1 | -1): Lane => {
    const pts: Pt[] = [];
    for (let y = -700; y <= 1400; y += 100) pts.push([expressWest(y) + off, y]);
    return { path: dir === 1 ? pts : pts.reverse() };
  };
  const roadLane = (off: number, dir: 1 | -1): Lane => {
    const l = Math.hypot(ROAD_B[0] - ROAD_A[0], ROAD_B[1] - ROAD_A[1]);
    const nx = (-(ROAD_B[1] - ROAD_A[1]) / l) * off;
    const ny = ((ROAD_B[0] - ROAD_A[0]) / l) * off;
    const pts: Pt[] = [[ROAD_A[0] + nx, ROAD_A[1] + ny], [ROAD_B[0] + nx, ROAD_B[1] + ny]];
    return { path: dir === 1 ? pts : pts.reverse() };
  };

  return {
    ink: drawn,
    build: [...under, ...build],
    seasons,
    ground,
    windows,
    fascia,
    skylights,
    lamps,
    lampFeet,
    trees,
    walks: [
      { path: [junction, door], spread: 2, weight: 3 },
      { path: [walkA, walkB], spread: 2.5, weight: 3 },
      { path: [...ringE.slice(1), ringE[0], ringE[1]], spread: 2, weight: 2 },
      { path: [path2[0], path2[1]], spread: 1.5, weight: 1.5 },
      { path: [lerp2(ROAD_A, ROAD_B, 0.05), lerp2(ROAD_A, ROAD_B, 0.8)].map(([x, y]) => [x + 12, y + 14] as Pt), spread: 1.2, weight: 1 },
      { path: [cpt(0, 1.3), cpt(0, -0.1)], spread: 12, weight: 1.5, door: true },
    ],
    terrace: [cpt(-0.5, 0.4), cpt(-0.3, 0.7), cpt(0.35, 0.5), cpt(0.55, 0.8), cpt(0.1, 0.3)],
    lanes: [exLane(9, 1), exLane(17, 1), exLane(29, -1), exLane(37, -1), roadLane(-6, 1), roadLane(6, -1)],
    wet: [
      { a: [expressWest(-300) + EXPRESS_W / 2, -300], b: [expressWest(700) + EXPRESS_W / 2, 700], width: EXPRESS_W },
      { a: ROAD_A, b: ROAD_B, width: ROAD_W },
      { a: junction, b: door, width: 6 },
    ],
    occluders,
  };
}
