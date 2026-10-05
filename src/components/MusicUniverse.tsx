"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePlaylist } from "@/hooks/usePlaylist";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { INITIAL_PLAYLIST } from "@/lib/catalog";
import { MODES, MODE_BY_ID } from "@/lib/modes";
import { PREVIEW_SECONDS, SynthEngine } from "@/lib/audioEngine";
import { MusicIndex } from "@/lib/MusicIndex";
import { DEFAULT_FILTER, isFilterActive, type SpatialFilter } from "@/lib/spatialFilter";
import type { InsertOperation, PlaybackSource, SearchHit, Song, Track, VisualMode } from "@/types/music";
import UniverseCanvas, { type CanvasInsets, type TraversalRequest } from "./UniverseCanvas";
import ModeSwitcher from "./ModeSwitcher";
import PlayerDock, { type Progress } from "./PlayerDock";
import EmbedPlayer from "./EmbedPlayer";
import SearchPanel from "./SearchPanel";
import ConstellationPanel from "./ConstellationPanel";
import EventToast from "./EventToast";
import FilterPanel from "./FilterPanel";
import DiagnosticsPanel from "./DiagnosticsPanel";
import { CloseIcon, FilterIcon, ListIcon, SearchIcon, SparkIcon } from "./icons";

const panelMotion = (side: "left" | "right") => ({
  initial: { opacity: 0, x: side === "left" ? -40 : 40 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: side === "left" ? -40 : 40 },
  transition: { type: "spring" as const, stiffness: 320, damping: 32 },
});

export default function MusicUniverse() {
  const playlist = usePlaylist(INITIAL_PLAYLIST);
  const { tracks, currentTrack, currentIndex, repeat } = playlist;

  const [mode, setMode] = useState<VisualMode>("universe");
  const [source, setSource] = useState<PlaybackSource>("synth");
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [searchOpen, setSearchOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [filter, setFilter] = useState<SpatialFilter>(DEFAULT_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const accent = MODE_BY_ID[mode].accent;
  // Secondary index (hash tables + BST): rebuilt only when the list changes, not on every filter move
  const trackIndex = useMemo(() => new MusicIndex(tracks), [tracks]);
  const visible = useMemo(() => {
    const matches = trackIndex.filter(filter);
    return tracks.map((track) => matches.has(track));
  }, [trackIndex, tracks, filter]);
  const visibleCount = visible.filter(Boolean).length;

  // Both panels start open on desktop and closed on mobile
  useEffect(() => {
    setSearchOpen(isDesktop);
    setListOpen(isDesktop);
  }, [isDesktop]);

  // ---------------------------------------------------------------------------
  // Audio engine (Web Audio API)
  // ---------------------------------------------------------------------------
  const engineRef = useRef<SynthEngine | null>(null);
  const onEndedRef = useRef<() => void>(() => {});
  // Bumped when a preview ends, so a one-song loop restarts the same track
  const [replayToken, setReplayToken] = useState(0);

  const getEngine = useCallback(() => {
    if (!engineRef.current) {
      const engine = new SynthEngine();
      engine.onEnded = () => onEndedRef.current();
      engineRef.current = engine;
    }
    return engineRef.current;
  }, []);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Keeps the engine in sync with (current song, source, play/pause)
  useEffect(() => {
    const engine = engineRef.current;
    if (source !== "synth" || !currentTrack) {
      engine?.stop();
      return;
    }
    if (!isPlaying) {
      engine?.pause();
      return;
    }
    const active = getEngine();
    if (active.loadedUid !== currentTrack.uid) active.play(currentTrack);
    else active.resume();
  }, [currentTrack, source, isPlaying, getEngine, replayToken]);

  useEffect(() => {
    getEngine().setVolume(volume);
  }, [volume, getEngine]);

  useEffect(() => {
    getEngine().setNight(mode === "night");
  }, [mode, getEngine]);

  useEffect(() => {
    if (!currentTrack) setIsPlaying(false);
  }, [currentTrack]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const startPlayback = useCallback(() => {
    if (source === "synth") getEngine().unlock();
    setIsPlaying(true);
  }, [source, getEngine]);

  const togglePlay = useCallback(() => {
    if (!currentTrack || source === "spotify") return;
    if (isPlaying) setIsPlaying(false);
    else startPlayback();
  }, [currentTrack, source, isPlaying, startPlayback]);

  const handleNext = useCallback(() => {
    if (!playlist.next()) setIsPlaying(false);
  }, [playlist]);

  const handlePrev = useCallback(() => {
    playlist.prev();
  }, [playlist]);

  onEndedRef.current = () => {
    handleNext();
    setReplayToken((token) => token + 1);
  };

  const handleSelect = useCallback(
    (index: number) => {
      if (playlist.playAt(index)) startPlayback();
    },
    [playlist, startPlayback],
  );

  // Songs without a video / track for the active platform get it looked up once
  const { enrich } = playlist;
  const attemptedRef = useRef(new Set<string>());
  const [resolvingUid, setResolvingUid] = useState<string | null>(null);

  useEffect(() => {
    if (source === "synth" || !currentTrack) return;
    const missing = source === "youtube" ? !currentTrack.youtubeId : !currentTrack.spotifyId;
    const attemptKey = `${source}:${currentTrack.uid}`;
    if (!missing || attemptedRef.current.has(attemptKey)) return;
    attemptedRef.current.add(attemptKey);

    const { uid, ...song } = currentTrack;
    setResolvingUid(uid);
    resolveSong(song)
      .then((resolved) => {
        const bindings: Pick<Song, "youtubeId" | "spotifyId"> = {};
        if (resolved.youtubeId) bindings.youtubeId = resolved.youtubeId;
        if (resolved.spotifyId) bindings.spotifyId = resolved.spotifyId;
        if (Object.keys(bindings).length > 0) enrich(uid, bindings);
      })
      .finally(() => setResolvingUid((value) => (value === uid ? null : value)));
  }, [currentTrack, source, enrich]);

  // Every song that actually starts playing enters the recently played tracker
  const { recordPlay } = playlist;
  const currentUid = currentTrack?.uid;
  const currentTrackRef = useRef(currentTrack);
  currentTrackRef.current = currentTrack;
  useEffect(() => {
    if (isPlaying && currentTrackRef.current) recordPlay(currentTrackRef.current);
  }, [currentUid, isPlaying, recordPlay]);

  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const handleAdd = useCallback(
    async (hit: SearchHit, operation: InsertOperation, index?: number) => {
      const song = await materialize(hit);
      playlist.add(song, operation, index);
    },
    [playlist],
  );

  const handlePlayNow = useCallback(
    async (hit: SearchHit) => {
      const song = await materialize(hit);
      // Read the index after the await: playback may have moved meanwhile
      const position = playlist.add(song, "insertAt", currentIndexRef.current + 1);
      if (playlist.playAt(position)) startPlayback();
    },
    [playlist, startPlayback],
  );

  const handlePlayHistory = useCallback(
    (track: Track) => {
      const index = playlist.indexOfUid(track.uid);
      if (index >= 0) {
        handleSelect(index);
        return;
      }
      // The song left the list: bring it back right after the current one
      const position = playlist.add(track, "insertAt", currentIndexRef.current + 1);
      if (playlist.playAt(position)) startPlayback();
    },
    [playlist, handleSelect, startPlayback],
  );

  const handleExport = useCallback(() => {
    const blob = new Blob([playlist.exportPlaylist()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `constelacion-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    // Revoking right away cancels the download in some browsers
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [playlist]);

  const [traversal, setTraversal] = useState<TraversalRequest | null>(null);
  const handleTraverse = useCallback(() => {
    if (playlist.traverseAll() > 0) {
      setTraversal((previous) => ({ id: (previous?.id ?? 0) + 1, startedAt: performance.now() / 1000 }));
    }
  }, [playlist]);

  const handleSource = useCallback((next: PlaybackSource) => {
    setSource(next);
    if (next === "spotify") setIsPlaying(false);
  }, []);

  const getAnalyser = useCallback(
    () => (source === "synth" ? engineRef.current?.getAnalyser() ?? null : null),
    [source],
  );

  const getProgress = useCallback((): Progress | null => {
    const engine = engineRef.current;
    if (source !== "synth" || !currentTrack) return null;
    if (!engine || engine.loadedUid !== currentTrack.uid) return { position: 0, duration: PREVIEW_SECONDS };
    return { position: Math.min(engine.position, PREVIEW_SECONDS), duration: PREVIEW_SECONDS };
  }, [source, currentTrack]);

  const toggleSearch = () => {
    setSearchOpen((open) => !open);
    if (!isDesktop) setListOpen(false);
  };
  const toggleList = () => {
    setListOpen((open) => !open);
    if (!isDesktop) setSearchOpen(false);
  };

  // Keyboard shortcuts: Space, ← →, 1-4
  const keyHandlers = useRef({ togglePlay, handleNext, handlePrev, undo: playlist.undo, redo: playlist.redo });
  keyHandlers.current = { togglePlay, handleNext, handlePrev, undo: playlist.undo, redo: playlist.redo };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      // Undo / redo: Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y (Cmd on macOS)
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "z" || key === "y") {
          event.preventDefault();
          if (key === "y" || event.shiftKey) keyHandlers.current.redo();
          else keyHandlers.current.undo();
          return;
        }
      }
      // Leave browser shortcuts alone (Alt+← is "back", Ctrl+1 switches tabs)
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === "Space") {
        event.preventDefault();
        keyHandlers.current.togglePlay();
      } else if (event.key === "ArrowRight") {
        keyHandlers.current.handleNext();
      } else if (event.key === "ArrowLeft") {
        keyHandlers.current.handlePrev();
      } else if (["1", "2", "3", "4"].includes(event.key)) {
        setMode(MODES[Number(event.key) - 1].id);
      } else if (event.key.toLowerCase() === "d") {
        setDiagnosticsOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------
  // Real dock height (it varies on mobile because the controls wrap into several rows)
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState(120);
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const measure = () => setDockHeight(window.innerHeight - dock.getBoundingClientRect().top);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(dock);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const embedVisible = source !== "synth" && currentTrack !== null;
  const embedHeight = source === "youtube" ? 200 : 170;
  const insets: CanvasInsets = {
    top: isDesktop ? 90 : 120,
    bottom: dockHeight + (embedVisible ? embedHeight : 0),
    left: isDesktop && searchOpen ? 352 : 16,
    right: isDesktop && listOpen ? 384 : 16,
  };

  const panelClass = isDesktop ? "top-20" : "top-28 inset-x-3";
  const panelStyle = { bottom: dockHeight + 8 };

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden text-white" style={{ "--accent": accent } as CSSProperties}>
      <UniverseCanvas
        tracks={tracks}
        currentUid={currentTrack?.uid ?? null}
        mode={mode}
        isPlaying={isPlaying}
        insets={insets}
        traversal={traversal}
        circular={repeat}
        filter={filter}
        getAnalyser={getAnalyser}
        onSelect={handleSelect}
      />

      <EventToast event={playlist.event} />

      {/* Header */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-center justify-between gap-3 px-4 pt-4 lg:flex-nowrap">
        <div className="pointer-events-auto">
          <h1 className="text-lg font-semibold tracking-tight">
            Universo <span style={{ color: accent }}>Musical</span>
          </h1>
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Constelación doblemente enlazada</p>
        </div>

        <div className="pointer-events-auto order-3 flex w-full flex-col items-center gap-1 lg:order-none lg:w-auto">
          <ModeSwitcher mode={mode} onChange={setMode} />
          <AnimatePresence mode="wait">
            <motion.p
              key={mode}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="text-center text-[11px] text-white/45"
            >
              {MODE_BY_ID[mode].hint}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="pointer-events-auto flex gap-2">
          <button
            onClick={() => setDiagnosticsOpen((open) => !open)}
            className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition hover:bg-white/10"
            style={{ color: diagnosticsOpen ? accent : undefined }}
            aria-pressed={diagnosticsOpen}
            title="Diagnóstico de la lista · D"
          >
            <SparkIcon width={14} height={14} /> Diagnóstico
          </button>
          <button
            onClick={() => setFilterOpen((open) => !open)}
            className="glass relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition hover:bg-white/10"
            style={{ color: filterOpen ? accent : undefined }}
            aria-pressed={filterOpen}
          >
            <FilterIcon width={14} height={14} /> Filtros
            {isFilterActive(filter) && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full" style={{ background: accent }} />}
          </button>
          <button
            onClick={toggleSearch}
            className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition hover:bg-white/10"
            style={{ color: searchOpen ? accent : undefined }}
            aria-pressed={searchOpen}
          >
            <SearchIcon width={14} height={14} /> Buscar
          </button>
          <button
            onClick={toggleList}
            className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition hover:bg-white/10"
            style={{ color: listOpen ? accent : undefined }}
            aria-pressed={listOpen}
          >
            <ListIcon width={14} height={14} /> Constelación ({tracks.length})
          </button>
        </div>
      </header>

      {/* Floating spatial filter */}
      <AnimatePresence>
        {filterOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="glass absolute inset-x-3 top-28 z-40 rounded-2xl p-4 sm:left-auto sm:right-4 sm:w-[22rem] lg:top-16"
          >
            <PanelClose onClick={() => setFilterOpen(false)} />
            <FilterPanel filter={filter} visibleCount={visibleCount} total={tracks.length} accent={accent} onChange={setFilter} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating list diagnostics (toggle: D) */}
      <AnimatePresence>
        {diagnosticsOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="glass absolute inset-x-3 top-28 z-40 rounded-2xl p-4 sm:left-4 sm:right-auto sm:w-[24rem] lg:top-16"
          >
            <PanelClose onClick={() => setDiagnosticsOpen(false)} />
            <DiagnosticsPanel metrics={playlist.metrics} size={tracks.length} accent={accent} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Left panel: search */}
      <AnimatePresence>
        {searchOpen && (
          <motion.aside
            {...panelMotion("left")}
            className={`glass absolute z-30 rounded-2xl p-4 lg:left-4 lg:w-80 ${panelClass}`}
            style={panelStyle}
          >
            {!isDesktop && <PanelClose onClick={() => setSearchOpen(false)} />}
            <SearchPanel
              currentIndex={currentIndex}
              length={tracks.length}
              accent={accent}
              onAdd={handleAdd}
              onPlayNow={handlePlayNow}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Right panel: the constellation (list order) */}
      <AnimatePresence>
        {listOpen && (
          <motion.aside
            {...panelMotion("right")}
            className={`glass absolute z-30 rounded-2xl p-4 lg:right-4 lg:w-[22rem] ${panelClass}`}
            style={panelStyle}
          >
            {!isDesktop && <PanelClose onClick={() => setListOpen(false)} />}
            <ConstellationPanel
              tracks={tracks}
              currentIndex={currentIndex}
              visible={visible}
              history={playlist.history}
              accent={accent}
              onPlayAt={handleSelect}
              onPlayHistory={handlePlayHistory}
              onRemove={(index) => playlist.remove(index)}
              onTraverse={handleTraverse}
              onShuffle={playlist.shuffleOrder}
              canUndo={playlist.canUndo}
              canRedo={playlist.canRedo}
              onUndo={playlist.undo}
              onRedo={playlist.redo}
              onExport={handleExport}
              onImport={playlist.importPlaylist}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Embedded YouTube / Spotify player */}
      <AnimatePresence>
        {currentTrack && source !== "synth" && (
          <motion.div
            key="embed"
            initial={{ opacity: 0, x: "-50%", y: 30, scale: 0.96 }}
            animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }}
            exit={{ opacity: 0, x: "-50%", y: 30, scale: 0.96 }}
            className="glass absolute left-1/2 z-20 w-[min(22rem,calc(100%-2rem))] rounded-2xl p-2"
            style={{ bottom: dockHeight + 8 }}
          >
            <EmbedPlayer
              key={`${source}-${currentTrack.uid}`}
              track={currentTrack}
              source={source}
              isPlaying={isPlaying}
              resolving={resolvingUid === currentTrack.uid}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom dock */}
      <div ref={dockRef} className="absolute inset-x-3 bottom-3 z-40 lg:inset-x-4 lg:bottom-4">
        <PlayerDock
          track={currentTrack}
          index={currentIndex}
          total={tracks.length}
          isPlaying={isPlaying}
          source={source}
          repeat={repeat}
          shuffle={playlist.shuffleMode}
          volume={volume}
          accent={accent}
          getProgress={getProgress}
          onToggle={togglePlay}
          onNext={handleNext}
          onPrev={handlePrev}
          onRepeat={() => playlist.setRepeat(!repeat)}
          onShuffle={playlist.toggleShuffleMode}
          onVolume={setVolume}
          onSource={handleSource}
        />
      </div>
    </main>
  );
}

/**
 * Turns a search hit into a playable Song: songs from outside the catalog get
 * their YouTube / Spotify bindings resolved before entering the list.
 */
async function materialize(hit: SearchHit): Promise<Song> {
  if (hit.origin === "local" || hit.origin === "simulated") return hit.song;
  return resolveSong(hit.song);
}

/** Asks the server for the YouTube / Spotify bindings of a song. Never throws. */
async function resolveSong(song: Song): Promise<Song> {
  try {
    const response = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song }),
    });
    if (response.ok) return ((await response.json()) as { song: Song }).song;
  } catch (error) {
    console.warn("[resolve] request failed:", error);
  }
  return song;
}

function PanelClose({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute right-3 top-3 z-10 rounded-full p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
      aria-label="Cerrar panel"
    >
      <CloseIcon width={16} height={16} />
    </button>
  );
}
