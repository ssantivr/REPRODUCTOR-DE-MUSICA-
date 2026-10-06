"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AvlTree, type AvlSnapshot } from "@/lib/AvlTree";

export interface Rotation {
  direction: "left" | "right";
  key: number;
}

interface AvlViewProps {
  /** The tree that orders the constellation by tempo */
  tree: AvlTree<unknown>;
  /** Rotations made by the last change of the constellation */
  rotations: Rotation[];
  accent: string;
}

interface Placed {
  key: number;
  count: number;
  balance: number;
  x: number;
  y: number;
  parent: number | null;
}

const COLUMN = 34;
const ROW = 46;
const RADIUS = 13;
const PAD = 22;
const LAB_LIMIT = 31;
const spring = { type: "spring" as const, stiffness: 260, damping: 26 };

/** In-order position gives the column and depth gives the row, so a rotation shows as nodes sliding. */
function place(root: AvlSnapshot | null): Placed[] {
  const placed: Placed[] = [];
  let column = 0;
  const visit = (node: AvlSnapshot | null, depth: number, parent: number | null) => {
    if (!node) return;
    visit(node.left, depth + 1, node.key);
    placed.push({ key: node.key, count: node.count, balance: node.balance, x: PAD + column++ * COLUMN, y: PAD + depth * ROW, parent });
    visit(node.right, depth + 1, node.key);
  };
  visit(root, 0, null);
  return placed;
}

const describe = (rotations: Rotation[]) =>
  rotations.map(({ direction, key }) => `giro a la ${direction === "left" ? "izquierda" : "derecha"} en ${key}`).join(" · ");

/** The AVL tree drawn live, plus a sandbox to insert and remove keys and watch it rebalance. */
export default function AvlView({ tree, rotations, accent }: AvlViewProps) {
  const [lab, setLab] = useState(false);
  const labRef = useRef<AvlTree<number> | null>(null);
  labRef.current ??= new AvlTree<number>();
  const labTree = labRef.current;
  const [labVersion, setLabVersion] = useState(0);
  const [labRotations, setLabRotations] = useState<Rotation[]>([]);
  const [labNote, setLabNote] = useState("Inserta claves y mira cómo se equilibra.");
  const [input, setInput] = useState("");

  const shown = lab ? labTree : tree;
  const shownRotations = lab ? labRotations : rotations;
  // The trees are mutable: every render reads their current shape
  const snapshot = shown.snapshot();
  const placed = place(snapshot);
  const byKey = new Map(placed.map((node) => [node.key, node]));
  const rotated = new Set(shownRotations.map((rotation) => rotation.key));
  const width = PAD * 2 + Math.max(0, placed.length - 1) * COLUMN;
  const height = PAD * 2 + Math.max(0, shown.height - 1) * ROW + 12;

  /** Runs one change on the sandbox tree and keeps the rotations it caused. */
  const change = (label: string, action: () => void) => {
    const made: Rotation[] = [];
    labTree.onRotate = (direction, key) => made.push({ direction, key });
    action();
    labTree.onRotate = null;
    setLabRotations(made);
    setLabNote(made.length > 0 ? `${label}: ${describe(made)}.` : `${label}: no hizo falta girar nada.`);
    setLabVersion((version) => version + 1);
  };

  const keys = placed.map((node) => node.key);
  const insert = (key: number) => {
    if (labTree.size >= LAB_LIMIT && !keys.includes(key)) {
      setLabNote(`El laboratorio admite hasta ${LAB_LIMIT} claves. Quita alguna o vacíalo.`);
      return;
    }
    change(`Insertar ${key}`, () => labTree.insert(key, key));
  };
  const typed = Number.parseInt(input, 10);
  const hasTyped = Number.isInteger(typed) && typed >= 0 && typed <= 999;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex rounded-full bg-white/5 p-0.5 text-[11px]">
        {(
          [
            [false, "Tu constelación (por tempo)"],
            [true, "Laboratorio"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={label}
            onClick={() => setLab(value)}
            aria-pressed={lab === value}
            className="flex-1 rounded-full px-2 py-1 transition"
            style={lab === value ? { background: accent, color: "#05030f" } : { color: "rgba(255,255,255,0.6)" }}
          >
            {label}
          </button>
        ))}
      </div>

      {lab && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <input
            type="number"
            min={0}
            max={999}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && hasTyped) insert(typed);
            }}
            placeholder="Clave"
            aria-label="Clave para insertar o quitar"
            className="w-16 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
          />
          <LabButton onClick={() => insert(typed)} disabled={!hasTyped}>
            Insertar
          </LabButton>
          <LabButton
            onClick={() => change(`Quitar ${typed}`, () => labTree.remove(typed, typed))}
            disabled={!hasTyped || !keys.includes(typed)}
          >
            Quitar
          </LabButton>
          <LabButton onClick={() => insert((keys[keys.length - 1] ?? 0) + 10)} title="Inserta una clave mayor que todas: el peor caso de un árbol sin equilibrar">
            Siguiente en orden
          </LabButton>
          <LabButton onClick={() => insert(Math.floor(Math.random() * 990) + 5)}>Al azar</LabButton>
          <LabButton
            onClick={() => {
              labRef.current = new AvlTree<number>();
              setLabRotations([]);
              setLabNote("Laboratorio vacío.");
              setLabVersion((version) => version + 1);
            }}
            disabled={labTree.size === 0}
          >
            Vaciar
          </LabButton>
        </div>
      )}

      <div className="scroll-thin overflow-x-auto rounded-xl border border-white/5 bg-black/20">
        {placed.length === 0 ? (
          <p className="py-8 text-center text-xs text-white/40">{lab ? "El árbol está vacío." : "La constelación está vacía: no hay tempos que ordenar."}</p>
        ) : (
          <svg width={width} height={height} className="mx-auto block" role="img" aria-label={`Árbol con ${placed.length} claves y altura ${shown.height}`}>
            <AnimatePresence initial={false}>
              {placed.map((node) => {
                const parent = node.parent === null ? undefined : byKey.get(node.parent);
                if (!parent) return null;
                const ends = { x1: parent.x, y1: parent.y, x2: node.x, y2: node.y };
                return (
                  <motion.line
                    key={`edge-${node.key}`}
                    stroke="rgba(255,255,255,0.25)"
                    strokeWidth={1}
                    initial={{ ...ends, opacity: 0 }}
                    animate={{ ...ends, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={spring}
                  />
                );
              })}
              {placed.map((node) => {
                const moved = rotated.has(node.key);
                return (
                  <motion.g
                    key={node.key}
                    initial={{ x: node.x, y: node.y, opacity: 0, scale: 0.3 }}
                    animate={{ x: node.x, y: node.y, opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0 }}
                    transition={spring}
                  >
                    {moved && (
                      // The version is the key: the halo replays on every change that turns this node
                      <motion.circle
                        key={`${lab}-${labVersion}-${shownRotations.length}`}
                        r={RADIUS}
                        fill="none"
                        stroke={accent}
                        strokeWidth={2}
                        initial={{ scale: 1, opacity: 0.9 }}
                        animate={{ scale: 2.1, opacity: 0 }}
                        transition={{ duration: 0.9, ease: "easeOut" }}
                      />
                    )}
                    <circle
                      r={RADIUS}
                      fill={moved ? `${accent}40` : "#0a0818"}
                      stroke={moved ? accent : node.balance === 0 ? "rgba(255,255,255,0.4)" : "rgba(34,211,238,0.8)"}
                      strokeWidth={1.2}
                    />
                    <text textAnchor="middle" y={3.5} fontSize={10} fill="#fff" className="font-mono">
                      {node.key}
                    </text>
                    {node.count > 1 && (
                      <text x={RADIUS + 1} y={-RADIUS + 3} fontSize={8} fill={accent}>
                        ×{node.count}
                      </text>
                    )}
                    <text textAnchor="middle" y={RADIUS + 10} fontSize={8} fill="rgba(255,255,255,0.4)">
                      {node.balance > 0 ? `+${node.balance}` : node.balance}
                    </text>
                  </motion.g>
                );
              })}
            </AnimatePresence>
          </svg>
        )}
      </div>

      <p className="text-[11px] text-white/60" aria-live="polite">
        {lab
          ? labNote
          : rotations.length > 0
            ? `Último cambio de la constelación: ${describe(rotations)}.`
            : "El último cambio de la constelación no necesitó giros."}
      </p>
      <p className="text-[10px] leading-relaxed text-white/35">
        {placed.length} {placed.length === 1 ? "clave" : "claves"} en {shown.height} {shown.height === 1 ? "nivel" : "niveles"}; sin equilibrar, en el peor
        caso serían {placed.length}. El número bajo cada nodo es su balance (niveles a la izquierda menos niveles a la derecha): si pasa de 1, el árbol
        gira. {lab ? "" : "Agrega o quita canciones y mira cómo se reacomoda."}
      </p>
    </div>
  );
}

function LabButton({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-lg bg-white/10 px-2 py-1 text-white/80 transition hover:bg-white/20 hover:text-white disabled:opacity-35"
    >
      {children}
    </button>
  );
}
