/**
 * THE PEOPLE, AND THE TRAFFIC.
 *
 * Everyone here is a few pencil strokes and a dab of colour: a head, a coat,
 * legs that scissor as they walk. They walk the campus's paths — the shaded
 * walk between the two buildings, the plaza round Endeavor, the pavements —
 * come and go under Voyager's canopy, stand and talk beneath it, and put
 * umbrellas up when it rains. Fewer of them are out at night.
 *
 * The streets carry pods with no wheels, hovering over their own shadows;
 * drones work the air over the roofs, and now and then an air taxi crosses.
 *
 * People and cars live on the campus PLAN, in metres, and are projected every
 * frame through the same camera as the painting — so they shrink with
 * distance and follow the roads' perspective exactly. From this height a
 * person would be a speck; they are drawn a little over twice life size, and
 * cars a little larger than life, so they read.
 */

import { hidden, proj, scaleAt, GROUND_SQUASH, type Campus, type Walk } from './campus';
import type { Pt } from './wash';
import { between, clamp, pick, rng, smooth, type Rng } from './random';

const GRAPHITE = 'rgba(38,36,42,0.82)';
const COATS = ['#c8423a', '#2b3f9e', '#e0a13a', '#3f7d3a', '#5a3a8e', '#d86f8c', '#2f6e78', '#8a5a3c', '#e9e2d2', '#34343c'];
const LEGS = ['#3a3d4a', '#4b4f63', '#6b5a48', '#2e2f36', '#7d7f8c'];
const SKIN = ['#f0c9a8', '#d9a57f', '#b27a55', '#8a5a3c', '#f3d6bf'];
const UMBRELLAS = ['#c8423a', '#2b3f9e', '#e0a13a', '#34343c', '#3f7d3a', '#d86f8c'];
const PODS = ['#e9e4d8', '#c8423a', '#2b3f9e', '#3a3d46', '#8fa9bd', '#e0a13a', '#f2efe8'];

/** How much larger than life figures and cars are drawn. */
const PERSON_SCALE = 2.3;
const CAR_SCALE = 1.35;

interface Person {
  walk: Walk;
  len: number;
  d: number;
  dir: 1 | -1;
  off: number;
  speed: number;
  phase: number;
  coat: string;
  legs: string;
  skin: string;
  umbrella: string;
  keen: number;
  here: number;
  age: number;
  standing: boolean;
  /** On the plan. */
  px: number;
  py: number;
}

interface Car {
  lane: number;
  d: number;
  speed: number;
  colour: string;
}

interface Drone {
  cx: number;
  cy: number;
  ax: number;
  ay: number;
  f: number;
  p: number;
  x: number;
  y: number;
}

function lengthOf(path: Pt[]): number {
  let l = 0;
  for (let i = 1; i < path.length; i++) l += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return l;
}

/** The point `d` along a path, and the unit direction there. */
function along(path: Pt[], d: number): [number, number, number, number] {
  for (let i = 1; i < path.length; i++) {
    const dx = path[i][0] - path[i - 1][0];
    const dy = path[i][1] - path[i - 1][1];
    const seg = Math.hypot(dx, dy) || 1;
    if (d <= seg || i === path.length - 1) {
      const t = Math.min(1, d / seg);
      return [path[i - 1][0] + dx * t, path[i - 1][1] + dy * t, dx / seg, dy / seg];
    }
    d -= seg;
  }
  return [path[0][0], path[0][1], 1, 0];
}

export class Life {
  private r: Rng;
  private people: Person[] = [];
  private cars: Car[] = [];
  private drones: Drone[] = [];
  private taxi = { t: -8, period: 34 };
  private gaps: number[];
  private laneLen: number[];
  private campus: Campus;
  time = 0;

  constructor(campus: Campus, count = 64) {
    this.r = rng(1717);
    this.campus = campus;
    this.laneLen = campus.lanes.map((l) => lengthOf(l.path));
    this.gaps = campus.lanes.map(() => 0);
    for (let k = 0; k < count; k++) this.people.push(this.spawn(true, k < campus.terrace.length * 2));
    for (let k = 0; k < 3; k++) {
      this.drones.push({ cx: between(this.r, 620, 1080), cy: between(this.r, 360, 460), ax: between(this.r, 80, 160), ay: between(this.r, 12, 30), f: between(this.r, 0.05, 0.1), p: between(this.r, 0, 6), x: 0, y: 0 });
    }
    // The streets already have traffic on them when the film begins.
    campus.lanes.forEach((_, lane) => {
      for (let d = 0; d < this.laneLen[lane]; d += between(this.r, 40, 110)) this.cars.push(this.car(lane, d));
    });
    this.update(0.01, 1);
  }

  private spawn(anywhere: boolean, standing = false): Person {
    const r = this.r;
    const walks = this.campus.walks;
    let walk = walks[0];
    let pickW = r() * walks.reduce((a, w) => a + w.weight, 0);
    for (const w of walks) {
      pickW -= w.weight;
      if (pickW <= 0) {
        walk = w;
        break;
      }
    }
    const len = lengthOf(walk.path);
    const dir: 1 | -1 = walk.door ? (r() < 0.5 ? 1 : -1) : r() < 0.5 ? 1 : -1;
    const spot = standing ? pick(r, this.campus.terrace) : ([0, 0] as Pt);
    return {
      walk,
      len,
      d: anywhere ? r() * len : dir === 1 ? 0 : len,
      dir,
      off: between(r, -walk.spread, walk.spread),
      speed: between(r, 1.1, 1.6),
      phase: r() * 6.28,
      coat: pick(r, COATS),
      legs: pick(r, LEGS),
      skin: pick(r, SKIN),
      umbrella: pick(r, UMBRELLAS),
      keen: standing ? 0.3 : r(),
      here: 0,
      age: anywhere ? 5 : 0,
      standing,
      px: spot[0] + between(r, -3, 3),
      py: spot[1] + between(r, -3, 3),
    };
  }

  private car(lane: number, d = 0): Car {
    return { lane, d, speed: between(this.r, 13, 22), colour: pick(this.r, PODS) };
  }

  update(dt: number, bustle: number) {
    this.time += dt;
    const r = this.r;
    for (let i = 0; i < this.people.length; i++) {
      const p = this.people[i];
      p.here += clamp((p.keen <= bustle ? 1 : 0) - p.here, -dt * 0.6, dt * 0.6);
      p.age += dt;
      if (p.standing) {
        p.phase += dt * 0.8;
        continue;
      }
      p.d += p.dir * p.speed * dt;
      p.phase += p.speed * dt * 3.4;
      if (p.d < 0 || p.d > p.len) {
        this.people[i] = this.spawn(false);
        continue;
      }
      const [x, y, tx, ty] = along(p.walk.path, p.d);
      p.px = x - ty * p.off;
      p.py = y + tx * p.off;
    }

    for (const c of this.cars) c.d += c.speed * dt;
    this.cars = this.cars.filter((c) => c.d < this.laneLen[c.lane]);
    this.campus.lanes.forEach((_, lane) => {
      this.gaps[lane] -= dt;
      if (this.gaps[lane] <= 0) {
        // Cars enter well off the painting, so they are already moving when they arrive.
        this.cars.push(this.car(lane));
        this.gaps[lane] = between(r, 2.5, 6) / Math.max(0.25, bustle);
      }
    });

    for (const d of this.drones) {
      const t = this.time * d.f * 6.28 + d.p;
      d.x = d.cx + Math.sin(t) * d.ax;
      d.y = d.cy + Math.sin(t * 2) * d.ay;
    }
    this.taxi.t += dt;
    if (this.taxi.t > this.taxi.period) this.taxi.t = -between(r, 4, 12);
  }

  /** How much of something at screen point (x, y) shows, fading toward the ragged edges of the painting. */
  private edge(x: number, y: number) {
    return smooth(40, 150, x) * (1 - smooth(1450, 1560, x)) * smooth(250, 320, y) * (1 - smooth(930, 990, y));
  }

  draw(ctx: CanvasRenderingContext2D, env: { colour: number; rain: number; snow: number; fade: number }) {
    const shown = this.people.map((p) => ({ p, at: proj(p.px, p.py) })).sort((a, b) => a.at[1] - b.at[1]);
    for (const c of this.cars) this.pod(ctx, c, env.colour, env.fade);
    for (const { p, at } of shown) {
      let a = env.fade * p.here * this.edge(at[0], at[1]) * Math.min(1, p.age);
      if (p.walk.door && !p.standing) a *= smooth(0, 6, p.len - p.d);
      // Round the back of a building, a walker is hidden by it.
      if (a < 0.02 || hidden(this.campus.occluders, at[0], at[1])) continue;
      this.person(ctx, p, at, a, env);
    }
    ctx.globalAlpha = env.fade;
    for (const d of this.drones) this.drone(ctx, d.x, d.y);
    this.airTaxi(ctx);
    ctx.globalAlpha = 1;
  }

  private person(ctx: CanvasRenderingContext2D, p: Person, [x, y]: Pt, alpha: number, env: { colour: number; rain: number; snow: number }) {
    const h = 1.75 * scaleAt(p.py) * PERSON_SCALE;
    const swing = p.standing ? 0 : Math.sin(p.phase);
    const hip = y - h * 0.46;
    const shoulder = y - h * 0.8;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(60,52,78,0.18)';
    ctx.beginPath();
    ctx.ellipse(x + h * 0.15, y, h * 0.24, h * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(0.6, h * 0.08);
    ctx.strokeStyle = p.legs;
    ctx.globalAlpha = alpha * (0.35 + 0.55 * env.colour);
    ctx.beginPath();
    ctx.moveTo(x, hip);
    ctx.lineTo(x + swing * h * 0.14, y);
    ctx.moveTo(x, hip);
    ctx.lineTo(x - swing * h * 0.14, y);
    ctx.stroke();

    ctx.globalAlpha = alpha * env.colour * 0.9;
    ctx.fillStyle = p.coat;
    ctx.beginPath();
    ctx.moveTo(x - h * 0.11, shoulder);
    ctx.lineTo(x + h * 0.11, shoulder);
    ctx.lineTo(x + h * 0.13, hip + h * 0.06);
    ctx.lineTo(x - h * 0.13, hip + h * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = alpha * 0.6;
    ctx.strokeStyle = GRAPHITE;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    const hy = shoulder - h * 0.1;
    ctx.globalAlpha = alpha * (0.4 + 0.5 * env.colour);
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(x, hy, h * 0.09, 0, Math.PI * 2);
    ctx.fill();

    const cover = Math.max(env.rain, env.snow * 0.6);
    if (cover > 0.15 && (p.keen > 0.2 || env.rain > 0.5)) {
      const u = smooth(0.15, 0.5, cover);
      ctx.globalAlpha = alpha * u * (0.45 + 0.45 * env.colour);
      ctx.fillStyle = p.umbrella;
      ctx.beginPath();
      ctx.ellipse(x, hy - h * 0.12, h * 0.34 * u, h * 0.18 * u, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = alpha * u * 0.6;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** A pod, drawn as its body on the plan, projected: a footprint, a shadow, a cabin. */
  private pod(ctx: CanvasRenderingContext2D, c: Car, colour: number, fade: number) {
    const [x, y, tx, ty] = along(this.campus.lanes[c.lane].path, c.d);
    const [sx, sy] = proj(x, y);
    const a = this.edge(sx, sy) * fade;
    if (a < 0.02) return;
    const L = 4.8 * CAR_SCALE;
    const W = 2 * CAR_SCALE;
    const hover = 0.5 + Math.sin(this.time * 3 + c.d * 0.3) * 0.12;
    const quad = (l: number, w: number, z: number, dx = 0, dy = 0) =>
      [
        [l, w],
        [l, -w],
        [-l, -w],
        [-l, w],
      ].map(([u, v]) => proj(x + tx * u - ty * v + dx, y + ty * u + tx * v + dy, z));
    const fill = (pts: Pt[], style: string, alpha: number) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = style;
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      ctx.fill();
    };
    fill(quad(L * 0.5, W * 0.5, 0, 0.6, -0.8), '#3c3a4c', a * 0.2);
    const body = quad(L * 0.5, W * 0.5, hover);
    fill(body, c.colour, a * 0.85 * colour);
    ctx.globalAlpha = a * 0.7;
    ctx.strokeStyle = GRAPHITE;
    ctx.lineWidth = 0.6;
    ctx.stroke();
    fill(quad(L * 0.24, W * 0.38, hover + 1.4, -tx * 0.3, -ty * 0.3), '#2d3646', a * 0.55);
    ctx.globalAlpha = 1;
  }

  private drone(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.strokeStyle = GRAPHITE;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x - 6, y);
    ctx.lineTo(x + 6, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(40,40,52,0.7)';
    ctx.fillRect(x - 2.5, y - 1, 5, 3);
    ctx.fillStyle = 'rgba(40,40,52,0.18)';
    for (const dx of [-6, 6]) {
      ctx.beginPath();
      ctx.ellipse(x + dx, y - 0.5, 4, 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private taxiAt(): Pt | null {
    const u = this.taxi.t / this.taxi.period;
    if (u < 0 || u > 1) return null;
    return [100 + u * 1500, 300 - u * 50 + Math.sin(u * 9) * 6];
  }

  private airTaxi(ctx: CanvasRenderingContext2D) {
    const p = this.taxiAt();
    if (!p) return;
    ctx.save();
    ctx.translate(p[0], p[1]);
    ctx.strokeStyle = GRAPHITE;
    ctx.lineWidth = 0.8;
    ctx.fillStyle = 'rgba(235,232,224,0.85)';
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.quadraticCurveTo(-18, -8, 2, -8);
    ctx.quadraticCurveTo(20, -7, 24, 0);
    ctx.quadraticCurveTo(0, 4, -22, 0);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(45,54,70,0.6)';
    ctx.beginPath();
    ctx.moveTo(6, -7);
    ctx.quadraticCurveTo(18, -6, 21, -1);
    ctx.lineTo(6, -2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-30, -9);
    ctx.lineTo(30, -9);
    ctx.stroke();
    ctx.fillStyle = 'rgba(40,40,52,0.16)';
    for (const dx of [-30, -12, 12, 30]) {
      ctx.beginPath();
      ctx.ellipse(dx, -11, 9, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Screen points of every car's front and rear, and its heading on screen — for the rain's reflections. */
  carLights(): { front: Pt; rear: Pt; alpha: number }[] {
    return this.cars.map((c) => {
      const [x, y, tx, ty] = along(this.campus.lanes[c.lane].path, c.d);
      const L = 2.4 * CAR_SCALE;
      const front = proj(x + tx * L, y + ty * L, 0.6);
      const rear = proj(x - tx * L, y - ty * L, 0.6);
      return { front, rear, alpha: this.edge(front[0], front[1]) };
    });
  }

  /** Lights, laid over the painting after it has been glazed for the hour. */
  lights(ctx: CanvasRenderingContext2D, night: number, t: number) {
    if (night < 0.05) return;
    for (const c of this.cars) {
      const [x, y, tx, ty] = along(this.campus.lanes[c.lane].path, c.d);
      const L = 2.4 * CAR_SCALE;
      const [fx, fy] = proj(x + tx * L, y + ty * L, 0.6);
      const a = this.edge(fx, fy) * night;
      if (a < 0.02) continue;
      // Headlights throw a cone along the road ahead.
      const tip = (u: number, v: number) => proj(x + tx * u - ty * v, y + ty * u + tx * v, 0);
      const [ax, ay] = tip(L + 22, -5);
      const [bx, by] = tip(L + 22, 5);
      const beam = ctx.createRadialGradient(fx, fy, 0, fx, fy, Math.hypot(ax - fx, ay - fy) + 4);
      beam.addColorStop(0, `rgba(255,236,190,${0.28 * a})`);
      beam.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.closePath();
      ctx.fill();
      const [rx, ry] = proj(x - tx * L, y - ty * L, 0.6);
      ctx.fillStyle = `rgba(255,80,70,${0.75 * a})`;
      ctx.beginPath();
      ctx.arc(rx, ry, 1.4, 0, Math.PI * 2);
      ctx.fill();
      // The pod's underglow on the road.
      const [cx, cy] = proj(x, y);
      const s = scaleAt(y) * L;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 1.2);
      glow.addColorStop(0, `rgba(120,230,255,${0.35 * a})`);
      glow.addColorStop(1, 'rgba(120,230,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(cx, cy, s * 1.2, s * 1.2 * GROUND_SQUASH, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const blink = (Math.sin(t * 6) > 0.6 ? 1 : 0.15) * night;
    for (const d of this.drones) {
      ctx.fillStyle = `rgba(255,70,60,${blink})`;
      ctx.beginPath();
      ctx.arc(d.x - 6, d.y, 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(110,255,140,${blink})`;
      ctx.beginPath();
      ctx.arc(d.x + 6, d.y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = this.taxiAt();
    if (p) {
      const g = ctx.createRadialGradient(p[0], p[1] + 2, 0, p[0], p[1] + 2, 26);
      g.addColorStop(0, `rgba(170,230,255,${0.5 * night})`);
      g.addColorStop(1, 'rgba(170,230,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(p[0] - 26, p[1] - 24, 52, 52);
      ctx.fillStyle = `rgba(255,255,255,${blink})`;
      ctx.beginPath();
      ctx.arc(p[0] + 24, p[1], 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
