"use client";

import { useState } from "react";
import { LayoutGroup, motion } from "framer-motion";
import type { HashTable } from "@/lib/HashTable";
import type { Track } from "@/types/music";

interface HashViewProps {
  /** The table that takes a song to its node of the list */
  table: HashTable<unknown>;
  tracks: Track[];
  accent: string;
}

const LOAD_LIMIT = 0.75;
const spring = { type: "spring" as const, stiffness: 300, damping: 30 };

/**
 * The buckets of the hash table and the chain of keys inside each one.
 * Picking a song shows the bucket its key falls into; when the table doubles,
 * every key flies to its new bucket.
 */
export default function HashView({ table, tracks, accent }: HashViewProps) {
  const [probe, setProbe] = useState("");
  // The table is mutable: every render reads its current buckets
  const buckets = table.snapshot();
  const titles = new Map(tracks.map((track) => [track.uid, track.title]));
  const probed = probe && titles.has(probe) ? table.bucketIndex(probe) : -1;
  const lit = probed >= 0 ? probed : table.lastBucket;
  const load = buckets.length > 0 ? table.size / buckets.length : 0;
  const longest = buckets.reduce((max, bucket) => Math.max(max, bucket.length), 0);
  const empty = buckets.filter((bucket) => bucket.length === 0).length;

  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex items-center gap-2 text-[11px] text-white/55">
        <span className="shrink-0">Buscar la casilla de</span>
        <select
          value={probe}
          onChange={(event) => setProbe(event.target.value)}
          className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-white focus:border-white/30 focus:outline-none"
        >
          <option value="" className="bg-[#0a0818]">
            (última casilla consultada)
          </option>
          {tracks.map((track, index) => (
            <option key={track.uid} value={track.uid} className="bg-[#0a0818]">
              {index + 1}. {track.title}
            </option>
          ))}
        </select>
      </label>

      <div>
        <div className="flex justify-between text-[10px] text-white/45">
          <span>
            {table.size} {table.size === 1 ? "clave" : "claves"} en {buckets.length} casillas
          </span>
          <span>ocupación {Math.round(load * 100)} % · se duplica al pasar de 75 %</span>
        </div>
        <div className="relative mt-1 h-1 overflow-hidden rounded-full bg-white/10">
          <motion.div className="h-full rounded-full" style={{ background: accent }} animate={{ width: `${Math.min(load, 1) * 100}%` }} transition={spring} />
          <span className="absolute inset-y-0 w-px bg-white/60" style={{ left: `${LOAD_LIMIT * 100}%` }} aria-hidden />
        </div>
      </div>

      {table.resizes > 0 && (
        // The bucket count is the key: the notice flashes again every time the table doubles
        <motion.p
          key={buckets.length}
          initial={{ opacity: 0, scale: 0.96, backgroundColor: `${accent}55` }}
          animate={{ opacity: 1, scale: 1, backgroundColor: `${accent}14` }}
          transition={{ duration: 0.9 }}
          className="rounded-lg px-2 py-1 text-[11px] text-white/80"
        >
          La tabla se duplicó {table.resizes === 1 ? "una vez" : `${table.resizes} veces`}: ahora tiene {buckets.length} casillas y cada clave se
          repartió de nuevo.
        </motion.p>
      )}

      <LayoutGroup>
        <ol className="scroll-thin grid max-h-64 grid-cols-2 gap-x-2 gap-y-0.5 overflow-y-auto pr-1 text-[10px]">
          {buckets.map((bucket, index) => (
            <li
              key={index}
              className="flex min-h-[1.375rem] items-center gap-1 rounded-md px-1 transition-colors"
              style={{ background: index === lit ? `${accent}22` : undefined, boxShadow: index === lit ? `inset 0 0 0 1px ${accent}` : undefined }}
            >
              <span className="w-5 shrink-0 text-right font-mono text-white/35">{index}</span>
              <span className="flex min-w-0 flex-1 flex-wrap gap-0.5 py-0.5">
                {bucket.map((uid) => (
                  <motion.span
                    key={uid}
                    layoutId={`hash-${uid}`}
                    transition={spring}
                    title={titles.get(uid) ?? uid}
                    className="max-w-[5.5rem] truncate rounded px-1"
                    style={uid === probe ? { background: accent, color: "#05030f" } : { background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }}
                  >
                    {titles.get(uid) ?? "…"}
                  </motion.span>
                ))}
              </span>
            </li>
          ))}
        </ol>
      </LayoutGroup>

      <p className="text-[11px] text-white/60" aria-live="polite">
        {probed >= 0
          ? `«${titles.get(probe)}» cae en la casilla ${probed} de ${buckets.length}: se llega con una sola cuenta y se revisa una cadena de ${buckets[probed].length}.`
          : lit >= 0
            ? `La última consulta de la app fue a la casilla ${lit}.`
            : "Elige una canción para ver en qué casilla cae."}
      </p>
      <p className="text-[10px] leading-relaxed text-white/35">
        La clave de cada canción se convierte en un número y su resto al dividir entre {buckets.length} decide la casilla. Dos claves en la misma
        casilla forman una cadena: la más larga ahora mide {longest} y hay {empty} casillas vacías.
      </p>
    </div>
  );
}
