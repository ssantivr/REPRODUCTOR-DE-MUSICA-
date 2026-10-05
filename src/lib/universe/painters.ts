import type { Track, VisualMode } from "@/types/music";
import { genreColor } from "../genres";
import { TAU, type Area, type Point } from "./layout";

export interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

export function paintBackground(ctx: CanvasRenderingContext2D, mode: VisualMode, w: number, h: number, t: number, stars: Star[]) {
  if (mode === "flow") {
    const river = ctx.createLinearGradient(0, 0, w, 0);
    river.addColorStop(0, "#020b16");
    river.addColorStop(0.5, "#03121f");
    river.addColorStop(1, "#0d0518");
    ctx.fillStyle = river;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  if (mode === "energy") {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "#2a0718");
    gradient.addColorStop(0.5, "#0b0716");
    gradient.addColorStop(1, "#03161f");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  } else if (mode === "night") {
    ctx.fillStyle = "#010207";
    ctx.fillRect(0, 0, w, h);
    const moon = ctx.createRadialGradient(w * 0.82, h * 0.18, 0, w * 0.82, h * 0.18, Math.max(w, h) * 0.35);
    moon.addColorStop(0, "rgba(148, 163, 184, 0.12)");
    moon.addColorStop(1, "rgba(148, 163, 184, 0)");
    ctx.fillStyle = moon;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = "#04020c";
    ctx.fillRect(0, 0, w, h);
    const big = Math.max(w, h);
    const nebulaA = ctx.createRadialGradient(w * (0.45 + 0.1 * Math.sin(t * 0.05)), h * 0.45, 0, w * 0.45, h * 0.45, big * 0.6);
    nebulaA.addColorStop(0, "rgba(109, 40, 217, 0.28)");
    nebulaA.addColorStop(1, "rgba(109, 40, 217, 0)");
    ctx.fillStyle = nebulaA;
    ctx.fillRect(0, 0, w, h);
    const nebulaB = ctx.createRadialGradient(w * 0.75, h * (0.6 + 0.1 * Math.cos(t * 0.04)), 0, w * 0.75, h * 0.6, big * 0.45);
    nebulaB.addColorStop(0, "rgba(14, 165, 233, 0.16)");
    nebulaB.addColorStop(1, "rgba(14, 165, 233, 0)");
    ctx.fillStyle = nebulaB;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.fillStyle = "#ffffff";
  for (const star of stars) {
    const twinkle =
      mode === "night" ? 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 1.4 + star.phase)) : 0.55 + 0.3 * Math.sin(t * 0.6 + star.phase);
    ctx.globalAlpha = (mode === "energy" ? 0.25 : 0.75) * twinkle;
    ctx.fillRect(star.x * w, star.y * h, star.size, star.size);
  }
  ctx.globalAlpha = 1;
}

export function paintEnergyAxes(ctx: CanvasRenderingContext2D, area: Area) {
  const { left, top, width, height } = area;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.font = "10px ui-sans-serif, system-ui";
  ctx.textAlign = "center";

  for (let bpm = 60; bpm <= 180; bpm += 20) {
    const x = left + 50 + ((bpm - 60) / 120) * (width - 100);
    ctx.beginPath();
    ctx.moveTo(x, top + 30);
    ctx.lineTo(x, top + height - 30);
    ctx.stroke();
    ctx.fillText(`${bpm}`, x, top + height - 14);
  }
  for (let energy = 0; energy <= 1; energy += 0.25) {
    const y = top + 40 + (1 - energy) * (height - 80);
    ctx.beginPath();
    ctx.moveTo(left + 40, y);
    ctx.lineTo(left + width - 40, y);
    ctx.stroke();
  }

  ctx.font = "600 11px ui-sans-serif, system-ui";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(251, 113, 133, 0.8)";
  ctx.fillText("▲ ENERGÍA", left + 44, top + 26);
  ctx.fillStyle = "rgba(45, 212, 191, 0.8)";
  ctx.fillText("▼ CALMA", left + 44, top + height - 32);
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.textAlign = "right";
  ctx.fillText("PULSACIONES POR MINUTO →", left + width - 44, top + height - 32);
}

/**
 * Curved dashed arc from the tail back to the head, drawn when the list is
 * circular (repeat mode). A small comet travels along it towards the head.
 */
function paintClosingLink(ctx: CanvasRenderingContext2D, tail: Point, head: Point, t: number) {
  const midX = (tail.x + head.x) / 2;
  const midY = (tail.y + head.y) / 2;
  const dx = head.x - tail.x;
  const dy = head.y - tail.y;
  const bend = 0.35;
  const controlX = midX - dy * bend;
  const controlY = midY + dx * bend;

  ctx.strokeStyle = "rgba(167, 139, 250, 0.45)";
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 6]);
  ctx.lineDashOffset = -t * 18;
  ctx.beginPath();
  ctx.moveTo(tail.x, tail.y);
  ctx.quadraticCurveTo(controlX, controlY, head.x, head.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  const f = (t * 0.35) % 1;
  const x = (1 - f) * (1 - f) * tail.x + 2 * (1 - f) * f * controlX + f * f * head.x;
  const y = (1 - f) * (1 - f) * tail.y + 2 * (1 - f) * f * controlY + f * f * head.y;
  ctx.fillStyle = "rgba(196, 181, 253, 0.95)";
  ctx.beginPath();
  ctx.arc(x, y, 2.4, 0, TAU);
  ctx.fill();
}

/** Control points of the cubic Bézier that joins points[i] with points[i + 1]. */
export interface Curve {
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
}

/** Catmull-Rom tangent scale: 1/6 is the exact conversion, lower values give tighter curves. */
const CURVE_TENSION = 0.8 / 6;

/**
 * One cubic Bézier per link of the list (Catmull-Rom → Bézier), so the chain
 * flows through every node without corners, like a hand-drawn constellation.
 * `energy` (0 when silent) makes each link vibrate like a plucked string.
 */
export function buildCurves(points: Point[], t: number, energy: number): Curve[] {
  const curves: Curve[] = [];
  const last = points.length - 1;
  for (let i = 0; i < last; i++) {
    const before = points[Math.max(0, i - 1)];
    const a = points[i];
    const b = points[i + 1];
    const after = points[Math.min(last, i + 2)];

    // Perpendicular offset, opposite on each control point: an S-shaped standing wave
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const wave = Math.sin(t * 5 + i * 1.3) * energy * Math.min(10, length * 0.12);
    const nx = (-dy / length) * wave;
    const ny = (dx / length) * wave;

    curves.push({
      c1x: a.x + (b.x - before.x) * CURVE_TENSION + nx,
      c1y: a.y + (b.y - before.y) * CURVE_TENSION + ny,
      c2x: b.x - (after.x - a.x) * CURVE_TENSION - nx,
      c2y: b.y - (after.y - a.y) * CURVE_TENSION - ny,
    });
  }
  return curves;
}

/** Point of a cubic Bézier at `f` (0 = a, 1 = b). */
function cubicAt(a: Point, curve: Curve, b: Point, f: number): { x: number; y: number } {
  const g = 1 - f;
  const wa = g * g * g;
  const w1 = 3 * g * g * f;
  const w2 = 3 * g * f * f;
  const wb = f * f * f;
  return {
    x: wa * a.x + w1 * curve.c1x + w2 * curve.c2x + wb * b.x,
    y: wa * a.y + w1 * curve.c1y + w2 * curve.c2y + wb * b.y,
  };
}

/**
 * Draws the chain that joins consecutive nodes (the list order) as smooth
 * curves. While music plays, `energy` brightens the chain and sends sparks
 * along every link in the `next` direction.
 */
export function paintLinks(
  ctx: CanvasRenderingContext2D,
  mode: VisualMode,
  points: Point[],
  curves: Curve[],
  t: number,
  circular: boolean,
  energy: number,
) {
  if (points.length < 2) return;
  if (circular) paintClosingLink(ctx, points[points.length - 1], points[0], t);

  const alpha = (mode === "flow" ? 0.45 : mode === "night" ? 0.22 : 0.08) + energy * 0.18;
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.lineWidth = (mode === "flow" ? 1.5 : 1) + energy * 0.6;
  ctx.setLineDash(mode === "night" ? [2, 6] : []);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  curves.forEach((curve, i) => ctx.bezierCurveTo(curve.c1x, curve.c1y, curve.c2x, curve.c2y, points[i + 1].x, points[i + 1].y));
  ctx.stroke();
  ctx.setLineDash([]);

  if (mode !== "flow") {
    if (energy < 0.02) return;
    // Energy sparks: one per link, all filled in a single path
    const radius = 1 + energy * 1.6;
    ctx.fillStyle = `rgba(34, 211, 238, ${Math.min(0.9, energy) * (mode === "night" ? 0.5 : 1)})`;
    ctx.beginPath();
    curves.forEach((curve, i) => {
      const spark = cubicAt(points[i], curve, points[i + 1], (t * 0.45 + i * 0.37) % 1);
      ctx.moveTo(spark.x + radius, spark.y);
      ctx.arc(spark.x, spark.y, radius, 0, TAU);
    });
    ctx.fill();
    return;
  }

  // Pulses: cyan travels along `next` (→), magenta along `prev` (←); they swell with the music
  const radius = 2.2 + energy * 1.4;
  curves.forEach((curve, i) => {
    const forward = cubicAt(points[i], curve, points[i + 1], (t * 0.6 + i * 0.13) % 1);
    const backward = cubicAt(points[i], curve, points[i + 1], 1 - ((t * 0.6 + 0.5 + i * 0.13) % 1));

    ctx.fillStyle = "rgba(34, 211, 238, 0.9)";
    ctx.beginPath();
    ctx.arc(forward.x, forward.y, radius, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "rgba(232, 121, 249, 0.9)";
    ctx.beginPath();
    ctx.arc(backward.x, backward.y, radius, 0, TAU);
    ctx.fill();
  });
}

/** Particle hidden by the spatial filter: a faint outline that keeps its place in the chain. */
export function paintFilteredParticle(ctx: CanvasRenderingContext2D, track: Track, point: Point, night: boolean) {
  ctx.strokeStyle = genreColor(track.genre, 0.22, night);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(point.x, point.y, Math.max(2, point.r * 0.55), 0, TAU);
  ctx.stroke();
}

export function paintParticle(ctx: CanvasRenderingContext2D, track: Track, point: Point, night: boolean, hovered: boolean) {
  const r = point.r * (hovered ? 1.35 : 1);
  const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, r * 3);
  glow.addColorStop(0, genreColor(track.genre, night ? 0.25 : 0.35, night));
  glow.addColorStop(1, genreColor(track.genre, 0, night));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(point.x, point.y, r * 3, 0, TAU);
  ctx.fill();

  ctx.fillStyle = genreColor(track.genre, night ? 0.7 : 0.95, night);
  ctx.beginPath();
  ctx.arc(point.x, point.y, night ? r * 0.45 : r, 0, TAU);
  ctx.fill();
}

/** Expanding ring shown when a new node joins the list. */
export function paintSpawnRing(ctx: CanvasRenderingContext2D, track: Track, point: Point, age: number, duration: number) {
  const progress = age / duration;
  ctx.strokeStyle = genreColor(track.genre, 0.9 * (1 - progress));
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(point.x, point.y, point.r + 6 + progress * 70, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 * (1 - progress)})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(point.x, point.y, point.r + 4 + progress * 40, 0, TAU);
  ctx.stroke();
}

/** A comet that walks the list from head to tail, one node per step. */
export function paintTraversal(ctx: CanvasRenderingContext2D, points: Point[], curves: Curve[], elapsed: number, stepSeconds: number) {
  if (points.length === 0) return;
  const progress = elapsed / stepSeconds;
  const reached = Math.min(Math.floor(progress), points.length - 1);
  const fraction = progress - Math.floor(progress);

  ctx.strokeStyle = "rgba(250, 250, 255, 0.75)";
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "rgba(167, 139, 250, 0.9)";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i <= reached; i++) {
    const curve = curves[i - 1];
    ctx.bezierCurveTo(curve.c1x, curve.c1y, curve.c2x, curve.c2y, points[i].x, points[i].y);
  }

  let head = points[reached];
  if (reached < points.length - 1) {
    // De Casteljau split: draws only the first `fraction` of the link being walked
    const a = points[reached];
    const b = points[reached + 1];
    const curve = curves[reached];
    const mix = (from: number, to: number) => from + (to - from) * fraction;
    const q0x = mix(a.x, curve.c1x);
    const q0y = mix(a.y, curve.c1y);
    const q1x = mix(curve.c1x, curve.c2x);
    const q1y = mix(curve.c1y, curve.c2y);
    const q2x = mix(curve.c2x, b.x);
    const q2y = mix(curve.c2y, b.y);
    const r0x = mix(q0x, q1x);
    const r0y = mix(q0y, q1y);
    head = { x: mix(r0x, mix(q1x, q2x)), y: mix(r0y, mix(q1y, q2y)), r: head.r };
    ctx.bezierCurveTo(q0x, q0y, r0x, r0y, head.x, head.y);
  }
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(head.x, head.y, 4, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;

  for (let i = 0; i <= reached; i++) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(points[i].x, points[i].y, points[i].r + 8, 0, TAU);
    ctx.stroke();
  }
}

export function paintCurrent(
  ctx: CanvasRenderingContext2D,
  track: Track,
  point: Point,
  freq: Uint8Array,
  t: number,
  night: boolean,
) {
  const { x, y, r } = point;

  const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 4.5);
  halo.addColorStop(0, genreColor(track.genre, 0.5, night));
  halo.addColorStop(1, genreColor(track.genre, 0, night));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 4.5, 0, TAU);
  ctx.fill();

  // Spectrum ring driven by the audio analyser
  const bars = 48;
  ctx.strokeStyle = genreColor(track.genre, 0.85, night);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let b = 0; b < bars; b++) {
    const value = freq[b * 2] / 255;
    const angle = (b / bars) * TAU + t * 0.25;
    const inner = r + 7;
    const outer = inner + 3 + value * 28;
    ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
    ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
  }
  ctx.stroke();

  // Rotating dotted orbit
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 7]);
  ctx.lineDashOffset = -t * 20;
  ctx.beginPath();
  ctx.arc(x, y, r + 42, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = genreColor(track.genre, 1, night);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.7, 0, TAU);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.font = "600 13px ui-sans-serif, system-ui";
  ctx.fillText(track.title, x, y - r - 52);
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.font = "11px ui-sans-serif, system-ui";
  ctx.fillText(track.artist, x, y - r - 37);
}

/** Flow mode labels: position numbers plus start / end markers. */
export function paintFlowLabels(ctx: CanvasRenderingContext2D, points: Point[]) {
  if (points.length === 0) return;
  ctx.textAlign = "center";
  ctx.font = "10px ui-sans-serif, system-ui";
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  points.forEach((point, index) => ctx.fillText(String(index + 1), point.x, point.y + point.r + 16));

  ctx.font = "600 10px ui-sans-serif, system-ui";
  ctx.fillStyle = "rgba(34, 211, 238, 0.9)";
  ctx.fillText("INICIO", points[0].x, points[0].y - points[0].r - 14);
  const last = points[points.length - 1];
  ctx.fillStyle = "rgba(232, 121, 249, 0.9)";
  ctx.fillText("FINAL", last.x, last.y - last.r - (points.length === 1 ? 26 : 14));
}
