"use client";

import { useReducer, useState } from "react";
import { motion } from "framer-motion";
import { MEASURED_OPERATIONS, THEORETICAL_COMPLEXITY, type ListMetrics, type MeasuredOperation } from "@/lib/ListMetrics";
import { runStressTest, type StressReport } from "@/lib/stressTest";

interface DiagnosticsPanelProps {
  metrics: ListMetrics;
  /** Current playlist length */
  size: number;
  accent: string;
}

const STRESS_SIZE = 500;

const OPERATION_LABEL: Record<MeasuredOperation, string> = {
  append: "Agregar al final",
  removeAt: "Quitar",
  traverseToIndex: "Viajar a posición",
  shuffle: "Mezclar",
};

/** Browsers round their clock, so very fast operations read as zero. */
const formatMs = (ms: number) => (ms < 0.001 ? "<0,001" : ms.toFixed(3).replace(".", ","));

/**
 * Live diagnostics of the doubly linked list: calls, theoretical complexity and
 * measured time per operation, plus an on-demand stress test.
 * The parent re-renders after every list operation, which keeps the table fresh.
 */
export default function DiagnosticsPanel({ metrics, size, accent }: DiagnosticsPanelProps) {
  const [report, setReport] = useState<StressReport | null>(null);
  // Counts the runs so every new report replays its entrance
  const [run, setRun] = useState(0);
  const [, refresh] = useReducer((tick: number) => tick + 1, 0);

  const reset = () => {
    metrics.reset();
    setReport(null);
    refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between pr-6">
        <div>
          <h2 className="text-sm font-semibold text-white">Diagnóstico de la lista</h2>
          <p className="text-[11px] text-white/45">
            {size} {size === 1 ? "estrella" : "estrellas"} · {metrics.totalCalls} operaciones medidas
          </p>
        </div>
        <button onClick={reset} className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/80 transition hover:bg-white/20">
          Reiniciar
        </button>
      </div>

      <table className="w-full text-left text-[11px]">
        <thead className="text-[10px] uppercase tracking-widest text-white/40">
          <tr>
            <th className="pb-1.5 font-normal">Operación</th>
            <th className="pb-1.5 font-normal">Costo</th>
            <th className="pb-1.5 text-right font-normal">Veces</th>
            <th className="pb-1.5 text-right font-normal">Última</th>
            <th className="pb-1.5 text-right font-normal">Media</th>
          </tr>
        </thead>
        <tbody className="font-mono text-white/75">
          {MEASURED_OPERATIONS.map((operation) => {
            const stats = metrics.get(operation);
            return (
              <tr key={operation} className="border-t border-white/5">
                <td className="py-1.5 font-sans text-white">{OPERATION_LABEL[operation]}</td>
                <td className="py-1.5 text-cyan-300">{THEORETICAL_COMPLEXITY[operation]}</td>
                <td className="py-1.5 text-right">
                  {/* A new key per count: the number flashes every time the operation runs */}
                  <motion.span
                    key={stats.calls}
                    className="inline-block"
                    initial={{ y: -4, color: accent }}
                    animate={{ y: 0, color: "rgba(255,255,255,0.75)" }}
                    transition={{ duration: 0.45 }}
                  >
                    {stats.calls}
                  </motion.span>
                </td>
                <td className="py-1.5 text-right">{stats.calls > 0 ? formatMs(stats.lastMs) : "—"}</td>
                <td className="py-1.5 text-right">{stats.calls > 0 ? formatMs(stats.totalMs / stats.calls) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-white/35">Tiempos en milisegundos. «Quitar» incluye el viaje hasta la posición.</p>

      <button
        onClick={() => {
          setReport(runStressTest(STRESS_SIZE, metrics));
          setRun((count) => count + 1);
        }}
        className="rounded-lg px-2 py-1.5 text-[11px] font-medium text-[#05030f] transition hover:brightness-110"
        style={{ background: accent }}
      >
        Prueba de estrés: {STRESS_SIZE} estrellas
      </button>

      {report && (
        <motion.div
          key={run}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="rounded-xl border border-white/5 bg-white/[0.03] p-2.5 text-[11px]"
        >
          <p className={report.pointersOk ? "text-cyan-300" : "text-fuchsia-300"}>
            {report.pointersOk ? "Enlaces intactos en ambos sentidos" : "Se encontraron enlaces rotos"}
          </p>
          <ul className="mt-1.5 space-y-1 text-white/60">
            {(
              [
                [`Insertar ${report.size}`, report.appendMs],
                ["Mezclar", report.shuffleMs],
                ["Recorrer completa", report.traverseMs],
                [`Quitar ${report.removed} al azar`, report.removeMs],
                ["Total", report.totalMs],
              ] as const
            ).map(([label, ms], order) => (
              <StressRow key={label} label={label} ms={ms} share={report.totalMs > 0 ? ms / report.totalMs : 0} order={order} accent={accent} />
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-white/35">
            Se ejecuta sobre una lista aparte: tu constelación no cambia. Quedaron {report.remaining} estrellas.
          </p>
        </motion.div>
      )}
    </div>
  );
}

/** One phase of the stress test; the bar is its share of the total time. */
function StressRow({ label, ms, share, order, accent }: { label: string; ms: number; share: number; order: number; accent: string }) {
  const delay = order * 0.07;
  return (
    <motion.li initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay, duration: 0.2 }}>
      <div className="flex justify-between">
        <span>{label}</span>
        <span className="font-mono text-white/75">{formatMs(ms)} ms</span>
      </div>
      <div className="mt-0.5 h-0.5 overflow-hidden rounded-full bg-white/5">
        <motion.div
          className="h-full rounded-full"
          style={{ background: accent }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(share, 1) * 100}%` }}
          transition={{ delay: delay + 0.1, duration: 0.5, ease: "easeOut" }}
        />
      </div>
    </motion.li>
  );
}
