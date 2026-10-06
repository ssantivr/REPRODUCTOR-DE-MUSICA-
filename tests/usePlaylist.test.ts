// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PLAYLIST_FILE_FORMAT, usePlaylist } from "../src/hooks/usePlaylist";
import { CATALOG } from "../src/lib/catalog";
import { mulberry32 } from "../src/lib/utils";

const UNDO_CAPACITY = 30;
const pick = (random: () => number, size: number) => Math.floor(random() * size);
const mount = (songs = CATALOG.slice(0, 6)) => renderHook(() => usePlaylist(songs)).result;
const uidsOf = (result: ReturnType<typeof mount>) => result.current.tracks.map((track) => track.uid);

describe("usePlaylist: undo and redo", () => {
  /**
   * Model-based: the hook stores every step as an inverse operation, the model
   * stores whole snapshots of the order. Both must agree after every action.
   */
  it("inverse operations restore exactly the order a snapshot would", () => {
    const random = mulberry32(41);
    const result = mount();
    let order = uidsOf(result);
    let undo: string[][] = [];
    let redo: string[][] = [];

    const changed = () => {
      const now = uidsOf(result);
      if (now.join() === order.join()) return;
      undo = [...undo, order].slice(-UNDO_CAPACITY);
      redo = [];
      order = now;
    };

    for (let step = 0; step < 500; step++) {
      const action = pick(random, 8);
      const length = order.length;
      act(() => {
        const playlist = result.current;
        if (action === 0) playlist.add(CATALOG[pick(random, CATALOG.length)], "append");
        else if (action === 1) playlist.add(CATALOG[pick(random, CATALOG.length)], "prepend");
        else if (action === 2) playlist.add(CATALOG[pick(random, CATALOG.length)], "insertAt", pick(random, length + 1));
        else if (action === 3 && length > 0) playlist.remove(pick(random, length));
        else if (action === 4 && length > 1) playlist.move(pick(random, length), pick(random, length));
        else if (action === 5) playlist.shuffleOrder();
        else if (action === 6) {
          const previous = undo[undo.length - 1];
          expect(playlist.undo()).toBe(previous !== undefined);
          if (previous) {
            undo = undo.slice(0, -1);
            redo = [...redo, order];
            order = previous;
          }
        } else if (action === 7) {
          const following = redo[redo.length - 1];
          expect(playlist.redo()).toBe(following !== undefined);
          if (following) {
            redo = redo.slice(0, -1);
            undo = [...undo, order];
            order = following;
          }
        }
      });
      if (action < 6) changed();

      const playlist = result.current;
      expect(uidsOf(result)).toEqual(order);
      expect(playlist.canUndo).toBe(undo.length > 0);
      expect(playlist.canRedo).toBe(redo.length > 0);
      // The cursor always sits on a song of the list
      expect(playlist.currentTrack).toBe(playlist.tracks[playlist.currentIndex] ?? null);
      expect(playlist.currentTrack === null).toBe(order.length === 0);
      // The uid → node table follows every change
      order.forEach((uid, index) => expect(playlist.indexOfUid(uid)).toBe(index));
    }
  });

  it("undoing keeps the song that is playing", () => {
    const result = mount();
    act(() => void result.current.playAt(3));
    const playing = result.current.currentTrack?.uid;
    act(() => void result.current.add(CATALOG[10], "prepend"));
    act(() => void result.current.shuffleOrder());
    act(() => void result.current.undo());
    act(() => void result.current.undo());
    expect(result.current.currentTrack?.uid).toBe(playing);
    expect(result.current.currentIndex).toBe(3);
  });

  it("an import can be undone and a file with another format is rejected", () => {
    const result = mount();
    const before = uidsOf(result);
    let file = "";
    act(() => void (file = result.current.exportPlaylist()));
    expect(JSON.parse(file).format).toBe(PLAYLIST_FILE_FORMAT);

    act(() => void result.current.remove(0));
    act(() => expect(result.current.importPlaylist(file)).toBe(true));
    expect(result.current.tracks.map((track) => track.id)).toEqual(CATALOG.slice(0, 6).map((song) => song.id));
    act(() => void result.current.undo());
    expect(uidsOf(result)).toEqual(before.slice(1));

    act(() => expect(result.current.importPlaylist('{"format":"otro"}')).toBe(false));
    act(() => expect(result.current.importPlaylist("no es json")).toBe(false));
    expect(uidsOf(result)).toEqual(before.slice(1));
  });
});

describe("usePlaylist: shuffle mode", () => {
  it("no song repeats until every one has sounded, and «previous» walks the jumps back", () => {
    const result = mount();
    const size = result.current.tracks.length;
    act(() => result.current.toggleShuffleMode());

    const heard = [result.current.currentTrack?.uid];
    for (let jump = 1; jump < size; jump++) {
      act(() => void result.current.next());
      heard.push(result.current.currentTrack?.uid);
    }
    expect(new Set(heard).size).toBe(size);

    // A new round starts, and it never repeats the song that just sounded
    act(() => void result.current.next());
    expect(result.current.currentTrack?.uid).not.toBe(heard[size - 1]);

    for (let back = size - 1; back >= 0; back--) {
      act(() => void result.current.prev());
      expect(result.current.currentTrack?.uid).toBe(heard[back]);
    }
  });

  it("the way back skips the songs that left the list", () => {
    const result = mount();
    act(() => result.current.toggleShuffleMode());
    const first = result.current.currentTrack?.uid;
    act(() => void result.current.next());
    const second = result.current.currentTrack?.uid ?? "";
    act(() => void result.current.next());
    act(() => void result.current.remove(result.current.indexOfUid(second)));
    act(() => void result.current.prev());
    expect(result.current.currentTrack?.uid).toBe(first);
  });
});

describe("usePlaylist: queue", () => {
  it("queued songs sound first, in the order they entered", () => {
    const result = mount();
    const [, , third, , fifth] = result.current.tracks;
    act(() => void result.current.enqueue(4));
    act(() => void result.current.enqueue(2));
    expect(result.current.queue.map((track) => track.uid)).toEqual([fifth.uid, third.uid]);

    act(() => void result.current.next());
    expect(result.current.currentTrack?.uid).toBe(fifth.uid);
    act(() => void result.current.next());
    expect(result.current.currentTrack?.uid).toBe(third.uid);
    // Empty queue: back to the normal order, from where the cursor is
    act(() => void result.current.next());
    expect(result.current.currentIndex).toBe(3);
  });

  it("a song removed from the list loses its turn, even through undo", () => {
    const result = mount();
    act(() => void result.current.add(CATALOG[12], "append"));
    act(() => void result.current.enqueue(6));
    act(() => void result.current.enqueue(1));
    act(() => void result.current.undo()); // takes the added song out again
    expect(result.current.queue.map((track) => track.uid)).toEqual([result.current.tracks[1].uid]);
  });

  it("enrich changes only the song with that uid", () => {
    const result = mount();
    const target = result.current.tracks[4];
    const others = result.current.tracks.filter((track) => track !== target);
    act(() => result.current.enrich(target.uid, { youtubeId: "dQw4w9WgXcQ" }));
    act(() => result.current.enrich("no-existe", { youtubeId: "dQw4w9WgXcQ" }));
    expect(result.current.tracks[4]).toEqual({ ...target, youtubeId: "dQw4w9WgXcQ" });
    expect(result.current.tracks.filter((track) => track.uid !== target.uid)).toEqual(others);
  });
});

describe("usePlaylist: loading a saved list", () => {
  it("replaces the list and starts with empty undo, redo and queue", () => {
    const result = mount();
    act(() => void result.current.remove(0));
    act(() => void result.current.enqueue(1));
    const saved = result.current.serialize();
    act(() => expect(result.current.load({ ...saved, items: saved.items.slice(0, 2), currentIndex: 1 })).toBe(true));

    expect(result.current.tracks).toHaveLength(2);
    expect(result.current.currentIndex).toBe(1);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.queue).toEqual([]);
    result.current.tracks.forEach((track, index) => expect(result.current.indexOfUid(track.uid)).toBe(index));
    act(() => expect(result.current.load("basura")).toBe(false));
    expect(result.current.tracks).toHaveLength(2);
  });
});
