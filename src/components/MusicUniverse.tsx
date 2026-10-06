"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { usePlaylist } from "@/hooks/usePlaylist";
import { useLibrary } from "@/hooks/useLibrary";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { INITIAL_PLAYLIST } from "@/lib/catalog";
import { MODES, MODE_BY_ID } from "@/lib/modes";
import { CLIP_SECONDS, PREVIEW_SECONDS, SynthEngine } from "@/lib/audioEngine";
import { MusicIndex } from "@/lib/MusicIndex";
import { DEFAULT_FILTER, isFilterActive, type SpatialFilter } from "@/lib/spatialFilter";
import { MAX_PAYLOAD_LENGTH, decodeGalaxy, encodeGalaxy, payloadFromHash, shareUrl } from "@/lib/shareLink";
import { clamp } from "@/lib/utils";
import type { InsertOperation, PlaybackSource, SearchHit, Song, SongBindings, Track, VisualMode } from "@/types/music";
import UniverseCanvas, { TRAVERSAL_STEP_SECONDS, type CanvasInsets, type TraversalRequest } from "./UniverseCanvas";
import ModeSwitcher from "./ModeSwitcher";
import PlayerDock, { type Progress } from "./PlayerDock";
import EmbedPlayer from "./EmbedPlayer";
import SearchPanel from "./SearchPanel";
import ConstellationPanel from "./ConstellationPanel";
import EventToast from "./EventToast";
import FilterPanel from "./FilterPanel";
import DiagnosticsPanel from "./DiagnosticsPanel";
import LyricsPanel from "./LyricsPanel";
import StructuresPanel from "./structures/StructuresPanel";
import type { Rotation } from "./structures/AvlView";
import { CloseIcon, FilterIcon, ListIcon, LyricsIcon, SearchIcon, SparkIcon, TreeIcon } from "./icons";

const panelMotion = (side: "left" | "right") => ({
  initial: { opacity: 0, x: side === "left" ? -40 : 40 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: side === "left" ? -40 : 40 },
  transition: { type: "spring" as const, stiffness: 320, damping: 32 },
});

const PREFERENCES_KEY = "universo-musical/preferencias";
const SOURCES: PlaybackSource[] = ["preview", "synth", "youtube", "spotify"];
/** The embedded YouTube player reports its position about once per second; in between it is estimated. */
const MAX_CLOCK_DRIFT_SEC = 2;

/** reducedMotion="user": whoever asks the system for less motion gets fades instead of movement. */
export default function MusicUniverse() {
  return (
    <MotionConfig reducedMotion="user">
      <Universe />
    </MotionConfig>
  );
}

function Universe() {
  const playlist = usePlaylist(INITIAL_PLAYLIST);
  const library = useLibrary(playlist);
  const { tracks, currentTrack, currentIndex, repeat } = playlist;

  const [mode, setMode] = useState<VisualMode>("universe");
  const [source, setSource] = useState<PlaybackSource>("preview");
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [searchOpen, setSearchOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [filter, setFilter] = useState<SpatialFilter>(DEFAULT_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [structuresOpen, setStructuresOpen] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  // Diagnostics and structures share the same corner: opening one closes the other
  const toggleDiagnostics = useCallback(() => {
    setDiagnosticsOpen((open) => !open);
    setStructuresOpen(false);
  }, []);
  const toggleStructures = useCallback(() => {
    setStructuresOpen((open) => !open);
    setDiagnosticsOpen(false);
  }, []);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const accent = MODE_BY_ID[mode].accent;
  // The app's own engine plays these two; YouTube and Spotify run inside their embedded players
  const ownAudio = source === "preview" || source === "synth";
  // Secondary index (hash tables + AVL tree): when the list changes it only adds and removes
  // the songs that changed, and it is not touched at all when a filter moves
  const indexRef = useRef<MusicIndex<Track> | null>(null);
  // Rotations of the tempo tree during the last change of the list, for the structures panel
  const rotationsRef = useRef<Rotation[]>([]);
  const trackIndex = useMemo(() => {
    const index = (indexRef.current ??= new MusicIndex<Track>());
    const made: Rotation[] = [];
    index.tempoTree.onRotate = (direction, key) => made.push({ direction, key });
    // Kept only when something changed: a repeated call with the same list must not erase them
    if (index.sync(tracks) > 0) rotationsRef.current = made;
    index.tempoTree.onRotate = null;
    return index;
  }, [tracks]);
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

  // Volume, source and visual mode survive a reload
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) ?? "null") as { volume?: unknown; source?: unknown; mode?: unknown } | null;
      if (typeof saved?.volume === "number" && Number.isFinite(saved.volume)) setVolume(clamp(saved.volume, 0, 1));
      if (SOURCES.includes(saved?.source as PlaybackSource)) setSource(saved?.source as PlaybackSource);
      if (MODES.some((item) => item.id === saved?.mode)) setMode(saved?.mode as VisualMode);
    } catch {
      // Unreadable or blocked storage: keep the defaults
    }
    setPreferencesLoaded(true);
  }, []);
  useEffect(() => {
    if (!preferencesLoaded) return;
    try {
      window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ volume, source, mode }));
    } catch {
      // Same as above: nothing to do
    }
  }, [preferencesLoaded, volume, source, mode]);

  // ---------------------------------------------------------------------------
  // Audio engine (Web Audio API)
  // ---------------------------------------------------------------------------
  const engineRef = useRef<SynthEngine | null>(null);
  const onEndedRef = useRef<() => void>(() => {});
  // Bumped when a preview ends, so a one-song loop restarts the same track
  const [replayToken, setReplayToken] = useState(0);
  // Songs without a clip / video / track for the active source get it looked up once
  const attemptedRef = useRef(new Set<string>());
  const [resolvingUid, setResolvingUid] = useState<string | null>(null);

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
    if (!ownAudio || !currentTrack) {
      engine?.stop();
      return;
    }
    if (!isPlaying) {
      engine?.pause();
      return;
    }
    const clipUrl = source === "preview" ? currentTrack.previewUrl : undefined;
    if (source === "preview" && !clipUrl) {
      // Stay silent while the clip is being looked up; without one, the synth takes over
      const lookedUp = attemptedRef.current.has(`preview:${currentTrack.uid}`) && resolvingUid !== currentTrack.uid;
      if (!lookedUp) {
        engine?.stop();
        return;
      }
    }
    const active = getEngine();
    if (active.loadedKey !== SynthEngine.keyFor(currentTrack, clipUrl)) active.play(currentTrack, clipUrl);
    else active.resume();
  }, [currentTrack, source, ownAudio, isPlaying, getEngine, replayToken, resolvingUid]);

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
    if (ownAudio) getEngine().unlock();
    setIsPlaying(true);
  }, [ownAudio, getEngine]);

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

  // "Mezclar" also tells the canvas, which swirls the stars into their new order
  const [shuffleSignal, setShuffleSignal] = useState(0);
  const { shuffleOrder } = playlist;
  const handleShuffle = useCallback(() => {
    shuffleOrder();
    setShuffleSignal((signal) => signal + 1);
  }, [shuffleOrder]);

  const handleSeek = useCallback(
    (seconds: number) => {
      const engine = engineRef.current;
      if (engine && currentTrack && engine.loadedUid === currentTrack.uid) engine.seek(seconds);
    },
    [currentTrack],
  );

  const { enrich } = playlist;
  useEffect(() => {
    if (source === "synth" || !currentTrack) return;
    const missing =
      source === "preview" ? !currentTrack.previewUrl : source === "youtube" ? !currentTrack.youtubeId : !currentTrack.spotifyId;
    const attemptKey = `${source}:${currentTrack.uid}`;
    if (!missing || attemptedRef.current.has(attemptKey)) return;
    attemptedRef.current.add(attemptKey);

    const { uid, ...song } = currentTrack;
    setResolvingUid(uid);
    resolveSong(song, source === "preview" ? "media" : "all")
      .then((resolved) => {
        const bindings: SongBindings = {};
        if (resolved.youtubeId) bindings.youtubeId = resolved.youtubeId;
        if (resolved.spotifyId) bindings.spotifyId = resolved.spotifyId;
        if (resolved.previewUrl) bindings.previewUrl = resolved.previewUrl;
        if (resolved.artworkUrl) bindings.artworkUrl = resolved.artworkUrl;
        if (Object.keys(bindings).length > 0) enrich(uid, bindings);
      })
      .finally(() => setResolvingUid((value) => (value === uid ? null : value)));
  }, [currentTrack, source, enrich]);

  // Every song that actually starts playing enters the recently played tracker and the play counts
  const { recordPlay } = playlist;
  const { countPlay } = library;
  const currentUid = currentTrack?.uid;
  const currentTrackRef = useRef(currentTrack);
  currentTrackRef.current = currentTrack;
  const countedRef = useRef("");
  useEffect(() => {
    const track = currentTrackRef.current;
    if (!isPlaying || !track) return;
    recordPlay(track);
    // Pausing and resuming is still the same play; a song that ends and loops is a new one
    const playKey = `${track.uid}:${replayToken}`;
    if (countedRef.current !== playKey) {
      countedRef.current = playKey;
      countPlay(track);
    }
  }, [currentUid, isPlaying, replayToken, recordPlay, countPlay]);

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

  /** Plays a song from the rankings: the one already in the list, or a new star right after the current one. */
  const handlePlaySong = useCallback(
    (song: Song) => {
      const index = tracks.findIndex((track) => track.id === song.id);
      if (index >= 0) {
        handleSelect(index);
        return;
      }
      const position = playlist.add(song, "insertAt", currentIndexRef.current + 1);
      if (playlist.playAt(position)) startPlayback();
    },
    [tracks, playlist, handleSelect, startPlayback],
  );

  // Another playlist means other songs: playback stops instead of jumping to an unexpected one
  const handleSwitchGalaxy = useCallback(
    (id: string) => {
      if (library.switchGalaxy(id)) setIsPlaying(false);
    },
    [library],
  );
  const handleCreateGalaxy = useCallback(
    (name: string) => {
      if (library.createGalaxy(name)) setIsPlaying(false);
    },
    [library],
  );
  const handleDeleteGalaxy = useCallback(
    (id: string) => {
      if (library.deleteGalaxy(id)) setIsPlaying(false);
    },
    [library],
  );

  // ---------------------------------------------------------------------------
  // Sharing a playlist inside a link
  // ---------------------------------------------------------------------------
  const { announce, serialize } = playlist;
  const activeGalaxyName = library.galaxies.find((galaxy) => galaxy.id === library.activeId)?.name ?? "Galaxia";
  const handleShare = useCallback(async () => {
    try {
      const payload = await encodeGalaxy(activeGalaxyName, serialize());
      if (payload.length > MAX_PAYLOAD_LENGTH) {
        announce("warning", "Esta galaxia es demasiado grande para un enlace: usa «Exportar constelación»");
        return;
      }
      const url = shareUrl(window.location.href.split("#")[0], payload);
      try {
        await navigator.clipboard.writeText(url);
        announce("traverse", `Enlace de «${activeGalaxyName}» copiado: quien lo abra recibirá la galaxia completa`);
      } catch {
        // No clipboard access (permission denied, page without focus): the address bar carries the link
        window.history.replaceState(null, "", url);
        announce("traverse", "El enlace quedó en la barra de direcciones: cópialo desde ahí para compartir la galaxia");
      }
    } catch {
      announce("warning", "No se pudo crear el enlace");
    }
  }, [activeGalaxyName, serialize, announce]);

  // A link with a playlist becomes a new galaxy, once the saved library is in place
  const createGalaxyRef = useRef(library.createGalaxy);
  createGalaxyRef.current = library.createGalaxy;
  const canCreateGalaxyRef = useRef(library.canCreateGalaxy);
  canCreateGalaxyRef.current = library.canCreateGalaxy;
  const sharedHandledRef = useRef(false);
  useEffect(() => {
    if (!library.hydrated || sharedHandledRef.current) return;
    sharedHandledRef.current = true;
    const payload = payloadFromHash(window.location.hash);
    if (!payload) return;
    // The address goes back to normal right away, so a reload does not bring the galaxy twice
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    void decodeGalaxy(payload).then((shared) => {
      if (!shared) announce("warning", "El enlace no trae una galaxia válida");
      else if (!canCreateGalaxyRef.current) announce("warning", "Ya tienes el máximo de galaxias: elimina una para recibir la del enlace");
      else if (createGalaxyRef.current(shared.name || "Compartida", shared.list)) setIsPlaying(false);
      else announce("warning", "El enlace no trae una galaxia válida");
    });
  }, [library.hydrated, announce]);

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
    // Same pace as the comet, so the list lights each star as the comet reaches it
    if (playlist.traverseAll(TRAVERSAL_STEP_SECONDS * 1000) > 0) {
      setTraversal((previous) => ({ id: (previous?.id ?? 0) + 1, startedAt: performance.now() / 1000 }));
    }
  }, [playlist]);

  const handleSource = useCallback((next: PlaybackSource) => {
    setSource(next);
    if (next === "spotify") setIsPlaying(false);
  }, []);

  const getAnalyser = useCallback(() => (ownAudio ? engineRef.current?.getAnalyser() ?? null : null), [ownAudio]);

  const getProgress = useCallback((): Progress | null => {
    const engine = engineRef.current;
    if (!ownAudio || !currentTrack) return null;
    if (!engine || engine.loadedUid !== currentTrack.uid) {
      return { position: 0, duration: source === "preview" && currentTrack.previewUrl ? CLIP_SECONDS : PREVIEW_SECONDS };
    }
    return { position: Math.min(engine.position, engine.duration), duration: engine.duration };
  }, [ownAudio, source, currentTrack]);

  // Position inside the full song, known only for YouTube: it drives the synced lyrics
  const youtubeClockRef = useRef({ uid: "", time: 0, at: 0 });
  const handleYoutubeTime = useCallback((uid: string, seconds: number) => {
    youtubeClockRef.current = { uid, time: seconds, at: performance.now() };
  }, []);
  // A 30-second clip starts at an unknown point of the song: the listener marks the line that is
  // sounding, and from then on the clip position plus that offset is the position in the song
  const clipOffsetsRef = useRef(new Map<string, number>());
  const canAnchorLyrics = source === "preview" && Boolean(currentTrack?.previewUrl);
  const handleAnchorLyric = useCallback(
    (lineSeconds: number) => {
      const engine = engineRef.current;
      if (!currentTrack || !engine || engine.loadedUid !== currentTrack.uid) return;
      clipOffsetsRef.current.set(currentTrack.id, lineSeconds - engine.position);
    },
    [currentTrack],
  );
  const getSongTime = useCallback((): number | null => {
    if (source === "preview") {
      const engine = engineRef.current;
      const offset = currentTrack ? clipOffsetsRef.current.get(currentTrack.id) : undefined;
      if (offset === undefined || !currentTrack?.previewUrl || !engine || engine.loadedUid !== currentTrack.uid) return null;
      return offset + engine.position;
    }
    const clock = youtubeClockRef.current;
    if (source !== "youtube" || !currentUid || clock.uid !== currentUid) return null;
    const drift = isPlaying ? Math.min((performance.now() - clock.at) / 1000, MAX_CLOCK_DRIFT_SEC) : 0;
    return clock.time + drift;
  }, [source, currentUid, currentTrack, isPlaying]);

  const toggleSearch = () => {
    setSearchOpen((open) => !open);
    if (!isDesktop) setListOpen(false);
  };
  const toggleList = () => {
    setListOpen((open) => !open);
    if (!isDesktop) setSearchOpen(false);
  };

  // Keyboard shortcuts: Space, ← →, 1-4
  const keyHandlers = useRef({ togglePlay, handleNext, handlePrev, handleSeek, isPlaying, undo: playlist.undo, redo: playlist.redo, toggleDiagnostics, toggleStructures });
  keyHandlers.current = { togglePlay, handleNext, handlePrev, handleSeek, isPlaying, undo: playlist.undo, redo: playlist.redo, toggleDiagnostics, toggleStructures };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
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
        keyHandlers.current.toggleDiagnostics();
      } else if (event.key.toLowerCase() === "e") {
        keyHandlers.current.toggleStructures();
      } else if (event.key.toLowerCase() === "l") {
        setLyricsOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------------------------------------------------------------------------
  // System media controls (keyboard media keys, lock screen, headphones)
  // ---------------------------------------------------------------------------
  const artworkUrl = currentTrack?.artworkUrl;
  const mediaTitle = currentTrack?.title;
  const mediaArtist = currentTrack?.artist;
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata =
      mediaTitle && mediaArtist
        ? new MediaMetadata({
            title: mediaTitle,
            artist: mediaArtist,
            album: "Universo Musical",
            artwork: artworkUrl ? [{ src: artworkUrl, sizes: "300x300", type: "image/jpeg" }] : [],
          })
        : null;
  }, [mediaTitle, mediaArtist, artworkUrl]);

  useEffect(() => {
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => !keyHandlers.current.isPlaying && keyHandlers.current.togglePlay()],
      ["pause", () => keyHandlers.current.isPlaying && keyHandlers.current.togglePlay()],
      ["nexttrack", () => keyHandlers.current.handleNext()],
      ["previoustrack", () => keyHandlers.current.handlePrev()],
      ["seekto", (details) => typeof details.seekTime === "number" && keyHandlers.current.handleSeek(details.seekTime)],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // This browser does not support the action
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Same as above
        }
      }
    };
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

  const embedVisible = !ownAudio && currentTrack !== null;
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
        walk={playlist.walk}
        shuffleSignal={shuffleSignal}
        galaxyId={library.activeId}
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

        <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
          <button
            onClick={toggleStructures}
            className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition hover:bg-white/10"
            style={{ color: structuresOpen ? accent : undefined }}
            aria-pressed={structuresOpen}
            title="Las estructuras de datos por dentro · E"
          >
            <TreeIcon width={14} height={14} /> Estructuras
          </button>
          <button
            onClick={toggleDiagnostics}
            className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition hover:bg-white/10"
            style={{ color: diagnosticsOpen ? accent : undefined }}
            aria-pressed={diagnosticsOpen}
            title="Diagnóstico de la lista · D"
          >
            <SparkIcon width={14} height={14} /> Diagnóstico
          </button>
          <button
            onClick={() => setLyricsOpen((open) => !open)}
            className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition hover:bg-white/10"
            style={{ color: lyricsOpen ? accent : undefined }}
            aria-pressed={lyricsOpen}
            title="Letra de la canción · L"
          >
            <LyricsIcon width={14} height={14} /> Letra
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

      {/* Floating view of the data structures (toggle: E) */}
      <AnimatePresence>
        {structuresOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="glass absolute inset-x-3 top-28 z-40 rounded-2xl p-4 sm:left-4 sm:right-auto sm:w-[27rem] lg:top-16"
          >
            <PanelClose onClick={() => setStructuresOpen(false)} />
            <StructuresPanel
              tracks={tracks}
              tempoTree={trackIndex.tempoTree}
              rotations={rotationsRef.current}
              plays={library.plays}
              nodeTable={playlist.nodeTable}
              undoSteps={playlist.undoSteps}
              redoSteps={playlist.redoSteps}
              accent={accent}
              onUndo={playlist.undo}
              onRedo={playlist.redo}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating lyrics (toggle: L) */}
      <AnimatePresence>
        {lyricsOpen && (
          <motion.div
            initial={{ opacity: 0, x: "-50%", y: -10, scale: 0.97 }}
            animate={{ opacity: 1, x: "-50%", y: 0, scale: 1 }}
            exit={{ opacity: 0, x: "-50%", y: -10, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="glass absolute left-1/2 top-28 z-40 w-[min(24rem,calc(100%-1.5rem))] rounded-2xl p-4 lg:top-20"
          >
            <PanelClose onClick={() => setLyricsOpen(false)} />
            <LyricsPanel track={currentTrack} accent={accent} getSongTime={getSongTime} onAnchor={canAnchorLyrics ? handleAnchorLyric : undefined} />
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
              isPlaying={isPlaying}
              walk={playlist.walk}
              history={playlist.history}
              queue={playlist.queue}
              topPlayed={library.topPlayed}
              favorites={library.favorites}
              favoriteIds={library.favoriteIds}
              galaxies={library.galaxies}
              activeGalaxyId={library.activeId}
              canCreateGalaxy={library.canCreateGalaxy}
              accent={accent}
              onSwitchGalaxy={handleSwitchGalaxy}
              onCreateGalaxy={handleCreateGalaxy}
              onRenameGalaxy={library.renameGalaxy}
              onDeleteGalaxy={handleDeleteGalaxy}
              onPlayAt={handleSelect}
              onPlayHistory={handlePlayHistory}
              onPlaySong={handlePlaySong}
              onRemove={(index) => playlist.remove(index)}
              onMove={playlist.move}
              onEnqueue={playlist.enqueue}
              onUnqueue={playlist.unqueue}
              onClearQueue={playlist.clearQueue}
              onTraverse={handleTraverse}
              onShuffle={handleShuffle}
              canUndo={playlist.canUndo}
              canRedo={playlist.canRedo}
              onUndo={playlist.undo}
              onRedo={playlist.redo}
              onExport={handleExport}
              onShare={handleShare}
              onImport={playlist.importPlaylist}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Embedded YouTube / Spotify player */}
      <AnimatePresence>
        {currentTrack && source !== "preview" && source !== "synth" && (
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
              onTime={handleYoutubeTime}
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
          favorite={currentTrack ? library.favoriteIds.has(currentTrack.id) : false}
          getProgress={getProgress}
          onSeek={handleSeek}
          onFavorite={() => currentTrack && library.toggleFavorite(currentTrack)}
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
  return resolveSong(hit.song, "all");
}

/**
 * Asks the server for what a song needs to be played: "media" is the real audio
 * clip and the cover, "all" adds the YouTube / Spotify bindings. Never throws.
 */
async function resolveSong(song: Song, scope: "all" | "media"): Promise<Song> {
  try {
    const response = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song, scope }),
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
