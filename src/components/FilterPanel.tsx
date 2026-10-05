"use client";

import { motion } from "framer-motion";
import type { Genre } from "@/types/music";
import { GENRES, GENRE_KEYS, genreColor } from "@/lib/genres";
import { DEFAULT_FILTER, TEMPO_LIMITS, isFilterActive, type SpatialFilter } from "@/lib/spatialFilter";

interface FilterPanelProps {
  filter: SpatialFilter;
  visibleCount: number;
  total: number;
  accent: string;
  onChange: (filter: SpatialFilter) => void;
}

/** Real-time spatial filter: genre chips plus energy and tempo ranges. */
export default function FilterPanel({ filter, visibleCount, total, accent, onChange }: FilterPanelProps) {
  const toggleGenre = (genre: Genre) => {
    const genres = filter.genres.includes(genre) ? filter.genres.filter((g) => g !== genre) : [...filter.genres, genre];
    onChange({ ...filter, genres });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Filtros del universo</h2>
          <p className="text-[11px] text-white/45">
            {visibleCount} de {total} {total === 1 ? "estrella visible" : "estrellas visibles"}
          </p>
        </div>
        {isFilterActive(filter) && (
          <button onClick={() => onChange(DEFAULT_FILTER)} className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/80 transition hover:bg-white/20">
            Limpiar
          </button>
        )}
      </div>

      <section>
        <p className="mb-2 text-[11px] uppercase tracking-widest text-white/40">Género</p>
        <div className="flex flex-wrap gap-1.5">
          {GENRE_KEYS.map((genre) => {
            const active = filter.genres.includes(genre);
            return (
              <motion.button
                key={genre}
                whileTap={{ scale: 0.92 }}
                onClick={() => toggleGenre(genre)}
                aria-pressed={active}
                className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition"
                style={{
                  borderColor: active ? genreColor(genre) : "rgba(255,255,255,0.1)",
                  background: active ? genreColor(genre, 0.18) : "transparent",
                  color: active ? "#fff" : "rgba(255,255,255,0.6)",
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: genreColor(genre) }} />
                {GENRES[genre].label}
              </motion.button>
            );
          })}
        </div>
        {filter.genres.length === 0 && <p className="mt-1.5 text-[10px] text-white/35">Sin selección se muestran todos los géneros</p>}
      </section>

      <RangeControl
        label="Energía"
        unit="%"
        min={0}
        max={100}
        step={5}
        value={[Math.round(filter.energy[0] * 100), Math.round(filter.energy[1] * 100)]}
        accent={accent}
        edges={["Calma", "Energía"]}
        onChange={([low, high]) => onChange({ ...filter, energy: [low / 100, high / 100] })}
      />

      <RangeControl
        label="Tempo"
        unit=" BPM"
        min={TEMPO_LIMITS[0]}
        max={TEMPO_LIMITS[1]}
        step={5}
        value={filter.tempo}
        accent={accent}
        edges={["Lento", "Rápido"]}
        onChange={(tempo) => onChange({ ...filter, tempo })}
      />
    </div>
  );
}

interface RangeControlProps {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: [number, number];
  accent: string;
  edges: [string, string];
  onChange: (value: [number, number]) => void;
}

function RangeControl({ label, unit, min, max, step, value, accent, edges, onChange }: RangeControlProps) {
  const [low, high] = value;
  const toPercent = (v: number) => ((v - min) / (max - min)) * 100;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between text-[11px]">
        <span className="uppercase tracking-widest text-white/40">{label}</span>
        <span className="text-white/70">
          {low}
          {unit} – {high}
          {unit}
        </span>
      </div>
      <div className="dual-range relative h-4">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
          style={{ left: `${toPercent(low)}%`, right: `${100 - toPercent(high)}%`, background: accent }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={low}
          // When both handles meet at the top, the low handle must stay on top to be draggable
          style={{ zIndex: low >= max - step ? 2 : undefined }}
          onChange={(event) => onChange([Math.min(Number(event.target.value), high), high])}
          aria-label={`${label} mínima`}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={high}
          onChange={(event) => onChange([low, Math.max(Number(event.target.value), low)])}
          aria-label={`${label} máxima`}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-white/35">
        <span>{edges[0]}</span>
        <span>{edges[1]}</span>
      </div>
    </section>
  );
}
