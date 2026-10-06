"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { PlayCount } from "@/hooks/useLibrary";
import type { StepLabel } from "@/hooks/usePlaylist";
import type { AvlTree } from "@/lib/AvlTree";
import type { HashTable } from "@/lib/HashTable";
import type { Track } from "@/types/music";
import AvlView, { type Rotation } from "./AvlView";
import HashView from "./HashView";
import HeapView from "./HeapView";
import PointerLab from "./PointerLab";
import StacksView from "./StacksView";

interface StructuresPanelProps {
  tracks: Track[];
  tempoTree: AvlTree<unknown>;
  rotations: Rotation[];
  plays: PlayCount[];
  nodeTable: HashTable<unknown>;
  undoSteps: StepLabel[];
  redoSteps: StepLabel[];
  accent: string;
  onUndo: () => void;
  onRedo: () => void;
}

type Tab = "pointers" | "tree" | "heap" | "hash" | "stacks";

const TABS: [Tab, string, string][] = [
  ["pointers", "Punteros", "Lista doble, paso a paso"],
  ["tree", "Árbol", "Árbol AVL: las canciones por tempo"],
  ["heap", "Montículo", "Montículo: las más escuchadas"],
  ["hash", "Tabla", "Tabla hash: de la canción a su nodo"],
  ["stacks", "Pilas", "Pilas: deshacer y rehacer"],
];

/** The structures behind the player, drawn live. Each tab reads the real structure the app is using. */
export default function StructuresPanel(props: StructuresPanelProps) {
  const { tracks, accent } = props;
  const [tab, setTab] = useState<Tab>("pointers");
  const subtitle = TABS.find(([id]) => id === tab)?.[2];

  return (
    <div className="flex max-h-[min(36rem,calc(100dvh-14rem))] flex-col gap-3">
      <div className="pr-6">
        <h2 className="text-sm font-semibold text-white">Estructuras por dentro</h2>
        <p className="text-[11px] text-white/45">{subtitle}</p>
      </div>

      <div className="flex rounded-full bg-white/5 p-0.5 text-[11px]" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className="relative flex-1 whitespace-nowrap rounded-full px-1.5 py-1 font-medium transition"
            style={{ color: tab === id ? "#05030f" : "rgba(255,255,255,0.6)" }}
          >
            {tab === id && <motion.span layoutId="structures-tab" className="absolute inset-0 rounded-full" style={{ background: accent }} />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="scroll-thin -mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
        {tab === "pointers" && <PointerLab tracks={tracks} accent={accent} />}
        {tab === "tree" && <AvlView tree={props.tempoTree} rotations={props.rotations} accent={accent} />}
        {tab === "heap" && <HeapView plays={props.plays} accent={accent} />}
        {tab === "hash" && <HashView table={props.nodeTable} tracks={tracks} accent={accent} />}
        {tab === "stacks" && (
          <StacksView undoSteps={props.undoSteps} redoSteps={props.redoSteps} accent={accent} onUndo={props.onUndo} onRedo={props.onRedo} />
        )}
      </motion.div>
    </div>
  );
}
