"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { HitOrigin, InsertOperation, SearchHit, SearchResponse } from "@/types/music";
import { CATALOG } from "@/lib/catalog";
import { GENRES, genreColor } from "@/lib/genres";
import { SuggestionIndex, type Suggestion } from "@/lib/search/suggestions";
import type { TrieStep } from "@/lib/Trie";
import { PlayIcon, SearchIcon } from "./icons";

interface SearchPanelProps {
  currentIndex: number;
  length: number;
  accent: string;
  onAdd: (hit: SearchHit, operation: InsertOperation, index?: number) => Promise<void>;
  onPlayNow: (hit: SearchHit) => Promise<void>;
}

const DEBOUNCE_MS = 450;

const ORIGIN_BADGE: Record<HitOrigin, { label: string; className: string }> = {
  local: { label: "Catálogo", className: "bg-white/10 text-white/60" },
  global: { label: "Global", className: "bg-sky-500/15 text-sky-300" },
  spotify: { label: "Spotify", className: "bg-green-500/15 text-green-300" },
  simulated: { label: "Simulado", className: "bg-amber-400/15 text-amber-300" },
};

function describe(response: SearchResponse): string {
  if (response.source === "local") return "Encontrado en tu catálogo";
  if (response.source === "simulated") return "Sin conexión con los servicios: datos simulados";
  const platforms = response.providers.spotify ? "YouTube y Spotify" : "YouTube";
  return `Canciones nuevas: traen su audio y carátula, y al agregarlas se conectan con ${platforms}`;
}

export default function SearchPanel({ currentIndex, length, accent, onAdd, onPlayNow }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positionInput, setPositionInput] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Autocomplete (trie): starts with the catalog and learns every real song the search brings
  const suggestionsRef = useRef<SuggestionIndex | null>(null);
  suggestionsRef.current ??= new SuggestionIndex(CATALOG);
  const suggestionIndex = suggestionsRef.current;
  const [suggesting, setSuggesting] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [learned, setLearned] = useState(0);

  // Debounced search; the previous request is aborted while the user keeps typing
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setResponse((await res.json()) as SearchResponse);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError("No se pudo completar la búsqueda. Intenta de nuevo.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    for (const hit of response?.hits ?? []) {
      if (hit.origin !== "simulated") suggestionIndex.add(hit.song);
    }
    setLearned(suggestionIndex.size);
  }, [response, suggestionIndex]);

  const suggestions = useMemo(() => {
    void learned; // the index is mutable: `learned` signals that it grew
    return suggesting ? suggestionIndex.suggest(query) : [];
  }, [suggestionIndex, suggesting, query, learned]);

  // How the trie reads what is being typed: one node per character
  const trail = useMemo(() => {
    void learned;
    return suggestionIndex.trace(query);
  }, [suggestionIndex, query, learned]);

  const choose = (suggestion: Suggestion) => {
    setQuery(suggestion.text);
    setSuggesting(false);
    setHighlighted(-1);
  };

  const handleQueryKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      // -1 is "nothing highlighted": the arrows go through it when they wrap around
      setHighlighted((current) => ((current + 1 + step + suggestions.length + 1) % (suggestions.length + 1)) - 1);
    } else if (event.key === "Enter" && highlighted >= 0) {
      event.preventDefault();
      choose(suggestions[highlighted]);
    } else if (event.key === "Escape") {
      setSuggesting(false);
      setHighlighted(-1);
    }
  };

  // Positions are 1-based in the interface and 0-based in the list
  const suggestedPosition = currentIndex + 2;
  const parsedPosition = Number.parseInt(positionInput, 10);
  const position = Number.isNaN(parsedPosition) ? suggestedPosition : Math.max(1, Math.min(parsedPosition, length + 1));
  const hits = response?.hits ?? [];

  const run = async (hit: SearchHit, action: () => Promise<void>) => {
    if (pendingId) return;
    setPendingId(hit.song.id);
    try {
      await action();
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-white">Explorar el cosmos</h2>
        <p className="text-[11px] text-white/45">Busca cualquier canción: si no está en tu catálogo, la traemos del mundo</p>
      </div>

      <div className="relative">
        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 focus-within:border-white/30">
          <SearchIcon className="shrink-0 text-white/50" width={16} height={16} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSuggesting(true);
              setHighlighted(-1);
            }}
            onFocus={() => setSuggesting(true)}
            onBlur={() => setSuggesting(false)}
            onKeyDown={handleQueryKey}
            placeholder="Canción, artista, género o año…"
            className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
            aria-label="Buscar canciones"
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls="search-suggestions"
            aria-autocomplete="list"
            autoComplete="off"
          />
          {loading && <LoadingDots color={accent} />}
        </label>
        <AnimatePresence>
          {suggestions.length > 0 && (
            <motion.ul
              id="search-suggestions"
              role="listbox"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-white/10 bg-[#0a0818] py-1 shadow-xl shadow-black/50"
            >
              {suggestions.map((suggestion, index) => (
                <li
                  key={`${suggestion.kind}-${suggestion.text}`}
                  role="option"
                  aria-selected={index === highlighted}
                  // mousedown, not click: it runs before the input loses the focus and closes the list
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(suggestion);
                  }}
                  onMouseEnter={() => setHighlighted(index)}
                  className="flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-xs"
                  style={{ background: index === highlighted ? `${accent}26` : undefined }}
                >
                  <span className="truncate text-white">{suggestion.text}</span>
                  <span className="shrink-0 truncate text-[10px] text-white/40">{suggestion.kind === "artist" ? "Artista" : suggestion.detail}</span>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      {trail.length > 0 && <TrieTrail trail={trail} accent={accent} />}

      <label className="flex items-center justify-between gap-2 text-[11px] text-white/55">
        <span>Posición para insertar</span>
        <input
          type="number"
          min={1}
          max={length + 1}
          value={positionInput}
          placeholder={String(suggestedPosition)}
          onChange={(event) => setPositionInput(event.target.value)}
          className="w-16 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-right text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none"
        />
      </label>

      {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}
      {response && query.trim() && !loading && <p className="text-[11px] text-white/45">{describe(response)}</p>}

      <ul className="scroll-thin -mr-2 flex-1 space-y-2 overflow-y-auto pr-2">
        <AnimatePresence initial={false}>
          {hits.map((hit, i) => {
            const { song } = hit;
            const badge = ORIGIN_BADGE[hit.origin];
            const pending = pendingId === song.id;
            const disabled = pendingId !== null;
            return (
              <motion.li
                key={song.id}
                layout
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0, transition: { delay: i * 0.03 } }}
                exit={{ opacity: 0, x: -12 }}
                className="group rounded-xl border border-white/5 bg-white/[0.03] p-2.5 transition hover:border-white/15 hover:bg-white/[0.06]"
              >
                <div className="flex items-start gap-2.5">
                  <button
                    onClick={() => run(hit, () => onPlayNow(hit))}
                    disabled={disabled}
                    title="Reproducir ahora"
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition group-hover:scale-110 disabled:opacity-50"
                    style={
                      song.artworkUrl
                        ? { background: `linear-gradient(rgba(5,3,15,0.45), rgba(5,3,15,0.45)), center / cover url("${song.artworkUrl}")`, color: "#fff" }
                        : { background: genreColor(song.genre, 0.25), color: genreColor(song.genre) }
                    }
                  >
                    <PlayIcon width={12} height={12} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{song.title}</p>
                    <p className="truncate text-[11px] text-white/50">
                      {song.artist} · {song.year} · <span style={{ color: genreColor(song.genre) }}>{GENRES[song.genre].label}</span>
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1 text-[9px] uppercase tracking-wide">
                      <span className={`rounded px-1.5 py-0.5 ${badge.className}`}>{badge.label}</span>
                      {song.previewUrl && <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-violet-300">Audio</span>}
                      {song.youtubeId && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-red-300">Video</span>}
                      {song.spotifyId && <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-green-300">Pista</span>}
                    </div>
                  </div>
                </div>
                {pending ? (
                  <div className="mt-2 flex items-center justify-center gap-2 rounded-md bg-white/5 py-1 text-[10px] text-white/70">
                    <LoadingDots color={accent} /> Conectando con YouTube y Spotify…
                  </div>
                ) : (
                  <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
                    <HitButton disabled={disabled} onClick={() => run(hit, () => onAdd(hit, "prepend"))}>
                      Al inicio
                    </HitButton>
                    <HitButton disabled={disabled} onClick={() => run(hit, () => onAdd(hit, "insertAt", position - 1))}>
                      En posición {position}
                    </HitButton>
                    <HitButton disabled={disabled} onClick={() => run(hit, () => onAdd(hit, "append"))}>
                      Al final
                    </HitButton>
                  </div>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
        {!loading && hits.length === 0 && !error && (
          <li className="py-6 text-center text-xs text-white/40">Sin resultados en esta galaxia.</li>
        )}
      </ul>
    </div>
  );
}

const TRAIL_LIMIT = 16;

/**
 * The path that the typed text walks down the prefix tree: every character is
 * one node. It lights up while the prefix exists and breaks where no stored
 * word continues that way.
 */
function TrieTrail({ trail, accent }: { trail: TrieStep[]; accent: string }) {
  const shown = trail.slice(-TRAIL_LIMIT);
  const last = trail[trail.length - 1];
  const broken = trail.find((step) => !step.found);
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-2.5 py-1.5">
      <div className="flex flex-wrap items-center gap-y-1 text-[10px]">
        <span className="rounded-full border border-white/20 px-1.5 text-white/45">raíz</span>
        {trail.length > shown.length && <span className="px-1 text-white/35">…</span>}
        {shown.map((step, index) => (
          // The position and the character are the key: only the newly typed node pops in
          <span key={`${trail.length - shown.length + index}-${step.character}`} className="flex items-center">
            <span className="h-px w-2" style={{ background: step.found ? accent : "rgba(251,113,133,0.5)" }} aria-hidden />
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 24 }}
              className="flex h-5 min-w-5 items-center justify-center rounded-full border px-1 font-mono"
              style={
                step.found
                  ? { borderColor: accent, background: `${accent}26`, color: "#fff", boxShadow: step.ends > 0 ? `0 0 8px ${accent}` : undefined }
                  : { borderColor: "rgba(251,113,133,0.5)", borderStyle: "dashed", color: "rgba(251,113,133,0.8)" }
              }
              title={step.found ? (step.ends > 0 ? "Aquí termina una palabra guardada" : "Este prefijo existe") : "Ninguna palabra guardada sigue por aquí"}
            >
              {step.character === " " ? "␣" : step.character}
            </motion.span>
          </span>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-white/40">
        {broken
          ? `El camino se corta en «${broken.character === " " ? "espacio" : broken.character}»: ninguna palabra guardada empieza así.`
          : `Camino en el árbol de prefijos: ${last.branches} ${last.branches === 1 ? "letra puede" : "letras pueden"} seguir${last.ends > 0 ? " y aquí termina una palabra" : ""}.`}
      </p>
    </div>
  );
}

function HitButton({ children, disabled, onClick }: { children: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md bg-white/5 py-1 text-white/70 transition hover:bg-white/15 hover:text-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function LoadingDots({ color }: { color: string }) {
  return (
    <span className="flex gap-0.5" aria-label="Cargando">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1 w-1 rounded-full"
          style={{ background: color }}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}
