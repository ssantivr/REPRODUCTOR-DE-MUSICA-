"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { insertSteps, moveSteps, removeSteps, type PointerFrame, type PointerNode } from "@/lib/pointerSteps";
import type { Track } from "@/types/music";

interface PointerLabProps {
  tracks: Track[];
  accent: string;
}

type Operation = "insert" | "remove" | "move";

const OPERATIONS: [Operation, string][] = [
  ["insert", "Insertar"],
  ["remove", "Quitar"],
  ["move", "Mover"],
];
const FALLBACK_LABELS = ["Sol", "Luna", "Vega", "Rigel", "Altair"];
const SAMPLE_SIZE = 5;
const NEW_LABEL = "Nueva";
const AUTOPLAY_MS = 1700;

const WIDTH = 400;
const HEIGHT = 190;
const ROW_Y = 62;
const LIFTED_Y = 142;
const RADIUS = 15;
const NEXT_COLOR = "#22d3ee";
const PREV_COLOR = "#e879f9";
const spring = { type: "spring" as const, stiffness: 260, damping: 26 };

const short = (title: string) => (title.length > 8 ? `${title.slice(0, 7)}…` : title);

interface Spot {
  x: number;
  y: number;
  slot: number;
}

function spots(frame: PointerFrame): Map<string, Spot> {
  const slotWidth = WIDTH / Math.max(frame.nodes.length, 1);
  return new Map(frame.nodes.map((node, slot) => [node.id, { x: slotWidth * (slot + 0.5), y: node.id === frame.lifted ? LIFTED_Y : ROW_Y, slot }]));
}

/**
 * Path of a pointer drawn from `a` to `b`, always "M … Q …" so it can morph
 * between steps. It leaves and arrives on the edge of the circles, a little to
 * one side (so `next` and `prev` of the same pair do not overlap), and arcs
 * over the stars it skips.
 */
function arrowPath(a: Spot, b: Spot): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  // Left-hand normal: `next` (left → right) runs above the row and `prev` below it
  const nx = uy;
  const ny = -ux;
  const startX = a.x + ux * (RADIUS + 2) + nx * 5;
  const startY = a.y + uy * (RADIUS + 2) + ny * 5;
  const endX = b.x - ux * (RADIUS + 6) + nx * 5;
  const endY = b.y - uy * (RADIUS + 6) + ny * 5;
  const bow = a.y === b.y && Math.abs(a.slot - b.slot) > 1 ? 30 : 0;
  const controlX = (startX + endX) / 2 + nx * bow;
  const controlY = (startY + endY) / 2 + ny * bow;
  return `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;
}

/**
 * Step-by-step view of insertAt, removeAt and move on a copy of the first
 * stars of the constellation: one pointer changes per step.
 */
export default function PointerLab({ tracks, accent }: PointerLabProps) {
  const labels = useMemo(() => {
    const titles = tracks.slice(0, SAMPLE_SIZE).map((track) => short(track.title));
    return titles.length >= 3 ? titles : FALLBACK_LABELS;
  }, [tracks]);
  const count = labels.length;

  const [operation, setOperation] = useState<Operation>("insert");
  const [first, setFirst] = useState(2);
  const [second, setSecond] = useState(count - 1);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Insert accepts one position more than the list has: "after the last one"
  const firstMax = operation === "insert" ? count : count - 1;
  const from = Math.min(first, firstMax);
  const to = Math.min(second, count - 1);

  const frames = useMemo(() => {
    if (operation === "insert") return insertSteps(labels, from, NEW_LABEL);
    if (operation === "remove") return removeSteps(labels, from);
    return moveSteps(labels, from, to);
  }, [operation, labels, from, to]);

  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [frames]);

  const lastStep = frames.length - 1;
  useEffect(() => {
    if (!playing) return;
    if (step >= lastStep) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setStep((current) => current + 1), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [playing, step, lastStep]);

  const frame = frames[Math.min(step, lastStep)];
  const at = spots(frame);
  const changed = new Set(frame.changed);

  const pointer = (node: PointerNode, kind: "next" | "prev") => {
    const target = node[kind];
    const start = at.get(node.id);
    const end = target ? at.get(target) : undefined;
    if (!start || !end) return null;
    const id = `${node.id}:${kind}`;
    const lit = changed.has(id);
    const color = kind === "next" ? NEXT_COLOR : PREV_COLOR;
    const d = arrowPath(start, end);
    return (
      <motion.path
        key={id}
        fill="none"
        stroke={color}
        markerEnd={`url(#tip-${kind})`}
        initial={{ d, opacity: 0, pathLength: 0 }}
        animate={{ d, opacity: lit ? 1 : 0.45, pathLength: 1, strokeWidth: lit ? 2.6 : 1.2 }}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
        transition={{ ...spring, pathLength: { duration: 0.5 } }}
        style={lit ? { filter: `drop-shadow(0 0 4px ${color})` } : undefined}
      />
    );
  };

  /** "INICIO" / "FINAL" tag over the node the list's head / tail points to. */
  const marker = (kind: "head" | "tail") => {
    const spot = at.get(frame[kind] ?? "");
    if (!spot) return null;
    const color = kind === "head" ? NEXT_COLOR : PREV_COLOR;
    // When one star is both ends, the two tags stack instead of overlapping
    const lift = kind === "tail" && frame.head === frame.tail ? 12 : 0;
    return (
      <motion.g key={kind} initial={{ x: spot.x, y: spot.y - 30 - lift, opacity: 0 }} animate={{ x: spot.x, y: spot.y - 30 - lift, opacity: 1 }} exit={{ opacity: 0 }} transition={spring}>
        <text textAnchor="middle" fontSize={9} fontWeight={600} fill={color} style={changed.has(kind) ? { filter: `drop-shadow(0 0 4px ${color})` } : undefined}>
          {kind === "head" ? "INICIO" : "FINAL"}
          {changed.has(kind) ? " ●" : ""}
        </text>
      </motion.g>
    );
  };

  const positions = (max: number) => Array.from({ length: max + 1 }, (_, index) => index);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <div className="flex rounded-full bg-white/5 p-0.5">
          {OPERATIONS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setOperation(id)}
              aria-pressed={operation === id}
              className="rounded-full px-2.5 py-1 transition"
              style={operation === id ? { background: accent, color: "#05030f" } : { color: "rgba(255,255,255,0.6)" }}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-white/55">
          {operation === "move" ? "de la" : "posición"}
          <PositionSelect value={from} options={positions(firstMax)} onChange={setFirst} />
        </label>
        {operation === "move" && (
          <label className="flex items-center gap-1 text-white/55">
            a la
            <PositionSelect value={to} options={positions(count - 1)} onChange={setSecond} />
          </label>
        )}
      </div>

      <div className="rounded-xl border border-white/5 bg-black/20">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block w-full" role="img" aria-label="Estrellas de la lista con sus punteros">
          <defs>
            {(
              [
                ["next", NEXT_COLOR],
                ["prev", PREV_COLOR],
              ] as const
            ).map(([kind, color]) => (
              <marker key={kind} id={`tip-${kind}`} viewBox="0 0 8 8" refX={4} refY={4} markerWidth={7} markerHeight={7} markerUnits="userSpaceOnUse" orient="auto">
                <path d="M 0 0 L 8 4 L 0 8 z" fill={color} />
              </marker>
            ))}
          </defs>
          <AnimatePresence initial={false}>
            {frame.nodes.map((node) => pointer(node, "next"))}
            {frame.nodes.map((node) => pointer(node, "prev"))}
            {marker("head")}
            {marker("tail")}
            {frame.nodes.map((node) => {
              const spot = at.get(node.id) as Spot;
              const focused = node.id === frame.focus;
              return (
                <motion.g
                  key={node.id}
                  initial={{ x: spot.x, y: spot.y, opacity: 0, scale: 0.3 }}
                  animate={{ x: spot.x, y: spot.y, opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, y: spot.y + 24, scale: 0.4 }}
                  transition={spring}
                >
                  <circle r={RADIUS} fill={focused ? `${accent}40` : "#0a0818"} stroke={focused ? accent : "rgba(255,255,255,0.4)"} strokeWidth={focused ? 2 : 1.2} />
                  <text textAnchor="middle" y={RADIUS + 12} fontSize={9} fill={focused ? "#fff" : "rgba(255,255,255,0.6)"}>
                    {node.label}
                  </text>
                </motion.g>
              );
            })}
          </AnimatePresence>
        </svg>
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={`${operation}-${from}-${to}-${step}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="min-h-[2.75rem] text-xs text-white/85"
          aria-live="polite"
        >
          {frame.note}
        </motion.p>
      </AnimatePresence>

      <div className="flex items-center gap-1.5 text-[11px]">
        <StepButton onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}>
          ← Paso
        </StepButton>
        <StepButton onClick={() => setStep((current) => Math.min(lastStep, current + 1))} disabled={step >= lastStep}>
          Paso →
        </StepButton>
        <button
          onClick={() => {
            if (step >= lastStep) setStep(0);
            setPlaying((value) => !value);
          }}
          className="rounded-lg px-2.5 py-1 font-medium text-[#05030f] transition hover:brightness-110"
          style={{ background: accent }}
        >
          {playing ? "Pausar" : step >= lastStep ? "Repetir" : "Reproducir"}
        </button>
        <span className="ml-auto font-mono text-white/45">
          paso {Math.min(step, lastStep) + 1} de {frames.length}
        </span>
      </div>
      <p className="text-[10px] leading-relaxed text-white/35">
        Una copia de tus primeras estrellas, sin el enlace circular para que se vean los extremos. Cian: puntero «siguiente». Magenta: puntero
        «anterior». En cada paso cambia un puntero, en el mismo orden en que lo hace la lista real.
      </p>
    </div>
  );
}

function PositionSelect({ value, options, onChange }: { value: number; options: number[]; onChange: (value: number) => void }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="rounded-lg border border-white/10 bg-black/30 px-1.5 py-1 text-white focus:border-white/30 focus:outline-none"
    >
      {options.map((index) => (
        <option key={index} value={index} className="bg-[#0a0818]">
          {index + 1}
        </option>
      ))}
    </select>
  );
}

function StepButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="rounded-lg bg-white/10 px-2.5 py-1 text-white/80 transition hover:bg-white/20 disabled:opacity-35">
      {children}
    </button>
  );
}
