/**
 * WEATHER, AND THE LIGHTS OF THE SKY.
 *
 * Rain is a slant of short graphite strokes; snow, soft dots drifting on a
 * wind that changes its mind; in autumn leaves come off the crowns and turn
 * over on the way down, and in spring the blossom does. Summer has swifts.
 * Night has stars, which twinkle, and a moon with a halo; dusk has a low sun.
 * A thunderstorm has lightning: the page goes white for an instant, and a
 * bolt is drawn from the cloud to the hills.
 *
 * Rain and snow fall in screen space — they are in front of the camera, not
 * in the scene. Leaves fall in the world, from the tree they grew on.
 */

import { proj, scaleAt, GROUND_SQUASH, type Campus, type Strip, type Tree } from './campus';
import { between, pick, rng, type Rng } from './random';
import type { Pt } from './wash';

interface Drop {
  x: number;
  y: number;
  v: number;
  l: number;
  /** Which of four brightness buckets it is drawn in, so a layer is four strokes, not hundreds. */
  b: number;
}

/** A layer of rain at one depth: far drops are fine, short and slow on screen; near ones long, fast and blurred. */
interface RainLayer {
  drops: Drop[];
  /** Streak length and fall speed, in CSS pixels and screen heights per second. */
  len: number;
  speed: number;
  width: number;
  alpha: number;
  /** How much the wind leans it. */
  lean: number;
}

interface Splash {
  x: number;
  y: number;
  /** Radius when fully spread, in world units. */
  r: number;
  t: number;
  life: number;
  ripple: boolean;
}

interface Flake {
  x: number;
  y: number;
  v: number;
  s: number;
  p: number;
}

interface Leaf {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  a: number;
  size: number;
  colour: string;
  floor: number;
  life: number;
  petal: boolean;
}

interface Bird {
  x: number;
  y: number;
  v: number;
  p: number;
  s: number;
}

const LEAF = ['#e08a2b', '#d4602a', '#eba42c', '#b8392c', '#c9772e'];
const PETAL = ['#f2a9bb', '#f7c6d2', '#e98aa5'];

export class Weather {
  private r: Rng;
  private rain: RainLayer[] = [];
  private splashes: Splash[] = [];
  private wet: Strip[];
  private shafts: HTMLCanvasElement | null = null;
  private gust = 0;
  private flakes: Flake[] = [];
  private leaves: Leaf[] = [];
  private birds: Bird[] = [];
  private stars: [number, number, number, number][] = [];
  private trees: Tree[];
  private flash = 0;
  private bolt: Pt[][] | null = null;
  private nextStrike = 3;
  private wind = 0;
  private time = 0;

  constructor(campus: Campus) {
    this.r = rng(4242);
    this.trees = campus.trees.filter((t) => t.kind !== 'palm');
    const r = this.r;
    this.wet = campus.wet;
    const layer = (n: number, len: number, speed: number, width: number, alpha: number, lean: number): RainLayer => ({
      drops: Array.from({ length: n }, () => ({ x: r(), y: r(), v: between(r, 0.85, 1.15), l: between(r, 0.7, 1.3), b: Math.floor(r() * 4) })),
      len,
      speed,
      width,
      alpha,
      lean,
    });
    this.rain = [layer(1100, 10, 0.55, 0.7, 0.26, 0.7), layer(480, 22, 0.95, 1, 0.4, 0.85), layer(110, 64, 1.7, 1.6, 0.5, 1)];
    for (let k = 0; k < 360; k++) this.flakes.push({ x: r(), y: r(), v: between(r, 0.5, 1.2), s: between(r, 0.6, 1.8), p: r() * 6.28 });
    for (let k = 0; k < 220; k++) this.stars.push([r(), r(), between(r, 0.4, 1.4), r() * 6.28]);
    for (let k = 0; k < 7; k++) this.birds.push({ x: between(r, -400, 1600), y: between(r, 280, 400), v: between(r, 50, 80), p: r() * 6.28, s: between(r, 0.8, 1.3) });
  }

  update(dt: number, w: { leaves: number; petals: number; birds: number; lightning: number; rain: number }) {
    const r = this.r;
    this.time += dt;
    this.wind = Math.sin(this.time * 0.23) * 0.6 + Math.sin(this.time * 0.61) * 0.3;
    // Gusts: the rain leans harder for a few seconds, then eases.
    this.gust = 0.1 + 0.08 * Math.sin(this.time * 0.37) + 0.1 * Math.max(0, Math.sin(this.time * 0.13)) ** 3;

    // Splashes on the hard surfaces, and rings spreading on the wet road.
    const rate = w.rain * 140;
    let n = rate * dt + r();
    while (n >= 1) {
      n -= 1;
      const { a, b, width } = pick(r, this.wet);
      const t = r();
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const across = between(r, -0.5, 0.5) * width;
      const x = a[0] + (b[0] - a[0]) * t - ((b[1] - a[1]) / l) * across;
      const y = a[1] + (b[1] - a[1]) * t + ((b[0] - a[0]) / l) * across;
      const [sx, sy] = proj(x, y);
      if (sx < 40 || sx > 1560 || sy > 990) continue;
      const ripple = r() < 0.35;
      this.splashes.push({ x: sx, y: sy, r: scaleAt(y) * (ripple ? between(r, 0.9, 1.6) : between(r, 0.4, 0.7)), t: 0, life: ripple ? between(r, 0.6, 0.9) : between(r, 0.18, 0.3), ripple });
    }
    for (const sp of this.splashes) sp.t += dt;
    this.splashes = this.splashes.filter((sp) => sp.t < sp.life);

    // Leaves and petals: born in a crown, fall to the ground under it, lie a moment, fade.
    const want = Math.round(w.leaves * 46 + w.petals * 40);
    if (this.leaves.length < want && r() < dt * 12) {
      const t = pick(r, this.trees);
      const petal = w.petals > w.leaves;
      if (!petal || t.kind === 'blossom' || t.kind === 'street') {
        const a = r() * 6.28;
        const d = Math.sqrt(r()) * t.r * 0.8;
        this.leaves.push({
          x: t.cx + Math.cos(a) * d,
          y: t.cy + Math.sin(a) * d * 0.7,
          vx: between(r, -6, 6),
          vy: between(r, 12, 24) * (petal ? 0.6 : 1),
          spin: r() * 6.28,
          a: 0,
          size: petal ? between(r, 1.6, 2.6) : between(r, 2.2, 3.6),
          colour: pick(r, petal ? PETAL : LEAF),
          floor: t.base + between(r, 4, 70),
          life: 0,
          petal,
        });
      }
    }
    for (const l of this.leaves) {
      l.life += dt;
      if (l.y < l.floor) {
        l.x += (l.vx + this.wind * (l.petal ? 26 : 14) + Math.sin(l.spin) * 8) * dt;
        l.y += l.vy * dt;
        l.spin += dt * (l.petal ? 3 : 2.2);
        l.a = Math.min(1, l.a + dt * 2);
      } else {
        l.a -= dt * 0.25;
      }
    }
    this.leaves = this.leaves.filter((l) => l.a > 0 || l.life < 0.5);

    for (const b of this.birds) {
      b.x += b.v * dt;
      b.p += dt * 9;
      if (b.x > 1800) {
        b.x = between(r, -600, -200);
        b.y = between(r, 280, 400);
      }
    }

    this.flash = Math.max(0, this.flash - dt * 3.2);
    if (w.lightning > 0.5) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.flash = 1;
        this.bolt = this.makeBolt();
        this.nextStrike = between(r, 2.5, 6);
      }
    }
    if (this.flash <= 0) this.bolt = null;
  }

  private makeBolt(): Pt[][] {
    const r = this.r;
    const fork = (x: number, y: number, to: number, spread: number): Pt[] => {
      const pts: Pt[] = [[x, y]];
      while (y < to) {
        x += between(r, -spread, spread);
        y += between(r, 10, 24);
        pts.push([x, y]);
      }
      return pts;
    };
    const main = fork(between(r, 420, 1250), 170, 390, 14);
    const out = [main];
    // A few branches off the main stroke, shorter and fainter.
    for (let k = 0; k < 3; k++) {
      const from = main[Math.floor(between(r, 2, main.length - 3))];
      out.push(fork(from[0], from[1], from[1] + between(r, 40, 90), 22));
    }
    return out;
  }

  /** Behind the land: birds, in the world. */
  drawBirds(ctx: CanvasRenderingContext2D, amount: number) {
    if (amount < 0.02) return;
    ctx.strokeStyle = `rgba(38,36,42,${0.7 * amount})`;
    ctx.lineWidth = 0.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const b of this.birds) {
      const f = Math.sin(b.p) * 3 * b.s;
      ctx.moveTo(b.x - 5 * b.s, b.y - f);
      ctx.quadraticCurveTo(b.x - 2 * b.s, b.y - 1, b.x, b.y);
      ctx.quadraticCurveTo(b.x + 2 * b.s, b.y - 1, b.x + 5 * b.s, b.y - f);
    }
    ctx.stroke();
  }

  /** In front of the land: leaves and petals, in the world. */
  drawLeaves(ctx: CanvasRenderingContext2D) {
    for (const l of this.leaves) {
      ctx.globalAlpha = Math.max(0, l.a) * 0.85;
      ctx.fillStyle = l.colour;
      ctx.beginPath();
      ctx.ellipse(l.x, l.y, l.size, l.size * Math.abs(Math.cos(l.spin)) * 0.55 + 0.3, l.spin, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Stars, twinkling, in screen space, above `limit`. */
  drawStars(ctx: CanvasRenderingContext2D, w: number, limit: number, amount: number, dpr: number) {
    if (amount < 0.02 || limit <= 0) return;
    ctx.fillStyle = '#fffaf0';
    for (const [sx, sy, s, p] of this.stars) {
      const y = sy * limit;
      const a = amount * (0.45 + 0.55 * Math.sin(this.time * 1.7 + p)) * (1 - sy * 0.6);
      if (a <= 0.02) continue;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(sx * w, y, s * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** The moon, with its halo, in the world. */
  drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number, amount: number) {
    if (amount < 0.02) return;
    const halo = ctx.createRadialGradient(x, y, 8, x, y, 120);
    halo.addColorStop(0, `rgba(255,248,225,${0.45 * amount})`);
    halo.addColorStop(0.3, `rgba(220,226,255,${0.16 * amount})`);
    halo.addColorStop(1, 'rgba(220,226,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x - 120, y - 120, 240, 240);
    ctx.globalAlpha = amount;
    ctx.fillStyle = '#fbf6e6';
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(200,190,170,0.5)';
    for (const [dx, dy, s] of [[-4, -3, 3.4], [5, 2, 2.4], [-1, 6, 1.8], [6, -6, 1.5]]) {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** A low sun: at dusk behind the right-hand hills, at dawn rising on the left. */
  drawSun(ctx: CanvasRenderingContext2D, x: number, y: number, amount: number, warm: string) {
    if (amount < 0.15) return;
    const g = ctx.createRadialGradient(x, y, 4, x, y, 260);
    g.addColorStop(0, `rgba(${warm},${0.55 * amount})`);
    g.addColorStop(0.15, `rgba(${warm},${0.25 * amount})`);
    g.addColorStop(1, `rgba(${warm},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - 260, y - 260, 520, 520);
    ctx.globalAlpha = amount * 0.9;
    ctx.fillStyle = '#fff2d2';
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /**
   * Rain, in screen space: three depths of streaks under one wind.
   *
   * Real rain on camera is not a uniform hatch. The far drops are fine and
   * short and there are a great many of them; the near ones are few, long
   * and fast, blurred into streaks brighter at the head than the tail. Rain
   * comes in shafts — bands where it falls harder — that drift across with
   * the wind, and gusts lean all of it together.
   */
  drawRain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, dpr: number) {
    if (amount < 0.02) return;
    const area = Math.min(1.4, (w * h) / (1500 * 900 * dpr * dpr) + 0.25);
    ctx.lineCap = 'round';
    for (const L of this.rain) {
      const lean = this.gust * L.lean;
      const len = L.len * dpr;
      const count = Math.min(L.drops.length, Math.floor(L.drops.length * amount * area));
      for (let bucket = 0; bucket < 4; bucket++) {
        ctx.beginPath();
        let any = false;
        for (let i = 0; i < count; i++) {
          const d = L.drops[i];
          if (d.b !== bucket) continue;
          const y = ((d.y + this.time * L.speed * d.v) % 1) * (h + len * 2) - len;
          const x0 = d.x * w + y * lean;
          const x = ((x0 % w) + w) % w;
          // The shafts: density rises and falls across the screen, drifting.
          const shaft = 0.55 + 0.45 * Math.sin(x / w * 5.2 - this.time * 0.35 + Math.sin(this.time * 0.11) * 2);
          if (shaft < (bucket + 0.5) / 5) continue;
          const l = len * d.l;
          ctx.moveTo(x, y);
          ctx.lineTo(x - lean * l, y - l);
          any = true;
        }
        if (!any) continue;
        ctx.strokeStyle = `rgba(218,226,240,${(L.alpha * (0.55 + bucket * 0.18) * amount).toFixed(3)})`;
        ctx.lineWidth = L.width * dpr;
        ctx.stroke();
      }
    }
  }

  /** The veil over the distance while it rains, and shafts of rain falling in it. */
  drawMist(ctx: CanvasRenderingContext2D, w: number, h: number, horizon: number, amount: number, dpr: number) {
    if (amount < 0.02) return;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    const hz = Math.max(0.05, Math.min(0.9, horizon / h));
    g.addColorStop(0, `rgba(196,202,214,${0.28 * amount})`);
    g.addColorStop(hz, `rgba(196,202,214,${0.34 * amount})`);
    g.addColorStop(Math.min(1, hz + 0.3), `rgba(196,202,214,${0.08 * amount})`);
    g.addColorStop(1, 'rgba(196,202,214,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Shafts in the far distance: fine vertical streaks, falling, fading in and out across the sky.
    if (!this.shafts) this.shafts = shaftTexture();
    const tile = this.shafts;
    const scroll = (this.time * 260 * dpr) % (tile.height * dpr);
    ctx.save();
    ctx.globalAlpha = 0.5 * amount;
    ctx.beginPath();
    ctx.rect(0, 0, w, horizon + 40 * dpr);
    ctx.clip();
    const tw = tile.width * dpr;
    const th = tile.height * dpr;
    for (let x = -tw; x < w + tw; x += tw) {
      for (let y = -th + scroll; y < horizon + th; y += th) ctx.drawImage(tile, x + this.gust * y * 0.3, y, tw, th);
    }
    ctx.restore();
  }

  /** In the world: drops bursting on the pavements and rings spreading on the road. */
  drawSplashes(ctx: CanvasRenderingContext2D, amount: number) {
    if (amount < 0.02 && this.splashes.length === 0) return;
    ctx.lineWidth = 0.5;
    for (const sp of this.splashes) {
      const u = sp.t / sp.life;
      const a = (1 - u) * 0.6;
      ctx.strokeStyle = `rgba(226,232,244,${a.toFixed(3)})`;
      ctx.beginPath();
      if (sp.ripple) {
        ctx.ellipse(sp.x, sp.y, sp.r * u, sp.r * u * GROUND_SQUASH, 0, 0, Math.PI * 2);
        if (u > 0.3) ctx.ellipse(sp.x, sp.y, sp.r * (u - 0.3), sp.r * (u - 0.3) * GROUND_SQUASH, 0, 0, Math.PI * 2);
      } else {
        // A crown of spray: two droplets thrown up and out, and the splash's rim.
        const up = Math.sin(u * Math.PI) * sp.r * 1.4;
        ctx.ellipse(sp.x, sp.y, sp.r * (0.4 + u), sp.r * (0.4 + u) * GROUND_SQUASH, 0, Math.PI, 0);
        ctx.moveTo(sp.x - sp.r * u * 1.2 + 0.6, sp.y - up);
        ctx.arc(sp.x - sp.r * u * 1.2, sp.y - up, 0.6, 0, Math.PI * 2);
        ctx.moveTo(sp.x + sp.r * u * 1.2 + 0.6, sp.y - up * 0.8);
        ctx.arc(sp.x + sp.r * u * 1.2, sp.y - up * 0.8, 0.6, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
  }

  /** Lights doubled in the wet street: a streak straight down from each, broken by the rain. */
  drawReflections(ctx: CanvasRenderingContext2D, lights: { at: Pt; colour: string; alpha: number; len: number }[], amount: number) {
    if (amount < 0.05) return;
    ctx.lineCap = 'round';
    for (const l of lights) {
      const a = l.alpha * amount;
      if (a < 0.02) continue;
      const g = ctx.createLinearGradient(l.at[0], l.at[1], l.at[0], l.at[1] + l.len);
      g.addColorStop(0, `rgba(${l.colour},${(0.55 * a).toFixed(3)})`);
      g.addColorStop(1, `rgba(${l.colour},0)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      // Broken into dashes that shimmer as the surface is struck.
      const n = 5;
      for (let k = 0; k < n; k++) {
        const y0 = l.at[1] + (k / n) * l.len;
        const y1 = y0 + (l.len / n) * (0.5 + 0.4 * Math.sin(this.time * 17 + k * 2.1 + l.at[0]));
        ctx.moveTo(l.at[0] + Math.sin(this.time * 9 + k) * 0.6, y0);
        ctx.lineTo(l.at[0], y1);
      }
      ctx.stroke();
    }
  }

  /** Snow, in screen space. */
  drawSnow(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, dpr: number) {
    if (amount < 0.02) return;
    const n = Math.floor(this.flakes.length * amount);
    ctx.fillStyle = `rgba(255,255,255,${0.85 * amount})`;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const f = this.flakes[i];
      const y = ((f.y + this.time * 0.05 * f.v) % 1) * (h + 10) - 5;
      const x = (((f.x + Math.sin(this.time * 0.7 + f.p) * 0.012 + this.wind * 0.02 * (y / h)) % 1) + 1) % 1;
      const s = f.s * dpr * 1.3;
      ctx.moveTo(x * w + s, y);
      ctx.arc(x * w, y, s, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  /** The strike: the sheet goes white, and the bolt is drawn. Called in world space for the bolt. */
  drawBolt(ctx: CanvasRenderingContext2D) {
    if (!this.bolt || this.flash < 0.05) return;
    ctx.strokeStyle = `rgba(255,255,250,${this.flash})`;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(210,220,255,0.9)';
    ctx.shadowBlur = 18;
    this.bolt.forEach((stroke, k) => {
      ctx.lineWidth = k === 0 ? 2.2 : 1;
      ctx.beginPath();
      stroke.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    });
    ctx.shadowBlur = 0;
  }

  get flashAmount() {
    // A strike flickers: bright, dim, bright again, gone.
    const f = this.flash;
    return f * (f > 0.7 ? 1 : f > 0.5 ? 0.3 : 0.8);
  }
}

/** A tile of fine vertical streaks: distant rain, too far to see as drops. */
function shaftTexture(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 220;
  c.height = 260;
  const ctx = c.getContext('2d')!;
  const r = rng(808);
  ctx.lineCap = 'round';
  for (let k = 0; k < 170; k++) {
    const x = r() * c.width;
    const y = r() * c.height;
    const l = between(r, 8, 22);
    ctx.strokeStyle = `rgba(236,240,248,${between(r, 0.15, 0.5).toFixed(2)})`;
    ctx.lineWidth = between(r, 0.4, 0.8);
    for (const dy of [0, -c.height, c.height]) {
      ctx.beginPath();
      ctx.moveTo(x, y + dy);
      ctx.lineTo(x - l * 0.08, y + dy + l);
      ctx.stroke();
    }
  }
  return c;
}
