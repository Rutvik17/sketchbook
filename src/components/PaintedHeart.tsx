'use client';

/**
 * A small heart, painted beside the painting's title once the painting is
 * done: in Nvidia's green, laid a glaze at a time by the same brush as
 * everything else (`lib/film/wash.ts`), so it arrives the way the painting
 * did — pale first, then building to its colour, with a darker drying edge.
 *
 * Reduced motion: painted whole, at once.
 */

import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '@/lib/gsap';
import { Wash, type Pt } from '@/lib/film/wash';
import { rng } from '@/lib/film/random';

/** Nvidia's green. */
const GREEN = '#76b900';
/** Glazes, and how long they take to go down after the title has been written. */
const GLAZES = 16;
const DELAY_MS = 700;
const PAINT_MS = 900;

/** The heart curve, in a 100-unit box with room round it for the paint to spread. */
function heart(): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < 28; i++) {
    const t = (i / 28) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    out.push([50 + x * 2.2, 46 - y * 2.2]);
  }
  return out;
}

export function PaintedHeart({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const k = canvas.width / 100;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const wash = new Wash(heart(), { color: GREEN, layers: GLAZES, alpha: 0.075, spread: 0.14, edge: 1, grain: 6 }, rng(7));

    if (prefersReducedMotion()) {
      wash.paint(ctx);
      return;
    }
    let laid = 0;
    let raf = 0;
    const start = performance.now() + DELAY_MS;
    const frame = (now: number) => {
      const due = Math.min(GLAZES, Math.floor(((now - start) / PAINT_MS) * GLAZES));
      while (laid < due) wash.pass(ctx, laid++);
      if (laid < GLAZES) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
