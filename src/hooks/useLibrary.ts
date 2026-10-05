"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SerializedList } from "@/lib/DoublyLinkedList";
import { topK } from "@/lib/Heap";
import { parseSong, toSong } from "@/lib/songSchema";
import type { Song } from "@/types/music";
import type { usePlaylist } from "./usePlaylist";

const STORAGE_KEY = "universo-musical/biblioteca";
const SAVE_DELAY_MS = 300;
const MAX_GALAXIES = 12;
const MAX_NAME_LENGTH = 30;
const TOP_SIZE = 5;
const MAX_COUNTED_SONGS = 300;

/** A named playlist. Only the active one lives in the linked list; the rest wait as snapshots. */
export interface Galaxy {
  id: string;
  name: string;
}

export interface PlayCount {
  song: Song;
  plays: number;
  lastPlayedAt: number;
}

interface StoredLibrary {
  version: 1;
  activeId: string;
  galaxies: (Galaxy & { list: SerializedList<Song> })[];
  favorites: Song[];
  plays: PlayCount[];
}

const DEFAULT_GALAXY: Galaxy = { id: "principal", name: "Principal" };
const EMPTY_LIST: SerializedList<Song> = { version: 1, circular: true, currentIndex: -1, items: [] };

const cleanName = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);

/** Reads the saved library, dropping anything that does not have the expected shape. */
function readStored(): StoredLibrary | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<StoredLibrary>;
    if (data.version !== 1 || !Array.isArray(data.galaxies)) return null;

    const galaxies = data.galaxies
      .filter((galaxy) => typeof galaxy?.id === "string" && typeof galaxy.name === "string" && Array.isArray(galaxy.list?.items))
      .slice(0, MAX_GALAXIES);
    if (galaxies.length === 0) return null;

    const songs = (values: unknown): Song[] =>
      (Array.isArray(values) ? values : []).map(parseSong).filter((song): song is Song => song !== null);
    const plays = (Array.isArray(data.plays) ? data.plays : []).flatMap((entry): PlayCount[] => {
      const song = parseSong(entry?.song);
      const count = Number(entry?.plays);
      return song && Number.isInteger(count) && count > 0 ? [{ song, plays: count, lastPlayedAt: Number(entry.lastPlayedAt) || 0 }] : [];
    });

    return {
      version: 1,
      activeId: galaxies.some((galaxy) => galaxy.id === data.activeId) ? (data.activeId as string) : galaxies[0].id,
      galaxies,
      favorites: songs(data.favorites),
      plays,
    };
  } catch {
    return null;
  }
}

/**
 * Everything that outlives a page reload: the playlists ("galaxias"), the
 * favorite songs and how many times each song was played. It is saved in the
 * browser (localStorage) a moment after every change.
 */
export function useLibrary(playlist: ReturnType<typeof usePlaylist>) {
  const { serialize, load } = playlist;
  const [galaxies, setGalaxies] = useState<Galaxy[]>([DEFAULT_GALAXY]);
  const [activeId, setActiveId] = useState(DEFAULT_GALAXY.id);
  const [favorites, setFavorites] = useState<Song[]>([]);
  const [plays, setPlays] = useState<PlayCount[]>([]);
  // Nothing is written until the saved library has been read, or it would be overwritten
  const [hydrated, setHydrated] = useState(false);
  /** Snapshots of the playlists that are not loaded in the list right now */
  const shelfRef = useRef(new Map<string, SerializedList<Song>>());
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  // The server render and the first client render use the default playlist; the saved one comes right after
  useEffect(() => {
    const stored = readStored();
    if (stored) {
      for (const galaxy of stored.galaxies) shelfRef.current.set(galaxy.id, galaxy.list);
      setGalaxies(stored.galaxies.map(({ id, name }) => ({ id, name: cleanName(name) || "Sin nombre" })));
      setActiveId(stored.activeId);
      setFavorites(stored.favorites);
      setPlays(stored.plays);
      load(shelfRef.current.get(stored.activeId));
    }
    setHydrated(true);
  }, [load]);

  const { tracks, currentIndex, repeat } = playlist;
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      const document: StoredLibrary = {
        version: 1,
        activeId,
        galaxies: galaxies.map((galaxy) => ({
          ...galaxy,
          list: galaxy.id === activeId ? serialize() : shelfRef.current.get(galaxy.id) ?? EMPTY_LIST,
        })),
        favorites,
        plays,
      };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
      } catch {
        // Storage full or blocked (private mode): the app keeps working, it just does not remember
      }
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hydrated, galaxies, activeId, favorites, plays, serialize, tracks, currentIndex, repeat]);

  // ---------------------------------------------------------------------------
  // Playlists
  // ---------------------------------------------------------------------------

  const switchGalaxy = useCallback(
    (id: string): boolean => {
      const target = galaxies.find((galaxy) => galaxy.id === id);
      if (!target || id === activeRef.current) return false;
      shelfRef.current.set(activeRef.current, serialize());
      load(shelfRef.current.get(id) ?? EMPTY_LIST, `Viajaste a la galaxia «${target.name}»`);
      setActiveId(id);
      return true;
    },
    [galaxies, serialize, load],
  );

  const createGalaxy = useCallback(
    (rawName: string): boolean => {
      const name = cleanName(rawName);
      if (!name || galaxies.length >= MAX_GALAXIES) return false;
      const galaxy: Galaxy = { id: `galaxia-${Date.now().toString(36)}`, name };
      shelfRef.current.set(activeRef.current, serialize());
      shelfRef.current.set(galaxy.id, EMPTY_LIST);
      load(EMPTY_LIST, `Nació la galaxia «${name}»: agrégale estrellas desde el buscador`);
      setGalaxies((current) => [...current, galaxy]);
      setActiveId(galaxy.id);
      return true;
    },
    [galaxies.length, serialize, load],
  );

  const renameGalaxy = useCallback((id: string, rawName: string): boolean => {
    const name = cleanName(rawName);
    if (!name) return false;
    setGalaxies((current) => current.map((galaxy) => (galaxy.id === id ? { ...galaxy, name } : galaxy)));
    return true;
  }, []);

  /** Deletes a playlist. The last one cannot be deleted; deleting the active one moves to a neighbor. */
  const deleteGalaxy = useCallback(
    (id: string): boolean => {
      const index = galaxies.findIndex((galaxy) => galaxy.id === id);
      if (index < 0 || galaxies.length < 2) return false;
      if (id === activeRef.current) {
        const neighbor = galaxies[index + 1] ?? galaxies[index - 1];
        load(shelfRef.current.get(neighbor.id) ?? EMPTY_LIST, `Galaxia «${galaxies[index].name}» eliminada: ahora estás en «${neighbor.name}»`);
        setActiveId(neighbor.id);
      }
      shelfRef.current.delete(id);
      setGalaxies((current) => current.filter((galaxy) => galaxy.id !== id));
      return true;
    },
    [galaxies, load],
  );

  // ---------------------------------------------------------------------------
  // Favorites and play counts (by song id, so they are shared by every playlist)
  // ---------------------------------------------------------------------------

  const favoriteIds = useMemo(() => new Set(favorites.map((song) => song.id)), [favorites]);

  const toggleFavorite = useCallback((song: Song) => {
    setFavorites((current) =>
      current.some((item) => item.id === song.id) ? current.filter((item) => item.id !== song.id) : [toSong(song), ...current],
    );
  }, []);

  const countPlay = useCallback((song: Song) => {
    setPlays((current) => {
      const previous = current.find((entry) => entry.song.id === song.id);
      const updated: PlayCount = { song: toSong(song), plays: (previous?.plays ?? 0) + 1, lastPlayedAt: Date.now() };
      return [updated, ...current.filter((entry) => entry !== previous)].slice(0, MAX_COUNTED_SONGS);
    });
  }, []);

  /** Most played songs, taken from a max-heap: more plays first, the latest play breaks ties. */
  const topPlayed = useMemo(
    () => topK(plays, TOP_SIZE, (a, b) => a.plays - b.plays || a.lastPlayedAt - b.lastPlayedAt),
    [plays],
  );

  return {
    galaxies,
    activeId,
    canCreateGalaxy: galaxies.length < MAX_GALAXIES,
    switchGalaxy,
    createGalaxy,
    renameGalaxy,
    deleteGalaxy,
    favorites,
    favoriteIds,
    toggleFavorite,
    countPlay,
    topPlayed,
  };
}
