/**
 * Seeded randomness for the film.
 *
 * Every drawing is generated, and generated the same way on every visit: the
 * campus is one painting, not a new one each reload. So nothing in the film
 * calls `Math.random` — it asks a generator made from a fixed seed.
 */

export type Rng = () => number;

/** Mulberry32: small, fast, and good enough to paint with. */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A normally distributed value, mean 0 and standard deviation 1. */
export function gauss(r: Rng): number {
  const u = Math.max(1e-9, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

export const between = (r: Rng, a: number, b: number) => a + (b - a) * r();
export const pick = <T>(r: Rng, list: readonly T[]): T => list[Math.floor(r() * list.length)];

export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 below `a`, 1 above `b`, an S-curve between. */
export function smooth(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** '#rrggbb' → [r, g, b]. */
export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

