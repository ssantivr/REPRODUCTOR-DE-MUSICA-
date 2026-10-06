"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { comparePlays, type PlayCount } from "@/hooks/useLibrary";
import { Heap } from "@/lib/Heap";

interface HeapViewProps {
  plays: PlayCount[];
  accent: string;
}

const WIDTH = 380;
const ROW = 52;
const RADIUS = 14;
const TOP = 22;
/** Four levels fit in the panel; deeper nodes are only counted */
const MAX_DRAWN = 15;
const STEP_MS = 650;
const spring = { type: "spring" as const, stiffness: 240, damping: 24 };

/** One moment of an extraction: the array and the two positions that have just been exchanged. */
interface HeapFrame {
  items: PlayCount[];
  swapped: [number, number] | null;
  note: string;
}

/** Position on the drawing of the array index `i`: level = floor(log2(i + 1)). */
function spot(index: number) {
  const level = Math.floor(Math.log2(index + 1));
  const inLevel = index + 1 - 2 ** level;
  return { x: ((inLevel + 0.5) / 2 ** level) * WIDTH, y: TOP + level * ROW };
}

const short = (title: string) => (title.length > 9 ? `${title.slice(0, 8)}…` : title);

/**
 * The play counts as the binary heap behind the "Top" tab. "Sacar la más
 * escuchada" replays a pop step by step: the last value takes the root and
 * sinks while one of its children has more priority.
 */
export default function HeapView({ plays, accent }: HeapViewProps) {
  const initial = useMemo(() => new Heap(comparePlays, plays).toArray(), [plays]);
  const [frames, setFrames] = useState<HeapFrame[]>([]);
  const [step, setStep] = useState(0);
  const [taken, setTaken] = useState<PlayCount[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // New play counts: the drawing goes back to the real heap
  useEffect(() => {
    clearInterval(timer.current);
    setFrames([]);
    setStep(0);
    setTaken([]);
  }, [initial]);
  useEffect(() => () => clearInterval(timer.current), []);

  const frame = frames[step];
  const items = frame?.items ?? initial;
  const busy = frames.length > 0 && step < frames.length - 1;

  const extract = () => {
    if (items.length === 0 || busy) return;
    // The array is already a heap, so building one from it changes nothing
    const heap = new Heap(comparePlays, items);
    const script: HeapFrame[] = [];
    const working = items.slice();
    const top = working[0];
    const last = working.pop() as PlayCount;
    if (working.length > 0) {
      working[0] = last;
      script.push({ items: working.slice(), swapped: null, note: `Sale «${top.song.title}». La última, «${last.song.title}», sube a la raíz.` });
    } else {
      script.push({ items: [], swapped: null, note: `Sale «${top.song.title}»: el montículo queda vacío.` });
    }
    heap.onSwap = (a, b) => {
      [working[a], working[b]] = [working[b], working[a]];
      script.push({ items: working.slice(), swapped: [a, b], note: `«${working[b].song.title}» se hunde: su hija «${working[a].song.title}» tiene más prioridad.` });
    };
    heap.pop();
    script[script.length - 1].note += " Listo: la raíz vuelve a ser la más escuchada.";

    setTaken((current) => [...current, top]);
    setFrames(script);
    setStep(0);
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      setStep((current) => {
        if (current >= script.length - 1) {
          clearInterval(timer.current);
          return current;
        }
        return current + 1;
      });
    }, STEP_MS);
  };

  const reset = () => {
    clearInterval(timer.current);
    setFrames([]);
    setStep(0);
    setTaken([]);
  };

  const drawn = items.slice(0, MAX_DRAWN);
  const levels = drawn.length > 0 ? Math.floor(Math.log2(drawn.length)) + 1 : 0;
  const swapped = new Set(frame?.swapped ?? []);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5 text-[11px]">
        <button
          onClick={extract}
          disabled={items.length === 0 || busy}
          className="rounded-lg px-2.5 py-1 font-medium text-[#05030f] transition hover:brightness-110 disabled:opacity-40"
          style={{ background: accent }}
        >
          Sacar la más escuchada
        </button>
        <button onClick={reset} disabled={frames.length === 0} className="rounded-lg bg-white/10 px-2.5 py-1 text-white/80 transition hover:bg-white/20 disabled:opacity-35">
          Reiniciar
        </button>
        <span className="ml-auto text-white/40">
          {items.length} {items.length === 1 ? "canción" : "canciones"}
        </span>
      </div>

      <div className="rounded-xl border border-white/5 bg-black/20">
        {drawn.length === 0 ? (
          <p className="py-8 text-center text-xs text-white/40">
            {taken.length > 0 ? "Sacaste todas: pulsa Reiniciar para volver al montículo real." : "Escucha canciones para llenar el montículo."}
          </p>
        ) : (
          <svg viewBox={`0 0 ${WIDTH} ${TOP + (levels - 1) * ROW + 30}`} className="block w-full" role="img" aria-label={`Montículo con ${items.length} canciones`}>
            <AnimatePresence initial={false}>
              {drawn.map((entry, index) => {
                if (index === 0) return null;
                const from = spot((index - 1) >> 1);
                const to = spot(index);
                // Keyed by position: the tree keeps its shape while the songs move through it
                return <line key={`edge-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="rgb(var(--ink) / 0.2)" strokeWidth={1} />;
              })}
              {drawn.map((entry, index) => {
                const { x, y } = spot(index);
                const lit = swapped.has(index);
                return (
                  <motion.g
                    key={entry.song.id}
                    initial={{ x, y, opacity: 0, scale: 0.3 }}
                    animate={{ x, y, opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, y: y - 26, scale: 0.4 }}
                    transition={spring}
                  >
                    <circle r={RADIUS} fill={index === 0 ? `${accent}40` : "rgb(var(--surface))"} stroke={lit || index === 0 ? accent : "rgb(var(--ink) / 0.35)"} strokeWidth={lit ? 2 : 1.2} />
                    <text textAnchor="middle" y={3.5} fontSize={10} fill="rgb(var(--ink))" className="font-mono">
                      {entry.plays}
                    </text>
                    <text textAnchor="middle" y={RADIUS + 10} fontSize={8} fill="rgb(var(--ink) / 0.5)">
                      {short(entry.song.title)}
                    </text>
                  </motion.g>
                );
              })}
            </AnimatePresence>
          </svg>
        )}
      </div>

      {/* The same heap as the array it really is */}
      {drawn.length > 0 && (
        <div className="scroll-thin flex gap-0.5 overflow-x-auto pb-1 font-mono text-[10px]">
          {drawn.map((entry, index) => (
            <motion.span
              key={entry.song.id}
              layout
              transition={spring}
              className="flex w-6 shrink-0 flex-col items-center rounded border py-0.5"
              style={{ borderColor: swapped.has(index) ? accent : "rgb(var(--ink) / 0.1)", color: index === 0 ? accent : "rgb(var(--ink) / 0.75)" }}
            >
              {entry.plays}
              <span className="text-[8px] text-white/30">{index}</span>
            </motion.span>
          ))}
          {items.length > MAX_DRAWN && <span className="self-center whitespace-nowrap pl-1 font-sans text-white/35">y {items.length - MAX_DRAWN} más</span>}
        </div>
      )}

      <p className="min-h-[2rem] text-[11px] text-white/60" aria-live="polite">
        {frame?.note ?? "Dentro de cada círculo, las veces que sonó la canción. La raíz siempre es la más escuchada."}
      </p>
      {taken.length > 0 && (
        <p className="text-[11px] text-white/45">
          Salieron en orden: {taken.map((entry, index) => `${index + 1}. ${entry.song.title} (${entry.plays})`).join(" · ")}
        </p>
      )}
      <p className="text-[10px] leading-relaxed text-white/35">
        Es un arreglo: las hijas de la posición i están en 2i + 1 y 2i + 2. Sacar la raíz solo recorre un camino hacia abajo, por eso el «Top» no
        necesita ordenar todas las canciones. Esto es una copia: tus conteos no cambian.
      </p>
    </div>
  );
}
