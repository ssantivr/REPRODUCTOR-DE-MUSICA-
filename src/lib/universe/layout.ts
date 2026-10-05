import type { Track, VisualMode } from "@/types/music";
import { clamp } from "../utils";

export const TAU = Math.PI * 2;

export interface Area {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
  r: number;
}

export interface Particle {
  x: number;
  y: number;
  seedA: number;
  seedB: number;
  born: number;
}

/** Target position of a song particle for each visual mode. */
export function targetFor(
  mode: VisualMode,
  track: Track,
  index: number,
  count: number,
  area: Area,
  t: number,
  particle: Particle,
): { x: number; y: number } {
  const { left, top, width, height } = area;
  const cx = left + width / 2;
  const cy = top + height / 2;

  switch (mode) {
    case "universe": {
      // Orbit radius grows with energy, angular speed grows with tempo
      const minSide = Math.min(width, height);
      const radius = minSide * (0.1 + 0.38 * track.energy);
      const rx = Math.min(width / 2 - 24, radius * 1.4);
      const ry = Math.min(height / 2 - 24, radius * 0.75);
      const angle = particle.seedA * TAU + t * (track.tempo / 120) * 0.16;
      return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
    }
    case "flow": {
      // Nodes are laid out in list order, waving at their own tempo
      const span = count > 1 ? index / (count - 1) : 0.5;
      const amplitude = height * 0.22 * (0.35 + track.energy * 0.65);
      return {
        x: left + 50 + span * (width - 100),
        y: cy + Math.sin(t * (track.tempo / 60) * 0.9 + index * 0.75) * amplitude,
      };
    }
    case "night": {
      return {
        x: left + 40 + particle.seedA * (width - 80) + Math.sin(t * 0.05 + particle.seedB * TAU) * 12,
        y: top + 40 + particle.seedB * (height - 80) + Math.cos(t * 0.04 + particle.seedA * TAU) * 10,
      };
    }
    case "energy": {
      // x = tempo (60–180 BPM), y = energy (top = energetic)
      const tempoNorm = clamp((track.tempo - 60) / 120, 0, 1);
      return {
        x: left + 50 + tempoNorm * (width - 100) + Math.sin(t * 0.8 + particle.seedA * TAU) * 3,
        y: top + 40 + (1 - track.energy) * (height - 80) + Math.cos(t * 0.7 + particle.seedB * TAU) * 3,
      };
    }
  }
}
