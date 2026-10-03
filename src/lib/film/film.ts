/**
 * THE FILM — the director, the camera, and the page it is painted on.
 *
 * The landing opens on a blank sheet. A pencil draws the campus; a brush
 * lays in the washes, one after another, while the first people are already
 * walking about in pencil; and then the year turns over the painting, shot
 * by shot, round and round — spring, summer, a thunderstorm, autumn, an
 * autumn evening, a winter night, a winter dawn — each one arriving the way
 * weather does, never cut to.
 *
 * ---
 *
 * HOW A FRAME IS MADE
 *
 * Painting watercolour is slow — hundreds of translucent glazes — so what
 * does not move is painted once, into layers the size of the painting, and
 * the frame is a stack of them:
 *
 *     sky → drifting clouds → the building washes → this season's trees and
 *     grass → the pencil → the people and the traffic → the glaze for the
 *     hour → the lights → the weather → the paper's tooth
 *
 * The glaze is one flat colour laid over everything in `multiply` — the way a
 * painter darkens a whole sheet for night — and the lights go on top of it in
 * `screen`, so a lit window is bright *because* the rest has been glazed
 * dark. The tooth is the last pass: a speckle that lifts paint out of the
 * pits of the paper, over everything, so the washes, the pencil and even the
 * night glaze all break up the same way on the same sheet.
 *
 * A change of season does not cross-fade. The new season's layer bleeds in
 * from a scatter of points, the way a wet wash spreads into a wet sheet,
 * while the old one is lifted out through the same mask.
 *
 * The canvas is transparent: where nothing is painted, the page's own ground
 * shows through, so the painting sits on the same sheet as the rest of the
 * site.
 *
 * ---
 *
 * WHAT IS BAKED WHEN
 *
 * The building washes and the spring layer are painted in front of the
 * reader during the second act — the painting act IS the bake. The other
 * three seasons, the skies and the night lights are painted out of sight,
 * a few milliseconds a frame, while the pencil and brush are busy; by the
 * time spring gives way to summer they are long finished.
 */

import { shots, type Shot, type SkyId } from '@/content/film';
import { buildCampus, PAINTED, SEASONS, type Season } from './campus';
import { Life } from './life';
import { Weather } from './weather';
import { makeClouds, paintSky, SKY_BOUNDS, type Cloud } from './sky';
import { drawStroke, pointAt } from './pencil';
import { between, clamp, easeInOut, lerp, rgb, rng, smooth } from './random';
import type { Wash } from './wash';
import { drawBrush, drawPencil } from './tools';

export interface FilmHooks {
  /** The caption changed: a shot's label, or an act's. `index` is -1 during the opening acts. */
  onCaption(text: string, index: number): void;
  /** The painting has gone dark (or light again): what is written over it should change colour. */
  onDark(dark: boolean): void;
  /** How far through the current shot, 0–1, every frame. */
  onProgress?(fraction: number): void;
}

export interface Film {
  /** Start the opening: the pencil. */
  begin(): void;
  /** Go to a shot. From the opening, the painting is finished at once. */
  goTo(index: number): void;
  setPlaying(playing: boolean): void;
  setVisible(visible: boolean): void;
  resize(): void;
  destroy(): void;
}

/** Seconds for the pencil, then for the brush. */
const SKETCH = 9;
const PAINT = 9;
/** Seconds for one shot to become the next. */
const CHANGE = 4.5;
/** Seconds a single wash takes to go down. */
const WASH_TIME = 0.9;

/** Each season has two layers: its ground (grass, under the buildings) and its top (trees and snow, over them). */
type Ground = `${Season}-ground`;
type LayerName = 'build' | 'ink' | 'lights' | Season | Ground;
const groundOf = (s: Season): Ground => `${s}-ground`;
const isSeason = (layer: LayerName, s: Season) => layer === s || layer === groundOf(s);

interface Layer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

interface Job {
  wash: Wash;
  layer: LayerName;
  done: number;
}

interface Params {
  skyA: SkyId;
  skyB: SkyId;
  skyT: number;
  skyAlpha: number;
  seasonA: Season;
  seasonB: Season;
  bleed: number;
  glaze: [number, number, number];
  glazeAlpha: number;
  night: number;
  bustle: number;
  rain: number;
  snow: number;
  leaves: number;
  petals: number;
  birds: number;
  lightning: number;
  clouds: number;
  cam: { x: number; y: number; zoom: number };
  /** How much colour the people and traffic carry: none while only the pencil has been there. */
  colour: number;
  /** How present they are at all. */
  life: number;
}

function blend(a: Shot, b: Shot, p: number): Params {
  const e = easeInOut(p);
  const ga = rgb(a.glaze[0]);
  const gb = rgb(b.glaze[0]);
  const w = (k: keyof Shot['weather']) => lerp(a.weather[k] ?? 0, b.weather[k] ?? 0, e);
  return {
    skyA: a.sky,
    skyB: b.sky,
    skyT: e,
    skyAlpha: 1,
    seasonA: a.season,
    seasonB: b.season,
    bleed: a.season === b.season ? 0 : p,
    glaze: [lerp(ga[0], gb[0], e), lerp(ga[1], gb[1], e), lerp(ga[2], gb[2], e)],
    glazeAlpha: lerp(a.glaze[1], b.glaze[1], e),
    night: lerp(a.night, b.night, e),
    bustle: lerp(a.bustle, b.bustle, e),
    rain: w('rain'),
    snow: w('snow'),
    leaves: w('leaves'),
    petals: w('petals'),
    birds: w('birds'),
    // Lightning only in the thick of the storm, never while it is clearing.
    lightning: Math.min(a.weather.lightning ?? 0, b.weather.lightning ?? 0) || (p < 0.3 ? a.weather.lightning ?? 0 : 0),
    clouds: w('clouds'),
    cam: b.camera,
    colour: 1,
    life: 1,
  };
}

/** The paper's tooth: sparse pits, as alpha, lifted out of everything painted. */
function makeTooth(): HTMLCanvasElement {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const r = rng(7);
  // Fine, sparse pits — the fibres of cold-pressed paper — clustered a little
  // by a slow wave so they do not read as a regular screen.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wave = 0.5 + 0.25 * Math.sin((x / size) * Math.PI * 6 + Math.sin((y / size) * Math.PI * 4) * 2) + 0.25 * Math.sin((y / size) * Math.PI * 8 + (x / size) * 3);
      const pit = r() < 0.07 * (0.4 + wave) ? r() * 0.5 : r() * 0.04;
      img.data[(y * size + x) * 4 + 3] = Math.min(255, pit * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function createFilm(canvas: HTMLCanvasElement, opts: { reduced: boolean; hooks: FilmHooks }): Film {
  const { reduced, hooks } = opts;
  const ctx = canvas.getContext('2d')!;
  const campus = buildCampus();
  const life = new Life(campus);
  const weather = new Weather(campus);
  const clouds: Cloud[] = makeClouds();
  const skies: Partial<Record<SkyId, HTMLCanvasElement>> = {};
  const tooth = makeTooth();
  const toothPattern = ctx.createPattern(tooth, 'repeat');
  const temp = document.createElement('canvas');
  const tctx = temp.getContext('2d')!;
  const mask = document.createElement('canvas');
  const mctx = mask.getContext('2d')!;

  let cw = 1;
  let ch = 1;
  let dpr = 1;
  let bake = 0;
  let layers: Record<LayerName, Layer> | null = null;
  let jobs: Job[] = [];
  let inkDrawn = 0;

  /* ---------------- clock and state ---------------- */

  type Act = 'blank' | 'sketch' | 'paint' | 'shots';
  let act: Act = 'blank';
  let actT = 0;
  let cur = 0;
  let next = 1;
  let shotT = 0;
  let filmT = 0;
  let playing = true;
  let visible = true;
  let raf = 0;
  let last = 0;
  let caption = '';
  let dark = false;
  let bleedSeeds: { x: number; y: number; delay: number; size: number }[] = [];
  const cam = { x: 780, y: 560, zoom: 2.3 };
  let brushAt: [number, number, string] | null = null;
  let pencilAt: [number, number] | null = null;

  // The pencil's time goes on strokes, not just on length: every stroke costs
  // the lift and placing of the hand as well as its line, so a field of short
  // hatching takes as long as it looks like it should.
  const LIFT = 26;
  const effort = campus.ink.map((s) => s.length + LIFT);
  const inkTotal = effort.reduce((a, e) => a + e, 0);
  const introJobs = () => jobs.filter((j) => j.layer === 'build' || isSeason(j.layer, 'spring'));

  /* ---------------- layers ---------------- */

  /** A layer the size of the painting. Washes are soft and are kept at two-thirds of the pencil's resolution. */
  function makeLayer(soft = false): Layer {
    const k = soft ? bake * 0.66 : bake;
    const c = document.createElement('canvas');
    c.width = Math.ceil(PAINTED.w * k);
    c.height = Math.ceil(PAINTED.h * k);
    const x = c.getContext('2d')!;
    x.setTransform(k, 0, 0, k, -PAINTED.x * k, -PAINTED.y * k);
    return { canvas: c, ctx: x };
  }

  function buildLayers() {
    layers = {
      build: makeLayer(true),
      ink: makeLayer(),
      lights: makeLayer(),
      spring: makeLayer(true),
      summer: makeLayer(true),
      autumn: makeLayer(true),
      winter: makeLayer(true),
      'spring-ground': makeLayer(true),
      'summer-ground': makeLayer(true),
      'autumn-ground': makeLayer(true),
      'winter-ground': makeLayer(true),
    };
    jobs = [];
    // In the order a painter works: the ground, then the buildings on it, then the trees.
    for (const s of SEASONS) for (const w of campus.ground[s]) jobs.push({ wash: w, layer: groundOf(s), done: 0 });
    for (const w of campus.build) jobs.push({ wash: w, layer: 'build', done: 0 });
    for (const s of SEASONS) for (const w of campus.seasons[s]) jobs.push({ wash: w, layer: s, done: 0 });
    const order = (j: Job) => (j.layer.endsWith('-ground') ? 0 : j.layer === 'build' ? 1 : 2);
    jobs.sort((a, b) => order(a) - order(b));
    inkDrawn = 0;
    paintLights(layers.lights.ctx);
  }

  function paintLights(l: CanvasRenderingContext2D) {
    l.save();
    l.shadowBlur = 6 * bake;
    for (const w of campus.windows) {
      const colour = w.warm ? 'rgba(255,200,115,0.62)' : 'rgba(205,228,255,0.45)';
      l.fillStyle = colour;
      l.shadowColor = colour;
      // Inset from the mullions, so the frame stays dark between lit panes.
      const cx = (w.quad[0][0] + w.quad[1][0] + w.quad[2][0] + w.quad[3][0]) / 4;
      const cy = (w.quad[0][1] + w.quad[1][1] + w.quad[2][1] + w.quad[3][1]) / 4;
      l.beginPath();
      w.quad.forEach(([x, y], i) => {
        const px = cx + (x - cx) * 0.8;
        const py = cy + (y - cy) * 0.8;
        if (i) l.lineTo(px, py);
        else l.moveTo(px, py);
      });
      l.closePath();
      l.fill();
    }
    l.restore();
    // A few of the roof's skylights glow from the floor beneath.
    const r = rng(33);
    for (const t of campus.skylights) {
      if (r() > 0.3) continue;
      l.fillStyle = `rgba(190,240,140,${between(r, 0.15, 0.35)})`;
      l.beginPath();
      t.forEach(([x, y], i) => (i ? l.lineTo(x, y) : l.moveTo(x, y)));
      l.fill();
    }
    campus.lamps.forEach(([x, y], i) => {
      const g = l.createRadialGradient(x, y, 0, x, y, 26);
      g.addColorStop(0, 'rgba(255,226,160,0.9)');
      g.addColorStop(0.25, 'rgba(255,210,140,0.35)');
      g.addColorStop(1, 'rgba(255,210,140,0)');
      l.fillStyle = g;
      l.fillRect(x - 26, y - 26, 52, 52);
      // The pool it throws on the ground at its foot.
      const [fx, fy] = campus.lampFeet[i];
      const p = l.createRadialGradient(fx, fy, 0, fx, fy, 22);
      p.addColorStop(0, 'rgba(255,214,150,0.4)');
      p.addColorStop(1, 'rgba(255,214,150,0)');
      l.fillStyle = p;
      l.beginPath();
      l.ellipse(fx, fy, 22, 9, 0, 0, Math.PI * 2);
      l.fill();
    });
  }

  function sky(id: SkyId) {
    return (skies[id] ??= paintSky(id));
  }

  /** Paint a job's glazes up to `upto`. */
  function work(j: Job, upto: number) {
    const l = layers![j.layer].ctx;
    while (j.done < upto) j.wash.pass(l, j.done++);
  }

  function finish(filter: (j: Job) => boolean) {
    for (const j of jobs) if (filter(j)) work(j, j.wash.layers);
  }

  /** Draw the pencil on to `target`, measured in effort. */
  function inkTo(target: number) {
    const l = layers!.ink.ctx;
    let acc = 0;
    for (let i = 0; i < campus.ink.length; i++) {
      const s = campus.ink[i];
      const a = acc;
      const b = acc + effort[i];
      acc = b;
      if (b <= inkDrawn) continue;
      if (a >= target) break;
      // The lift comes first: the hand moves to the stroke, then draws it.
      const from = Math.max(0, inkDrawn - a - LIFT);
      const to = Math.min(s.length, target - a - LIFT);
      if (to > from) drawStroke(l, s, from, to);
      if (target < b) pencilAt = pointAt(s, Math.max(0, to)) as [number, number];
    }
    inkDrawn = Math.max(inkDrawn, target);
  }

  /** Out of sight, a few milliseconds a frame: the seasons still to come, and the skies. */
  function pump(budget: number) {
    const end = performance.now() + budget;
    for (const j of jobs) {
      if (j.done >= j.wash.layers) continue;
      if (j.layer === 'build' || isSeason(j.layer, 'spring')) continue;
      while (j.done < j.wash.layers) {
        j.wash.pass(layers![j.layer].ctx, j.done++);
        if (performance.now() > end) return;
      }
    }
    for (const s of ['clear', 'storm', 'dusk', 'night', 'dawn'] as SkyId[]) {
      if (!skies[s]) {
        sky(s);
        return;
      }
    }
  }

  function ensureSeason(s: Season) {
    finish((j) => isSeason(j.layer, s));
  }

  function endIntro() {
    if (act === 'shots') return;
    finish((j) => j.layer === 'build' || isSeason(j.layer, 'spring'));
    inkTo(inkTotal);
    pencilAt = null;
    brushAt = null;
    act = 'shots';
    cur = 0;
    next = 1;
    shotT = 0;
  }

  /* ---------------- size ---------------- */

  function measure() {
    const rect = canvas.getBoundingClientRect();
    const d = Math.min(2, window.devicePixelRatio || 1);
    // Never more than about four million pixels a frame, however large the screen.
    const cap = Math.min(1, Math.sqrt(4.2e6 / Math.max(1, rect.width * rect.height * d * d)));
    dpr = d * cap;
    cw = Math.max(1, Math.round(rect.width * dpr));
    ch = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = cw;
    canvas.height = ch;
    temp.width = cw;
    temp.height = ch;
    mask.width = Math.ceil(cw / 8);
    mask.height = Math.ceil(ch / 8);

    const want = Math.min(fit() * 2, 3200 / PAINTED.w);
    if (!layers || want > bake * 1.3 || want < bake * 0.55) {
      const was = layers;
      bake = want;
      buildLayers();
      if (was || act === 'shots') {
        // A new size mid-film: the painting is repainted, whole, at once.
        endIntro();
        finish((j) => j.layer === 'build' || isSeason(j.layer, shots[cur].season) || isSeason(j.layer, shots[next].season));
        inkDrawn = 0;
        inkTo(inkTotal);
      }
    }
  }

  const portrait = () => cw / ch < 0.95;
  /** Backing pixels per world unit at zoom 1. */
  function fit() {
    return portrait() ? Math.min(cw / 760, ch / 1100) : Math.min(cw / 1800, ch / 940);
  }

  /* ---------------- the frame ---------------- */

  function params(): Params {
    if (act === 'shots') {
      const a = shots[cur];
      const p = shotT > a.hold ? clamp((shotT - a.hold) / CHANGE) : 0;
      return blend(a, shots[next], p);
    }
    const first = blend(shots[0], shots[0], 0);
    const sketchP = act === 'sketch' ? actT / SKETCH : 1;
    const paintP = act === 'paint' ? actT / PAINT : act === 'sketch' ? 0 : 1;
    return {
      ...first,
      skyAlpha: smooth(0.1, 0.8, paintP),
      clouds: (first.clouds ?? 0) * smooth(0.5, 1, paintP),
      petals: first.petals * smooth(0.7, 1, paintP),
      // During the sketch the camera follows the pencil, close in, and draws
      // back as the drawing fills the page.
      cam:
        act === 'sketch' && pencilAt
          ? { x: lerp(clamp(pencilAt[0], 560, 1150), 820, sketchP * sketchP), y: lerp(clamp(pencilAt[1], 400, 800), 545, sketchP * sketchP), zoom: 2.3 - sketchP * 0.7 }
          : act === 'sketch'
            ? { x: 780, y: 560, zoom: 2.3 }
            : shots[0].camera,
      colour: smooth(0.1, 0.9, paintP),
      life: smooth(0.45, 0.85, sketchP),
    };
  }

  function advance(dt: number) {
    filmT += dt;
    if (act === 'sketch') {
      actT += dt;
      const p = clamp(actT / SKETCH);
      // The hand starts carefully and gathers speed.
      inkTo(inkTotal * (0.35 * p * p + 0.65 * p));
      if (actT >= SKETCH) {
        inkTo(inkTotal);
        pencilAt = null;
        act = 'paint';
        actT = 0;
      }
    } else if (act === 'paint') {
      actT += dt;
      const list = introJobs();
      const stagger = (PAINT - WASH_TIME - 0.5) / list.length;
      brushAt = null;
      list.forEach((j, k) => {
        const start = k * stagger;
        const p = clamp((actT - start) / WASH_TIME);
        if (p > 0) {
          work(j, Math.floor(p * j.wash.layers));
          if (p < 1) brushAt = [j.wash.cx, j.wash.cy, ''];
        }
      });
      if (actT >= PAINT) endIntro();
    } else if (act === 'shots') {
      shotT += dt;
      const a = shots[cur];
      if (shotT >= a.hold + CHANGE) {
        cur = next;
        next = (cur + 1) % shots.length;
        shotT = 0;
      }
      if (shotT > a.hold && bleedSeeds.length === 0) seedBleed();
      if (shotT <= a.hold) bleedSeeds = [];
    }
    if (act !== 'blank') pump(reduced ? 1e9 : 5);
  }

  function seedBleed() {
    const r = rng(Math.floor(filmT * 1000));
    bleedSeeds = Array.from({ length: 16 }, () => ({ x: r(), y: between(r, 0.2, 0.95), delay: r() * 0.45, size: between(r, 0.7, 1.3) }));
  }

  function drawMask(p: number) {
    const w = mask.width;
    const h = mask.height;
    mctx.clearRect(0, 0, w, h);
    const R = Math.hypot(w, h) * 0.5;
    for (const s of bleedSeeds) {
      const q = clamp((p - s.delay) / (1 - s.delay));
      if (q <= 0) continue;
      const rr = R * s.size * q * 1.2;
      const g = mctx.createRadialGradient(s.x * w, s.y * h, rr * 0.55, s.x * w, s.y * h, rr);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      mctx.fillStyle = g;
      mctx.fillRect(0, 0, w, h);
    }
    if (p >= 1) {
      mctx.fillStyle = '#000';
      mctx.fillRect(0, 0, w, h);
    }
  }

  function render(dt: number) {
    const P = params();
    life.update(reduced ? 0 : dt, P.bustle);
    weather.update(reduced ? 0 : dt, P);
    for (const c of clouds) {
      c.x += c.speed * dt;
      if (c.x > 1900) c.x = -700;
    }

    // Camera: eases toward the shot's framing, and never quite stops breathing.
    const k = reduced ? 1 : 1 - Math.exp(-dt * (act === 'sketch' ? 0.9 : 0.5));
    const pan = portrait() && act === 'shots' ? Math.sin(filmT * 0.045) * 300 : 0;
    cam.x += (P.cam.x + pan - cam.x) * k;
    cam.y += (P.cam.y - cam.y) * k;
    cam.zoom += (P.cam.zoom - cam.zoom) * k;
    const drift = reduced ? 0 : 1;
    const S = fit() * cam.zoom * (1 + Math.sin(filmT * 0.04) * 0.01 * drift);
    const OX = cw * 0.5 - (cam.x + Math.sin(filmT * 0.07) * 12 * drift) * S;
    const OY = ch * (portrait() ? 0.56 : 0.5) - (cam.y + Math.sin(filmT * 0.05) * 5 * drift) * S;
    const world = () => ctx.setTransform(S, 0, 0, S, OX, OY);
    const screen = () => ctx.setTransform(1, 0, 0, 1, 0, 0);
    const L = layers!;
    const place = (c: CanvasRenderingContext2D, img: CanvasImageSource, b: { x: number; y: number; w: number; h: number }) =>
      c.drawImage(img, OX + b.x * S, OY + b.y * S, b.w * S, b.h * S);

    screen();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, cw, ch);

    // The sky.
    if (P.skyAlpha > 0.01) {
      ctx.globalAlpha = P.skyAlpha * (1 - P.skyT);
      if (ctx.globalAlpha > 0.01) place(ctx, sky(P.skyA), SKY_BOUNDS);
      ctx.globalAlpha = P.skyAlpha * P.skyT;
      if (ctx.globalAlpha > 0.01) place(ctx, sky(P.skyB), SKY_BOUNDS);
      ctx.globalAlpha = 1;
    }
    world();
    const storm = P.lightning > 0 || P.rain > 0.3 ? Math.max(P.rain, P.lightning) : 0;
    for (const c of clouds) {
      const a = c.storm ? Math.max(0, storm) : P.clouds * (1 - storm);
      if (a < 0.02) continue;
      ctx.globalAlpha = a;
      ctx.drawImage(c.art, c.x, c.y, c.w, c.h);
    }
    ctx.globalAlpha = 1;
    weather.drawBirds(ctx, P.birds);

    // The land: this season's ground, the buildings on it, this season's trees and snow.
    screen();
    const bleeding = P.bleed > 0 && P.bleed < 1;
    if (bleeding) {
      ensureSeason(P.seasonA);
      ensureSeason(P.seasonB);
      drawMask(P.bleed);
    } else if (act === 'shots') ensureSeason(P.bleed >= 1 ? P.seasonB : P.seasonA);
    const season = (layerOf: (s: Season) => LayerName) => {
      if (!bleeding) {
        place(ctx, L[layerOf(P.bleed >= 1 ? P.seasonB : P.seasonA)].canvas, PAINTED);
        return;
      }
      for (const [s, op] of [[P.seasonA, 'destination-out'], [P.seasonB, 'destination-in']] as const) {
        tctx.globalCompositeOperation = 'source-over';
        tctx.clearRect(0, 0, cw, ch);
        place(tctx, L[layerOf(s)].canvas, PAINTED);
        tctx.globalCompositeOperation = op;
        tctx.drawImage(mask, 0, 0, cw, ch);
        ctx.drawImage(temp, 0, 0);
      }
    };
    season(groundOf);
    place(ctx, L.build.canvas, PAINTED);
    season((s) => s);
    place(ctx, L.ink.canvas, PAINTED);

    // The living.
    world();
    if (P.life > 0.01) {
      ctx.save();
      life.draw(ctx, { colour: P.colour, rain: P.rain, snow: P.snow, fade: P.life });
      ctx.restore();
    }
    weather.drawLeaves(ctx);
    weather.drawSplashes(ctx, P.rain);

    // The hour: one glaze over the whole sheet.
    screen();
    if (P.glazeAlpha > 0.01) {
      const [r, g, b] = P.glaze.map(Math.round);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgba(${r},${g},${b},${P.glazeAlpha})`;
      ctx.fillRect(0, 0, cw, ch);
    }

    // The lights, and the lights of the sky.
    const skyW = (id: SkyId) => (P.skyA === id ? 1 - P.skyT : 0) + (P.skyB === id ? P.skyT : 0);
    const nightSky = skyW('night');
    ctx.globalCompositeOperation = 'source-over';
    // The sky's lights sit in the top of the frame, wherever the camera is:
    // at this height the real sky is mostly out of the picture.
    const cssW = cw / dpr;
    const cssH = ch / dpr;
    weather.drawStars(ctx, cw, ch * 0.24, (nightSky + skyW('dawn') * 0.3) * (1 - P.clouds * 0.4), dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    weather.drawMoon(ctx, cssW * 0.78, cssH * 0.14, nightSky + skyW('dawn') * 0.55);
    ctx.globalCompositeOperation = 'screen';
    weather.drawSun(ctx, cssW * 0.7, cssH * 0.2, skyW('dusk'), '255,170,95');
    weather.drawSun(ctx, cssW * 0.2, cssH * 0.18, skyW('dawn') * 0.8, '255,196,160');
    if (P.night > 0.03) {
      screen();
      ctx.globalAlpha = smooth(0.3, 1, P.night);
      place(ctx, L.lights.canvas, PAINTED);
      ctx.globalAlpha = 1;
      world();
      // Light running round Endeavor's band of triangles, like a signal down a wire.
      const n = campus.fascia.length;
      for (let i = 0; i < n; i++) {
        const wave = Math.pow(Math.max(0, Math.sin(filmT * 1.4 - i * 0.28)), 8);
        const a = P.night * (0.12 + 0.7 * wave);
        const [p0, p1, p2] = campus.fascia[i];
        ctx.fillStyle = `rgba(150,230,90,${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.fill();
      }
      life.lights(ctx, P.night, filmT);
    }

    // A wet street doubles every light on it: headlights and tail lights in any
    // rain, the lamps once they are lit.
    if (P.rain > 0.05) {
      world();
      ctx.globalCompositeOperation = 'screen';
      const wet = [
        ...life.carLights().flatMap((c) => [
          { at: c.front, colour: '255,236,196', alpha: c.alpha * (0.35 + P.night * 0.65), len: 14 },
          { at: c.rear, colour: '255,90,80', alpha: c.alpha * (0.3 + P.night * 0.7), len: 10 },
        ]),
        ...campus.lampFeet.map((at) => ({ at, colour: '255,214,150', alpha: smooth(0.3, 0.9, P.night), len: 22 })),
      ];
      weather.drawReflections(ctx, wet, P.rain);
    }

    // Weather: the veil of rain over the distance, then the rain itself.
    ctx.globalCompositeOperation = 'source-over';
    screen();
    weather.drawMist(ctx, cw, ch, Math.max(ch * 0.2, OY + 300 * S), P.rain, dpr);
    weather.drawRain(ctx, cw, ch, P.rain, dpr);
    weather.drawSnow(ctx, cw, ch, P.snow, dpr);
    const flash = weather.flashAmount * P.lightning;
    if (flash > 0.02) {
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(235,238,255,${0.5 * flash})`;
      ctx.fillRect(0, 0, cw, ch);
      world();
      weather.drawBolt(ctx);
      screen();
    }

    // The hand at work.
    if (pencilAt && act === 'sketch') {
      world();
      drawPencil(ctx, pencilAt[0], pencilAt[1]);
    }
    if (brushAt && act === 'paint') {
      world();
      drawBrush(ctx, brushAt[0], brushAt[1], filmT);
    }

    // The tooth of the paper, last, through everything.
    screen();
    if (toothPattern) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 0.7;
      toothPattern.setTransform(new DOMMatrix([dpr, 0, 0, dpr, OX % (256 * dpr), OY % (256 * dpr)]));
      ctx.fillStyle = toothPattern;
      ctx.fillRect(0, 0, cw, ch);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // Tell the page what it is looking at.
    const text = act === 'sketch' || act === 'blank' ? 'sketching' : act === 'paint' ? 'painting' : P.skyT > 0.5 || P.bleed > 0.5 ? shots[next].label : shots[cur].label;
    const index = act === 'shots' ? (P.skyT > 0.5 || P.bleed > 0.5 ? next : cur) : -1;
    if (text !== caption) {
      caption = text;
      hooks.onCaption(text, index);
    }
    const isDark = P.night > 0.55 && P.glazeAlpha > 0.35;
    if (isDark !== dark) {
      dark = isDark;
      hooks.onDark(dark);
    }
    hooks.onProgress?.(act === 'shots' ? clamp(shotT / (shots[cur].hold + CHANGE)) : act === 'paint' ? actT / PAINT : act === 'sketch' ? actT / SKETCH : 0);
  }

  function frame(now: number) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (playing) advance(dt);
    render(playing ? dt : 0);
    if (playing && visible && !reduced) raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (!raf && visible) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  measure();
  if (reduced) {
    // The same painting, finished and still: every season is there to choose.
    act = 'shots';
    finish(() => true);
    inkTo(inkTotal);
    for (let i = 0; i < 40; i++) life.update(0.25, shots[0].bustle);
    const c = shots[0].camera;
    Object.assign(cam, c);
  }
  render(0);

  const onResize = () => {
    measure();
    kick();
    if (!raf) render(0);
  };

  return {
    begin() {
      if (act !== 'blank') return;
      act = 'sketch';
      actT = 0;
      kick();
    },
    goTo(i) {
      if (act !== 'shots') endIntro();
      if (reduced) {
        cur = i;
        next = (i + 1) % shots.length;
        shotT = 0;
        ensureSeason(shots[i].season);
        Object.assign(cam, shots[i].camera);
        render(0);
        return;
      }
      if (i === cur && shotT <= shots[cur].hold) return;
      // Whatever is arriving arrives now; then the chosen shot begins to.
      if (shotT > shots[cur].hold) cur = next;
      next = i;
      shotT = shots[cur].hold;
      bleedSeeds = [];
      if (cur === next) shotT = 0;
      kick();
    },
    setPlaying(p) {
      playing = p;
      if (p) kick();
      else render(0);
    },
    setVisible(v) {
      visible = v;
      if (v) kick();
    },
    resize: onResize,
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      visible = false;
    },
  };
}
