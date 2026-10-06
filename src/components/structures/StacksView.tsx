"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import type { StepLabel } from "@/hooks/usePlaylist";
import { RedoIcon, UndoIcon } from "../icons";

interface StacksViewProps {
  /** Top first */
  undoSteps: StepLabel[];
  redoSteps: StepLabel[];
  accent: string;
  onUndo: () => void;
  onRedo: () => void;
}

const spring = { type: "spring" as const, stiffness: 320, damping: 30 };
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The two stacks behind undo and redo: a step leaves the top of one and lands on top of the other. */
export default function StacksView({ undoSteps, redoSteps, accent, onUndo, onRedo }: StacksViewProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <LayoutGroup>
        <div className="grid grid-cols-2 gap-2">
          <StackColumn title="Deshacer" steps={undoSteps} accent={accent} empty="Aún no has cambiado la constelación.">
            <button
              onClick={onUndo}
              disabled={undoSteps.length === 0}
              className="flex w-full items-center justify-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[11px] text-white/85 transition hover:bg-white/20 disabled:opacity-35"
              title="Ctrl+Z"
            >
              <UndoIcon width={12} height={12} /> Sacar la cima
            </button>
          </StackColumn>
          <StackColumn title="Rehacer" steps={redoSteps} accent={accent} empty="Se llena al deshacer.">
            <button
              onClick={onRedo}
              disabled={redoSteps.length === 0}
              className="flex w-full items-center justify-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[11px] text-white/85 transition hover:bg-white/20 disabled:opacity-35"
              title="Ctrl+Y"
            >
              <RedoIcon width={12} height={12} /> Sacar la cima
            </button>
          </StackColumn>
        </div>
      </LayoutGroup>
      <p className="text-[10px] leading-relaxed text-white/35">
        Cada cambio (agregar, quitar, mover, mezclar, importar) deja en la pila de la izquierda cómo deshacerse. Deshacer saca la cima, la aplica y
        deja su contrario en la otra pila; un cambio nuevo vacía «Rehacer». Solo se entra y se sale por arriba, y se guardan hasta 30 pasos.
      </p>
    </div>
  );
}

function StackColumn({ title, steps, accent, empty, children }: { title: string; steps: StepLabel[]; accent: string; empty: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <h3 className="flex justify-between text-[10px] uppercase tracking-widest text-white/40">
        {title}
        <span className="font-mono">{steps.length}</span>
      </h3>
      {children}
      <ol className="scroll-thin flex max-h-56 min-h-[5rem] flex-col gap-1 overflow-y-auto rounded-xl border border-white/5 bg-black/20 p-1.5">
        <AnimatePresence initial={false}>
          {steps.map((step, depth) => (
            <motion.li
              key={step.id}
              layoutId={`step-${step.id}`}
              initial={{ opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={spring}
              className="rounded-lg border px-2 py-1 text-[11px]"
              style={{
                borderColor: depth === 0 ? accent : "rgb(var(--ink) / 0.08)",
                background: depth === 0 ? `${accent}1f` : "rgb(var(--ink) / 0.03)",
                color: depth === 0 ? "rgb(var(--ink))" : "rgb(var(--ink) / 0.6)",
              }}
            >
              <span className="block truncate">{capitalize(step.label)}</span>
              {depth === 0 && <span className="text-[9px] uppercase tracking-wide text-white/45">cima</span>}
            </motion.li>
          ))}
        </AnimatePresence>
        {steps.length === 0 && <li className="m-auto px-2 text-center text-[11px] text-white/35">{empty}</li>}
      </ol>
    </section>
  );
}
