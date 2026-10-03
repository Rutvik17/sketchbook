'use client';

/**
 * The sketchbook's cursor is a brush.
 *
 * The sketchbook is watercolour, so the pointer is the thing that paints it: the
 * films' own brush (`lib/film/tools.ts`, the one seen laying their washes), its
 * tip exactly on the pointer. It leans the way it is being moved, as a brush
 * dragged across paper trails its handle, and stands back up when the hand
 * stops.
 *
 * Over anything that does something, it does what a brush does: it lays a
 * little wash under it (`lib/film/wash.ts`, a glaze at a time), blended into
 * the paper so the words read through it, and lifted off again when the
 * pointer leaves. A handwritten label appears beside the tip — the thing's
 * `data-cursor`, or for a button that is only an icon, its `aria-label`.
 * Pressing presses the brush down.
 *
 * - The wash is crimson only under the one thing to do next
 *   (`data-cursor-accent`: writing to Rutvik) — the palette's rule for
 *   crimson — and cadmium yellow, thinly, under everything else.
 * - Anything long or large — a row of a list (`data-row`), a card, a
 *   drawing — gets no wash from here: rows wash themselves in with their
 *   own CSS, and a wash the size of a card would drown it.
 * - Over text — a field to type in, code to select — the brush steps aside
 *   for the text caret.
 * - Something disabled gets no wash: there is nothing to do there.
 *
 * (It was a pencil, and before that a blue dot in a lagging ring. A pencil
 * circling links in graphite belonged to a sketchbook; this is a painting.)
 *
 * Only mounts on fine-pointer devices with motion enabled; everything falls
 * back to the native cursor otherwise (and `cursor: none` is applied by the
 * same class, so touch users never lose their pointer).
 */

import { useEffect, useRef, useState } from 'react';
import { gsap, prefersReducedMotion } from '@/lib/gsap';
import { drawBrush } from '@/lib/film/tools';
import { blob, Wash } from '@/lib/film/wash';
import { rng } from '@/lib/film/random';

const HOVER_SELECTOR = 'a, button:not(:disabled), [data-cursor], input:not(:disabled), select';
/** Where the brush steps aside for the text caret. */
const TEXT_SELECTOR = 'input[type="search"], input[type="text"], textarea, pre';

/** How far the brush leans at most, degrees, and how quickly it rights itself. */
const MAX_LEAN = 24;
const SETTLE_MS = 90;
/** The brush's size against the films' (it is drawn 110 units long there). */
const BRUSH_SCALE = 0.62;
/** The brush's own little canvas, CSS px, and where its tip sits in it. */
const BRUSH_BOX = { w: 76, h: 50, tipX: 4, tipY: 46 };
/** How long a wash takes to go down, and how many glazes it is laid in. */
const WASH_MS = 420;
const GLAZES = 12;
/** Frames it takes to lift a wash off again. */
const LIFT_FRAMES = 14;
/** Cadmium yellow, and crimson for the one thing to do next. */
const YELLOW = '#eba42c';
const CRIMSON = '#c8233f';

/** A stable number from an element's size, so each thing is washed the same way every time. */
function seedOf(r: DOMRect): number {
  return ((Math.round(r.width) * 73856093) ^ (Math.round(r.height) * 19349663)) >>> 0;
}

export function Cursor() {
  const [enabled, setEnabled] = useState(false);
  const brushRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const leanRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLCanvasElement>(null);
  const washRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    setEnabled(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const brush = brushRef.current;
    const label = labelRef.current;
    const lean = leanRef.current;
    const tip = tipRef.current;
    const sheet = washRef.current;
    if (!brush || !label || !lean || !tip || !sheet) return;
    const ctx = sheet.getContext('2d');
    const tctx = tip.getContext('2d');
    if (!ctx || !tctx) return;

    document.documentElement.classList.add('has-custom-cursor');

    let dpr = 1;
    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      sheet.width = Math.round(window.innerWidth * dpr);
      sheet.height = Math.round(window.innerHeight * dpr);
      // The brush itself, drawn once by the films' own hand, its tip at the box's corner.
      tip.width = Math.round(BRUSH_BOX.w * dpr);
      tip.height = Math.round(BRUSH_BOX.h * dpr);
      tctx.setTransform(dpr * BRUSH_SCALE, 0, 0, dpr * BRUSH_SCALE, BRUSH_BOX.tipX * dpr, BRUSH_BOX.tipY * dpr);
      // drawBrush dabs about its point with time; at t = 0 it sits 2 units low, so it is drawn 2 high.
      drawBrush(tctx, 0, -2, 0);
    };
    size();

    const setX = gsap.quickSetter(brush, 'x', 'px');
    const setY = gsap.quickSetter(brush, 'y', 'px');
    const tilt = gsap.quickTo(lean, 'rotation', { duration: 0.5, ease: 'power3.out' });
    let lastX = 0;
    let lastT = 0;
    let settle = 0;
    let visible = false;

    let hovered: Element | null = null;
    /** The wash going down under what is hovered, and how many of its glazes are laid. */
    let wash: Wash | null = null;
    let laid = 0;
    let washedAt = 0;
    /** Frames left in lifting the last wash off. */
    let lifting = 0;
    let raf = 0;

    /** Start a wash under `el`, if it is something small enough to wash. */
    const begin = (el: Element) => {
      wash = null;
      laid = 0;
      if (el.closest('[data-row], input[type="range"]')) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.width > 420 || r.height > 130) return;
      const R = rng(seedOf(r));
      const shape = blob(r.left + r.width / 2, r.top + r.height / 2, r.width / 2 + 10, r.height / 2 + 7, R, 12);
      const accent = !!el.closest('[data-cursor-accent]');
      wash = new Wash(shape, { color: accent ? CRIMSON : YELLOW, layers: GLAZES, alpha: accent ? 0.028 : 0.034, spread: 0.24, edge: 1, grain: 10 }, R);
      washedAt = performance.now();
    };

    /* One frame: lift the old wash a little, lay the glazes of the new one that are due; stop when there is nothing to do. */
    const paint = () => {
      raf = 0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (lifting > 0) {
        // Blotted: a little of the paint comes away each frame.
        lifting -= 1;
        if (lifting === 0) ctx.clearRect(0, 0, sheet.width, sheet.height);
        else {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.fillRect(0, 0, sheet.width, sheet.height);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      if (wash) {
        const due = Math.min(GLAZES, Math.ceil(((performance.now() - washedAt) / WASH_MS) * GLAZES));
        while (laid < due) wash.pass(ctx, laid++);
      }
      if (lifting > 0 || (wash && laid < GLAZES)) raf = requestAnimationFrame(paint);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };

    /** Lift whatever wash is down. */
    const lift = () => {
      if (wash || laid) lifting = LIFT_FRAMES;
      wash = null;
      laid = 0;
      schedule();
    };

    const clear = () => {
      hovered = null;
      brush.classList.remove('is-active', 'is-labelled', 'is-pressed');
      label.textContent = '';
      lift();
    };

    /**
     * The hover state is derived from whatever is under the pointer, not
     * accumulated from over/out pairs. `pointerout` does not fire when the
     * hovered element is removed from the document, so a dialog closed from its
     * own close button used to leave the cursor stuck on that button's label —
     * deriving instead means the next pointer event always corrects it.
     */
    const applyHover = (target: Element | null) => {
      if (target === hovered) return;
      if (!target) {
        clear();
        return;
      }
      lift();
      hovered = target;
      begin(target);
      schedule();
      // A button that is only an icon (no letters on it) is named by its aria-label; one with words needs no label.
      const text = target.getAttribute('data-cursor') ?? (/\p{L}/u.test(target.textContent ?? '') ? null : target.getAttribute('aria-label'));
      brush.classList.add('is-active');
      brush.classList.toggle('is-labelled', !!text);
      label.textContent = text ?? '';
    };

    const hoverTargetOf = (event: PointerEvent) => {
      const el = event.target as Element | null;
      if (!el?.closest || el.closest(TEXT_SELECTOR)) return null;
      return el.closest(HOVER_SELECTOR);
    };

    const onMove = (event: PointerEvent) => {
      if (!visible) {
        visible = true;
        gsap.to(brush, { opacity: 1, duration: 0.3 });
      }
      setX(event.clientX);
      setY(event.clientY);

      // Lean against the direction of travel, in proportion to the speed.
      const now = performance.now();
      const dt = Math.max(8, now - lastT);
      const vx = ((event.clientX - lastX) / dt) * 16;
      lastX = event.clientX;
      lastT = now;
      tilt(Math.max(-MAX_LEAN, Math.min(MAX_LEAN, -vx * 1.6)));
      window.clearTimeout(settle);
      settle = window.setTimeout(() => tilt(0), SETTLE_MS);

      brush.classList.toggle('is-away', !!(event.target as Element | null)?.closest?.(TEXT_SELECTOR));
      applyHover(hoverTargetOf(event));
    };

    const onOver = (event: PointerEvent) => applyHover(hoverTargetOf(event));

    const onOut = (event: PointerEvent) => {
      // Only clear when leaving the element actually being tracked; moving
      // between children of one link should not flicker the label.
      if (hoverTargetOf(event) === hovered) clear();
    };

    const onDown = () => brush.classList.add('is-pressed');
    const onUp = () => brush.classList.remove('is-pressed');

    // A wash is laid where the thing was; once the page moves under it, lift it and let the next move lay a new one.
    const onScroll = () => {
      if (hovered) clear();
    };

    const onLeaveWindow = () => {
      visible = false;
      tilt(0);
      gsap.to(brush, { opacity: 0, duration: 0.2 });
      clear();
    };

    const onResize = () => {
      size();
      clear();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerover', onOver);
    window.addEventListener('pointerout', onOut);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    document.addEventListener('pointerleave', onLeaveWindow);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerout', onOut);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, { capture: true });
      document.removeEventListener('pointerleave', onLeaveWindow);
      document.documentElement.classList.remove('has-custom-cursor');
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div aria-hidden="true">
      <canvas className="cursor-wash" ref={washRef} />
      <div className="cursor-brush" ref={brushRef}>
        {/* Leans about the tip: the wrapper's origin is the pointer. */}
        <span className="cursor-brush__lean" ref={leanRef}>
          <canvas className="cursor-brush__body" ref={tipRef} />
        </span>
        <span className="cursor-brush__label" ref={labelRef} />
      </div>
    </div>
  );
}
