"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Track, VisualMode } from "@/types/music";
import { GENRES, genreColor } from "@/lib/genres";
import { clamp, hashString, mulberry32 } from "@/lib/utils";
import { matchesFilter, type SpatialFilter } from "@/lib/spatialFilter";
import { TAU, targetFor, type Area, type Particle, type Point } from "@/lib/universe/layout";
import {
  buildCurves,
  paintBackground,
  paintCurrent,
  paintEnergyAxes,
  paintFilteredParticle,
  paintFlowLabels,
  paintLinks,
  paintParticle,
  paintSpawnRing,
  paintTraversal,
  type Star,
} from "@/lib/universe/painters";

export interface CanvasInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** A full-list walk requested by the user; `startedAt` uses performance.now() seconds. */
export interface TraversalRequest {
  id: number;
  startedAt: number;
}

interface UniverseCanvasProps {
  tracks: Track[];
  currentUid: string | null;
  mode: VisualMode;
  isPlaying: boolean;
  insets: CanvasInsets;
  traversal: TraversalRequest | null;
  circular: boolean;
  filter: SpatialFilter;
  getAnalyser: () => AnalyserNode | null;
  onSelect: (index: number) => void;
}

const SPAWN_RING_SECONDS = 1.4;
const TRAVERSAL_STEP_SECONDS = 0.28;
const EASE_RATE = 2.8;
// Slightly underdamped (critical damping would be 2 * sqrt(60) ≈ 15.5): a soft overshoot on each beat
const SPRING_STIFFNESS = 60;
const SPRING_DAMPING = 11;

export default function UniverseCanvas(props: UniverseCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const particlesRef = useRef(new Map<string, Particle>());
  /** Clickable particles; null for the ones hidden by the filter */
  const hitRef = useRef<(Point | null)[]>([]);
  const hoverIndexRef = useRef(-1);
  const [hover, setHover] = useState<{ index: number; uid: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const random = mulberry32(20240917);
    const stars: Star[] = Array.from({ length: 240 }, () => ({
      x: random(),
      y: random(),
      size: random() * 1.3 + 0.3,
      phase: random() * TAU,
    }));
    const freq = new Uint8Array(128);
    const particles = particlesRef.current;
    const mountedAt = performance.now() / 1000;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      sizeRef.current = { w: rect.width, h: rect.height, dpr };
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let raf = 0;
    let last = performance.now();
    let level = 0;
    let linkEnergy = 0;
    let energyVelocity = 0;
    let visibleCache: { tracks: Track[] | null; filter: SpatialFilter | null; visible: boolean[] } = {
      tracks: null,
      filter: null,
      visible: [],
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const t = now / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const { tracks, currentUid, mode, isPlaying, insets, traversal, circular, filter, getAnalyser } = propsRef.current;
      const { w, h, dpr } = sizeRef.current;
      if (w === 0 || h === 0) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintBackground(ctx, mode, w, h, t, stars);

      const night = mode === "night";
      const currentIndex = tracks.findIndex((track) => track.uid === currentUid);
      const currentTrack = currentIndex >= 0 ? tracks[currentIndex] : null;

      // Audio level: real (AnalyserNode) or simulated on the song's beat
      let targetLevel = 0;
      const analyser = isPlaying ? getAnalyser() : null;
      if (analyser) {
        analyser.getByteFrequencyData(freq);
        let sum = 0;
        for (let i = 0; i < 32; i++) sum += freq[i];
        targetLevel = sum / (32 * 255);
      } else if (isPlaying && currentTrack) {
        const beat = Math.max(0, Math.sin(t * TAU * (currentTrack.tempo / 60)));
        targetLevel = 0.3 + 0.35 * beat;
        for (let i = 0; i < freq.length; i++) {
          freq[i] = 255 * (0.5 + 0.5 * Math.sin(t * 6 + i * 0.4)) * (1 - i / freq.length) * (0.4 + 0.6 * beat);
        }
      } else {
        freq.fill(0);
      }
      level += (targetLevel - level) * 0.2;

      const area: Area = {
        left: insets.left,
        top: insets.top,
        width: Math.max(160, w - insets.left - insets.right),
        height: Math.max(160, h - insets.top - insets.bottom),
      };
      if (mode === "energy") paintEnergyAxes(ctx, area);

      // Move every particle smoothly towards its target
      const ease = 1 - Math.exp(-dt * EASE_RATE);
      const points: Point[] = tracks.map((track, index) => {
        let particle = particles.get(track.uid);
        if (!particle) {
          const seed = hashString(track.uid);
          particle = {
            x: area.left + area.width / 2,
            y: area.top + area.height / 2,
            seedA: (seed % 1000) / 1000,
            seedB: (Math.floor(seed / 1000) % 1000) / 1000,
            born: t,
          };
          particles.set(track.uid, particle);
        }
        const target = targetFor(mode, track, index, tracks.length, area, t, particle);
        particle.x += (target.x - particle.x) * ease;
        particle.y += (target.y - particle.y) * ease;
        const grow = clamp((t - particle.born) * 2.5, 0, 1);
        const isCurrent = index === currentIndex;
        const radius = (5 + track.energy * 7) * (isCurrent ? 1.5 : 1) * grow + (isCurrent ? level * 10 : 0);
        return { x: particle.x, y: particle.y, r: radius };
      });
      // Prune only when a track left the list (uids are unique, so sizes match otherwise)
      if (particles.size > tracks.length) {
        const alive = new Set(tracks.map((track) => track.uid));
        particles.forEach((_, uid) => {
          if (!alive.has(uid)) particles.delete(uid);
        });
      }

      // Link energy follows the music through a damped spring: it swells and settles instead of snapping
      const energyTarget = isPlaying && currentTrack ? Math.min(1, 0.3 + level * 1.4) : 0;
      energyVelocity += ((energyTarget - linkEnergy) * SPRING_STIFFNESS - energyVelocity * SPRING_DAMPING) * dt;
      linkEnergy = clamp(linkEnergy + energyVelocity * dt, 0, 1.2);

      const curves = buildCurves(points, t, linkEnergy);
      paintLinks(ctx, mode, points, curves, t, circular, linkEnergy);

      // Recomputed only when the list or the filter changes, not on every frame
      if (visibleCache.tracks !== tracks || visibleCache.filter !== filter) {
        visibleCache = { tracks, filter, visible: tracks.map((track) => matchesFilter(track, filter)) };
      }
      const visible = visibleCache.visible;
      tracks.forEach((track, index) => {
        if (index === currentIndex) return;
        if (visible[index]) paintParticle(ctx, track, points[index], night, index === hoverIndexRef.current);
        else paintFilteredParticle(ctx, track, points[index], night);
      });

      // Newly linked nodes announce themselves with an expanding ring
      tracks.forEach((track, index) => {
        const particle = particles.get(track.uid);
        if (!particle || particle.born < mountedAt + 0.5) return;
        const age = t - particle.born;
        if (age < SPAWN_RING_SECONDS) paintSpawnRing(ctx, track, points[index], age, SPAWN_RING_SECONDS);
      });

      if (mode === "flow") paintFlowLabels(ctx, points);

      if (traversal) {
        const elapsed = t - traversal.startedAt;
        const total = (points.length + 1.5) * TRAVERSAL_STEP_SECONDS;
        if (elapsed >= 0 && elapsed < total) paintTraversal(ctx, points, curves, elapsed, TRAVERSAL_STEP_SECONDS);
      }

      if (currentIndex >= 0) paintCurrent(ctx, tracks[currentIndex], points[currentIndex], freq, t, night);

      // The current song stays clickable even when the filter hides its genre
      hitRef.current = points.map((point, index) => (visible[index] || index === currentIndex ? point : null));
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  const findHit = (clientX: number, clientY: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return -1;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best = -1;
    let bestDistance = Infinity;
    hitRef.current.forEach((point, index) => {
      if (!point) return;
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance < Math.max(point.r + 10, 16) && distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    return best;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const index = findHit(event.clientX, event.clientY);
    if (index !== hoverIndexRef.current) {
      hoverIndexRef.current = index;
      const point = hitRef.current[index];
      const track = props.tracks[index];
      setHover(index >= 0 && point && track ? { index, uid: track.uid, x: point.x, y: point.y } : null);
    }
  };

  const handlePointerLeave = () => {
    hoverIndexRef.current = -1;
    setHover(null);
  };

  const handleClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const index = findHit(event.clientX, event.clientY);
    if (index >= 0) props.onSelect(index);
  };

  // The list may change under the pointer: never describe a different song than the hovered one
  const hoveredTrack = hover ? props.tracks[hover.index] : undefined;
  const hovered = hoveredTrack?.uid === hover?.uid ? hoveredTrack : undefined;

  return (
    <div className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className={`h-full w-full ${hover ? "cursor-pointer" : "cursor-crosshair"}`}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
        aria-label="Universo musical: cada partícula es una canción"
      />
      <AnimatePresence>
        {hover && hovered && (
          <motion.div
            key={hovered.uid}
            initial={{ opacity: 0, x: "-50%", y: 6, scale: 0.95 }}
            animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }}
            exit={{ opacity: 0, x: "-50%", scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="glass pointer-events-none absolute z-10 w-52 rounded-xl px-3 py-2 text-xs"
            style={{ left: hover.x, top: hover.y + 22 }}
          >
            <p className="truncate font-semibold text-white">{hovered.title}</p>
            <p className="truncate text-white/60">{hovered.artist}</p>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-white/50">
              <span style={{ color: genreColor(hovered.genre) }}>{GENRES[hovered.genre].label}</span>
              <span>{hovered.tempo} BPM</span>
              <span>posición {hover.index + 1}</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-teal-300 to-rose-400" style={{ width: `${hovered.energy * 100}%` }} />
            </div>
            <p className="mt-1 text-[10px] text-white/40">Haz clic para viajar a esta canción</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
