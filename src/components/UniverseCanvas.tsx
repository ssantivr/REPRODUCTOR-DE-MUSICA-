"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Genre, Track, VisualMode } from "@/types/music";
import type { ListWalk } from "@/hooks/usePlaylist";
import { GENRES, genreColor } from "@/lib/genres";
import { clamp, hashString, mulberry32 } from "@/lib/utils";
import { matchesFilter, type SpatialFilter } from "@/lib/spatialFilter";
import { TAU, targetFor, type Area, type Particle, type Point } from "@/lib/universe/layout";
import {
  buildCurves,
  paintArrival,
  paintBackground,
  paintComet,
  paintCover,
  paintCurrent,
  paintEnergyAxes,
  paintFilteredParticle,
  paintFlowLabels,
  paintFocus,
  paintImplosion,
  paintLinks,
  paintParticle,
  paintRipple,
  paintSpawnRing,
  paintTraversal,
  paintWeld,
  pathPoint,
  type BackgroundFx,
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
  /** Last traversal of the list towards a position: a comet repeats it over the stars */
  walk: ListWalk | null;
  /** Changes every time the list is shuffled: the stars swirl into their new order */
  shuffleSignal: number;
  /** Active playlist: changing it plays the jump between galaxies */
  galaxyId: string;
  circular: boolean;
  filter: SpatialFilter;
  getAnalyser: () => AnalyserNode | null;
  onSelect: (index: number) => void;
}

const SPAWN_RING_SECONDS = 1.4;
export const TRAVERSAL_STEP_SECONDS = 0.28;
const EASE_RATE = 2.8;
// Slightly underdamped (critical damping would be 2 * sqrt(60) ≈ 15.5): a soft overshoot on each beat
const SPRING_STIFFNESS = 60;
const SPRING_DAMPING = 11;

const IMPLOSION_SECONDS = 0.6;
const SWIRL_SECONDS = 0.9;
const WARP_SECONDS = 0.9;
const SKY_FADE_SECONDS = 0.6;
const RIPPLE_SECONDS = 1.1;
const BEAT_COOLDOWN_SECONDS = 0.28;
const HOP_SECONDS = 0.42;
const ARRIVAL_SECONDS = 0.45;
const COMET_TRAIL = 12;
const COMET_TRAIL_SPACING_SECONDS = 0.018;
// "r, g, b": cyan follows `next`, magenta follows `prev` (same code as the flow mode), violet is a direct jump
const NEXT_COLOR = "34, 211, 238";
const PREV_COLOR = "232, 121, 249";
const JUMP_COLOR = "196, 181, 253";

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4;
const DRAG_THRESHOLD_PX = 5;

/** A star that has just left the list, kept only while it collapses. */
interface Ghost extends Point {
  genre: Genre;
  born: number;
  /** Its neighbors in the list: they get linked to each other when it leaves */
  leftUid?: string;
  rightUid?: string;
}

/** A light travelling over the stars of `uids`, one every `step` seconds. */
interface Comet {
  uids: string[];
  step: number;
  startedAt: number;
}

export default function UniverseCanvas(props: UniverseCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const particlesRef = useRef(new Map<string, Particle>());
  /** Clickable particles in universe coordinates; null for the ones hidden by the filter */
  const hitRef = useRef<(Point | null)[]>([]);
  const hoverIndexRef = useRef(-1);
  const [hover, setHover] = useState<{ index: number; uid: string; x: number; y: number } | null>(null);
  /** Zoom and pan: screen = universe × scale + (x, y) */
  const viewRef = useRef({ scale: 1, x: 0, y: 0 });
  const resettingRef = useRef(false);
  const [zoomed, setZoomed] = useState(false);
  /** Fingers / buttons pressed on the canvas, in canvas coordinates */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef({ moved: false, startX: 0, startY: 0 });
  /** Pointer offset from the center (-0.5 to 0.5), for the parallax of the background */
  const parallaxRef = useRef({ x: 0, y: 0 });
  /** Star chosen with the keyboard, -1 for none */
  const focusRef = useRef(-1);
  const reducedRef = useRef(false);

  // Whoever asks the system for less motion gets a still universe: no orbits, comets or flashes
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      reducedRef.current = query.matches;
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const syncZoomed = useCallback(() => {
    const { scale, x, y } = viewRef.current;
    setZoomed(Math.abs(scale - 1) > 0.01 || Math.abs(x) > 1 || Math.abs(y) > 1);
  }, []);

  /** Zooms keeping the point (px, py) of the canvas under the same star. */
  const zoomAt = useCallback(
    (px: number, py: number, factor: number) => {
      const view = viewRef.current;
      const scale = clamp(view.scale * factor, MIN_ZOOM, MAX_ZOOM);
      const ratio = scale / view.scale;
      view.x = px - (px - view.x) * ratio;
      view.y = py - (py - view.y) * ratio;
      view.scale = scale;
      resettingRef.current = false;
      syncZoomed();
    },
    [syncZoomed],
  );

  const zoomCenter = (factor: number) => {
    const { w, h } = sizeRef.current;
    zoomAt(w / 2, h / 2, factor);
  };

  const resetView = () => {
    resettingRef.current = true;
    setZoomed(false);
  };

  const clearHover = useCallback(() => {
    hoverIndexRef.current = -1;
    setHover(null);
  }, []);

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
    // Covers already requested, by URL; an image is painted once it has finished loading
    const covers = new Map<string, HTMLImageElement>();
    const coverFor = (url: string): HTMLImageElement | null => {
      let image = covers.get(url);
      if (!image) {
        image = new Image();
        image.src = url;
        covers.set(url, image);
      }
      return image.complete && image.naturalWidth > 0 ? image : null;
    };
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

    // The wheel zooms towards the pointer; it must not be passive to keep the page from scrolling
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.0015));
      clearHover();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    let raf = 0;
    let last = performance.now();
    let level = 0;
    let levelAverage = 0;
    let lastBeat = 0;
    let linkEnergy = 0;
    let energyVelocity = 0;
    let parallaxX = 0;
    let parallaxY = 0;
    let visibleCache: { tracks: Track[] | null; filter: SpatialFilter | null; visible: boolean[] } = {
      tracks: null,
      filter: null,
      visible: [],
    };
    // Position of every song in the list, rebuilt only when the list changes
    let order: { tracks: Track[] | null; indexByUid: Map<string, number> } = { tracks: null, indexByUid: new Map() };
    let sky = { mode: propsRef.current.mode, previous: propsRef.current.mode, changedAt: -10 };
    let galaxy = propsRef.current.galaxyId;
    let warpAt = -10;
    let shuffleSeen = propsRef.current.shuffleSignal;
    let swirlAt = -10;
    let walkSeen = propsRef.current.walk?.id;
    let currentSeen = propsRef.current.currentUid;
    let comet: Comet | null = null;
    let ghosts: Ghost[] = [];
    let ripples: number[] = [];

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // `clock` measures how long things last; `t` drives what moves on its own and stays still in calm mode
      const clock = now / 1000;
      const calm = reducedRef.current;
      const t = calm ? 0 : clock;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const { tracks, currentUid, mode, isPlaying, insets, traversal, walk, shuffleSignal, galaxyId, circular, filter, getAnalyser } =
        propsRef.current;
      const { w, h, dpr } = sizeRef.current;
      if (w === 0 || h === 0) return;

      // Jump between galaxies: the whole list is replaced, so its stars do not "leave" one by one
      if (galaxyId !== galaxy) {
        galaxy = galaxyId;
        if (!calm && clock - mountedAt > 1.5) warpAt = clock;
      }
      const warpProgress = (clock - warpAt) / WARP_SECONDS;
      const warp = warpProgress < 1 ? Math.sin(Math.PI * warpProgress) : 0;

      if (order.tracks !== tracks) {
        const indexByUid = new Map<string, number>();
        tracks.forEach((track, index) => indexByUid.set(track.uid, index));
        const previous = order.tracks;
        if (previous && !calm) {
          const leaving = previous.filter((track) => !indexByUid.has(track.uid)).length;
          // A few stars leaving get their neighbors welded; a whole list leaving only collapses
          const weld = leaving <= 3 && warp === 0;
          previous.forEach((track, index) => {
            const particle = particles.get(track.uid);
            if (indexByUid.has(track.uid) || !particle) return;
            ghosts.push({
              x: particle.x,
              y: particle.y,
              r: 5 + track.energy * 7,
              genre: track.genre,
              born: clock,
              leftUid: weld ? previous[index - 1]?.uid : undefined,
              rightUid: weld ? previous[index + 1]?.uid : undefined,
            });
          });
        }
        particles.forEach((_, uid) => {
          if (!indexByUid.has(uid)) particles.delete(uid);
        });
        order = { tracks, indexByUid };
      }
      const currentIndex = currentUid ? (order.indexByUid.get(currentUid) ?? -1) : -1;
      const currentTrack = currentIndex >= 0 ? tracks[currentIndex] : null;
      const night = mode === "night";

      // Audio level: real (AnalyserNode) or simulated on the song's beat
      let targetLevel = 0;
      const analyser = isPlaying ? getAnalyser() : null;
      if (analyser) {
        analyser.getByteFrequencyData(freq);
        let sum = 0;
        for (let i = 0; i < 32; i++) sum += freq[i];
        targetLevel = sum / (32 * 255);
      } else if (isPlaying && currentTrack) {
        const beat = Math.max(0, Math.sin(clock * TAU * (currentTrack.tempo / 60)));
        targetLevel = 0.3 + 0.35 * beat;
        for (let i = 0; i < freq.length; i++) {
          freq[i] = 255 * (0.5 + 0.5 * Math.sin(clock * 6 + i * 0.4)) * (1 - i / freq.length) * (0.4 + 0.6 * beat);
        }
      } else {
        freq.fill(0);
      }
      level += (targetLevel - level) * 0.2;
      // A beat is a level clearly above its recent average: it sends a shock wave from the playing star
      levelAverage += (targetLevel - levelAverage) * 0.05;
      if (!calm && isPlaying && currentTrack && targetLevel > levelAverage * 1.2 + 0.04 && clock - lastBeat > BEAT_COOLDOWN_SECONDS) {
        lastBeat = clock;
        if (ripples.length < 4) ripples.push(clock);
      }

      // Background: fades between modes, breathes with the bass and shifts with the pointer
      if (mode !== sky.mode) sky = { mode, previous: sky.mode, changedAt: clock };
      const skyFade = calm ? 1 : clamp((clock - sky.changedAt) / SKY_FADE_SECONDS, 0, 1);
      parallaxX += (parallaxRef.current.x - parallaxX) * 0.06;
      parallaxY += (parallaxRef.current.y - parallaxY) * 0.06;
      const fx: BackgroundFx = { opacity: 1, level: calm ? 0 : level, parallaxX: calm ? 0 : parallaxX, parallaxY: calm ? 0 : parallaxY, warp };
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (skyFade < 1) {
        paintBackground(ctx, sky.previous, w, h, t, stars, fx);
        paintBackground(ctx, mode, w, h, t, stars, { ...fx, opacity: skyFade });
      } else {
        paintBackground(ctx, mode, w, h, t, stars, fx);
      }
      if (warp > 0) {
        ctx.fillStyle = `rgba(196, 181, 253, ${warp * 0.14})`;
        ctx.fillRect(0, 0, w, h);
      }

      // Everything below lives in universe coordinates: zoom and pan apply to it, not to the background
      const view = viewRef.current;
      if (resettingRef.current) {
        const ease = calm ? 1 : 1 - Math.exp(-dt * 9);
        view.scale += (1 - view.scale) * ease;
        view.x -= view.x * ease;
        view.y -= view.y * ease;
        if (Math.abs(view.scale - 1) < 0.002 && Math.abs(view.x) < 0.5 && Math.abs(view.y) < 0.5) {
          view.scale = 1;
          view.x = 0;
          view.y = 0;
          resettingRef.current = false;
        }
      }
      ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.x, dpr * view.y);

      const area: Area = {
        left: insets.left,
        top: insets.top,
        width: Math.max(160, w - insets.left - insets.right),
        height: Math.max(160, h - insets.top - insets.bottom),
      };
      if (mode === "energy") paintEnergyAxes(ctx, area);

      // Shuffle: the stars swirl around the center while their links are rearranged
      if (shuffleSignal !== shuffleSeen) {
        shuffleSeen = shuffleSignal;
        if (!calm) swirlAt = clock;
      }
      const swirlProgress = (clock - swirlAt) / SWIRL_SECONDS;
      const swirl = swirlProgress < 1 ? Math.sin(Math.PI * swirlProgress) : 0;
      const centerX = area.left + area.width / 2;
      const centerY = area.top + area.height / 2;

      // Move every particle smoothly towards its target
      const ease = calm ? 1 : 1 - Math.exp(-dt * EASE_RATE);
      const points: Point[] = tracks.map((track, index) => {
        let particle = particles.get(track.uid);
        if (!particle) {
          const seed = hashString(track.uid);
          particle = {
            x: centerX,
            y: centerY,
            seedA: (seed % 1000) / 1000,
            seedB: (Math.floor(seed / 1000) % 1000) / 1000,
            born: clock,
          };
          particles.set(track.uid, particle);
        }
        const target = targetFor(mode, track, index, tracks.length, area, t, particle);
        particle.x += (target.x - particle.x) * ease;
        particle.y += (target.y - particle.y) * ease;
        const grow = calm ? 1 : clamp((clock - particle.born) * 2.5, 0, 1);
        const isCurrent = index === currentIndex;
        const radius = (5 + track.energy * 7) * (isCurrent ? 1.5 : 1) * grow + (isCurrent ? level * 10 : 0);
        if (swirl === 0) return { x: particle.x, y: particle.y, r: radius };
        const angle = swirl * (0.8 + particle.seedB * 0.9);
        const shrink = 1 - 0.4 * swirl;
        const dx = particle.x - centerX;
        const dy = particle.y - centerY;
        return {
          x: centerX + (dx * Math.cos(angle) - dy * Math.sin(angle)) * shrink,
          y: centerY + (dx * Math.sin(angle) + dy * Math.cos(angle)) * shrink,
          r: radius,
        };
      });

      // Link energy follows the music through a damped spring: it swells and settles instead of snapping
      const energyTarget = isPlaying && currentTrack && !calm ? Math.min(1, 0.3 + level * 1.4) : 0;
      energyVelocity += ((energyTarget - linkEnergy) * SPRING_STIFFNESS - energyVelocity * SPRING_DAMPING) * dt;
      linkEnergy = clamp(linkEnergy + energyVelocity * dt, 0, 1.2);

      const curves = buildCurves(points, t, linkEnergy);
      // In the middle of a shuffle the chain is "unlinked": it fades out and comes back in the new order
      ctx.globalAlpha = 1 - swirl;
      paintLinks(ctx, mode, points, curves, t, circular, linkEnergy);
      ctx.globalAlpha = 1;

      // Stars that left: they collapse, and the two neighbors they joined get welded to each other
      if (ghosts.length > 0) {
        ghosts = ghosts.filter((ghost) => clock - ghost.born < IMPLOSION_SECONDS);
        for (const ghost of ghosts) {
          const progress = (clock - ghost.born) / IMPLOSION_SECONDS;
          const leftIndex = ghost.leftUid ? order.indexByUid.get(ghost.leftUid) : undefined;
          const rightIndex = ghost.rightUid ? order.indexByUid.get(ghost.rightUid) : undefined;
          if (leftIndex !== undefined && rightIndex === leftIndex + 1) {
            paintWeld(ctx, points[leftIndex], curves[leftIndex], points[rightIndex], progress);
          }
          paintImplosion(ctx, ghost.genre, ghost, progress);
        }
      }

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
      if (!calm) {
        tracks.forEach((track, index) => {
          const particle = particles.get(track.uid);
          if (!particle || particle.born < mountedAt + 0.5) return;
          const age = clock - particle.born;
          if (age < SPAWN_RING_SECONDS) paintSpawnRing(ctx, track, points[index], age, SPAWN_RING_SECONDS);
        });
      }

      if (mode === "flow") paintFlowLabels(ctx, points);

      if (traversal && !calm) {
        const elapsed = clock - traversal.startedAt;
        const total = (points.length + 1.5) * TRAVERSAL_STEP_SECONDS;
        if (elapsed >= 0 && elapsed < total) paintTraversal(ctx, points, curves, elapsed, TRAVERSAL_STEP_SECONDS);
      }

      // A comet repeats how the cursor got to the new song: along the walk of the list when there
      // was one (from the head or from the tail), or straight over the single link of next / prev
      let launched = false;
      if (walk?.id !== walkSeen) {
        walkSeen = walk?.id;
        const fullWalk = traversal !== null && Math.abs(clock - traversal.startedAt) < 0.4;
        if (walk && !fullWalk && !calm) {
          const direction = walk.to >= walk.from ? 1 : -1;
          const uids: string[] = [];
          for (let index = walk.from; index !== walk.to + direction; index += direction) {
            if (tracks[index]) uids.push(tracks[index].uid);
          }
          if (uids.length > 1) {
            comet = { uids, step: Math.max(walk.stepMs / 1000, 0.06), startedAt: clock };
            launched = true;
          }
        }
      }
      if (currentUid !== currentSeen) {
        if (!launched && !calm && currentSeen && currentUid && order.indexByUid.has(currentSeen)) {
          comet = { uids: [currentSeen, currentUid], step: HOP_SECONDS, startedAt: clock };
        }
        currentSeen = currentUid;
      }

      if (ripples.length > 0 && currentTrack) {
        ripples = ripples.filter((born) => clock - born < RIPPLE_SECONDS);
        for (const born of ripples) paintRipple(ctx, currentTrack.genre, points[currentIndex], (clock - born) / RIPPLE_SECONDS, night);
      }

      if (currentTrack) {
        paintCurrent(ctx, currentTrack, points[currentIndex], freq, t, night);
        const cover = currentTrack.artworkUrl ? coverFor(currentTrack.artworkUrl) : null;
        if (cover) paintCover(ctx, cover, points[currentIndex]);
      }

      if (comet) {
        const path = comet.uids.map((uid) => order.indexByUid.get(uid) ?? -1);
        const end = path.length - 1;
        const elapsed = clock - comet.startedAt;
        const travel = end * comet.step;
        if (path.includes(-1) || elapsed > travel + ARRIVAL_SECONDS) {
          comet = null;
        } else {
          const first = path[0];
          const final = path[end];
          const lastIndex = tracks.length - 1;
          const forward = final === first + 1 || (end > 1 && final > first) || (circular && lastIndex > 1 && first === lastIndex && final === 0);
          const backward = final === first - 1 || (end > 1 && final < first) || (circular && lastIndex > 1 && first === 0 && final === lastIndex);
          const color = forward ? NEXT_COLOR : backward ? PREV_COLOR : JUMP_COLOR;
          const trail: { x: number; y: number }[] = [];
          for (let i = 0; i < COMET_TRAIL; i++) {
            const point = pathPoint(points, curves, path, (elapsed - i * COMET_TRAIL_SPACING_SECONDS) / comet.step);
            if (point) trail.push(point);
          }
          paintComet(ctx, trail, color, clamp(1 - (elapsed - travel) / 0.2, 0, 1));
          if (elapsed > travel) paintArrival(ctx, points[final], color, (elapsed - travel) / ARRIVAL_SECONDS);
        }
      }

      const focused = points[focusRef.current];
      if (focused) paintFocus(ctx, focused);

      // The current song stays clickable even when the filter hides its genre
      hitRef.current = points.map((point, index) => (visible[index] || index === currentIndex ? point : null));
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [zoomAt, clearHover]);

  /** Position inside the canvas of a point of the screen. */
  const localPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  };

  const findHit = (clientX: number, clientY: number): number => {
    const local = localPoint(clientX, clientY);
    const view = viewRef.current;
    const x = (local.x - view.x) / view.scale;
    const y = (local.y - view.y) / view.scale;
    let best = -1;
    let bestDistance = Infinity;
    hitRef.current.forEach((point, index) => {
      if (!point) return;
      const distance = Math.hypot(point.x - x, point.y - y);
      // The margin is measured on the screen, so a star is as easy to hit at any zoom
      if (distance < Math.max(point.r + 10 / view.scale, 16 / view.scale) && distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    return best;
  };

  const showStar = (index: number) => {
    if (index === hoverIndexRef.current) return;
    hoverIndexRef.current = index;
    const point = hitRef.current[index];
    const track = props.tracks[index];
    setHover(index >= 0 && point && track ? { index, uid: track.uid, x: point.x, y: point.y } : null);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const local = localPoint(event.clientX, event.clientY);
    // Captured: the drag keeps arriving even when the pointer leaves the canvas
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, local);
    // A second finger is a pinch, never a tap
    gestureRef.current = { moved: pointersRef.current.size > 1, startX: local.x, startY: local.y };
    focusRef.current = -1;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const local = localPoint(event.clientX, event.clientY);
    const { w, h } = sizeRef.current;
    if (w > 0 && h > 0) parallaxRef.current = { x: local.x / w - 0.5, y: local.y / h - 0.5 };

    const pointers = pointersRef.current;
    const previous = pointers.get(event.pointerId);
    if (previous) {
      const view = viewRef.current;
      const gesture = gestureRef.current;
      if (pointers.size === 1) {
        if (!gesture.moved && Math.hypot(local.x - gesture.startX, local.y - gesture.startY) > DRAG_THRESHOLD_PX) gesture.moved = true;
        if (gesture.moved) {
          view.x += local.x - previous.x;
          view.y += local.y - previous.y;
          resettingRef.current = false;
          syncZoomed();
        }
      } else if (pointers.size === 2) {
        // Pinch: the distance between the fingers zooms, their midpoint pans
        let other = local;
        pointers.forEach((point, id) => {
          if (id !== event.pointerId) other = point;
        });
        const before = Math.hypot(previous.x - other.x, previous.y - other.y);
        const after = Math.hypot(local.x - other.x, local.y - other.y);
        view.x += (local.x - previous.x) / 2;
        view.y += (local.y - previous.y) / 2;
        if (before > 0) zoomAt((local.x + other.x) / 2, (local.y + other.y) / 2, after / before);
      }
      pointers.set(event.pointerId, local);
      if (gesture.moved) {
        clearHover();
        return;
      }
    }
    showStar(findHit(event.clientX, event.clientY));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);
  };

  const handlePointerLeave = () => {
    parallaxRef.current = { x: 0, y: 0 };
    if (focusRef.current < 0) clearHover();
  };

  const handleClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (gestureRef.current.moved) return; // that was a drag, not a click
    const index = findHit(event.clientX, event.clientY);
    if (index >= 0) props.onSelect(index);
  };

  /** Keyboard: ↑ / ↓ walk the stars in list order, Enter travels to the chosen one, + / - / 0 zoom. */
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const hits = hitRef.current;
    /** First selectable star from `start` in the direction of `delta`, or -1. */
    const seek = (start: number, delta: number): number => {
      for (let index = start; index >= 0 && index < hits.length; index += delta) {
        if (hits[index]) return index;
      }
      return -1;
    };
    const focusStar = (index: number) => {
      focusRef.current = index;
      showStar(index);
    };

    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const edge = delta > 0 ? 0 : hits.length - 1;
        const found = seek(focusRef.current < 0 ? edge : focusRef.current + delta, delta);
        // Past the last star the walk starts over, like the circular list
        focusStar(found >= 0 ? found : seek(edge, delta));
        break;
      }
      case "Home":
        focusStar(seek(0, 1));
        break;
      case "End":
        focusStar(seek(hits.length - 1, -1));
        break;
      case "Enter":
        if (focusRef.current < 0) return;
        props.onSelect(focusRef.current);
        break;
      case "Escape":
        focusStar(-1);
        break;
      case "+":
      case "=":
        zoomCenter(1.25);
        break;
      case "-":
        zoomCenter(0.8);
        break;
      case "0":
        resetView();
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation(); // these keys are handled here: the app-wide shortcuts must not see them
  };

  const handleBlur = () => {
    if (focusRef.current < 0) return;
    focusRef.current = -1;
    clearHover();
  };

  // The list may change under the pointer: never describe a different song than the hovered one
  const hoveredTrack = hover ? props.tracks[hover.index] : undefined;
  const hovered = hoveredTrack?.uid === hover?.uid ? hoveredTrack : undefined;
  const view = viewRef.current;

  return (
    <div className="absolute inset-0">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        className={`h-full w-full touch-none outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/40 ${hover ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        aria-label="Universo musical: cada partícula es una canción. Flechas arriba y abajo para recorrer las estrellas, Enter para viajar a una, más y menos para acercar o alejar."
      />
      <p className="sr-only" aria-live="polite">
        {hover && hovered ? `${hovered.title}, de ${hovered.artist}. Posición ${hover.index + 1} de ${props.tracks.length}.` : ""}
      </p>

      <div
        className="glass absolute z-10 flex items-center gap-0.5 rounded-full p-0.5 text-xs text-white/70"
        style={{ left: props.insets.left + 8, bottom: props.insets.bottom + 8 }}
      >
        <button onClick={() => zoomCenter(0.8)} className="h-6 w-6 rounded-full transition hover:bg-white/10 hover:text-white" title="Alejar · tecla menos" aria-label="Alejar">
          −
        </button>
        <button onClick={() => zoomCenter(1.25)} className="h-6 w-6 rounded-full transition hover:bg-white/10 hover:text-white" title="Acercar · tecla más o la rueda del ratón" aria-label="Acercar">
          +
        </button>
        <AnimatePresence initial={false}>
          {zoomed && (
            <motion.button
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              onClick={resetView}
              className="h-6 overflow-hidden whitespace-nowrap rounded-full px-2 text-[11px] transition hover:bg-white/10 hover:text-white"
              title="Volver a la vista completa · tecla 0"
            >
              Restablecer vista
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {hover && hovered && (
          <motion.div
            key={hovered.uid}
            initial={{ opacity: 0, x: "-50%", y: 6, scale: 0.95 }}
            animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }}
            exit={{ opacity: 0, x: "-50%", scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="glass pointer-events-none absolute z-10 w-52 rounded-xl px-3 py-2 text-xs"
            style={{ left: hover.x * view.scale + view.x, top: hover.y * view.scale + view.y + 22 }}
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
