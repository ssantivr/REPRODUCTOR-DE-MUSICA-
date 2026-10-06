import type { VisualMode } from "@/types/music";

export interface ModeMeta {
  id: VisualMode;
  /** Spanish label shown in the interface */
  label: string;
  /** Spanish hint shown under the mode switcher */
  hint: string;
  accent: string;
  /** Darker shade of the accent, readable as text over the light theme */
  accentOnLight: string;
}

export const MODES: ModeMeta[] = [
  { id: "universe", label: "Universo", hint: "Las canciones orbitan: más energía, órbita más amplia; más tempo, giro más rápido", accent: "#ff4df0", accentOnLight: "#c026d3" },
  { id: "flow", label: "Flujo", hint: "La lista como un río: los pulsos viajan hacia adelante y hacia atrás", accent: "#22d3ee", accentOnLight: "#0891b2" },
  { id: "night", label: "Noche", hint: "Constelaciones tenues y un sonido más suave", accent: "#cbd5e1", accentOnLight: "#64748b" },
  { id: "energy", label: "Energía/Calma", hint: "Mapa: a la derecha más rápido, arriba más energía", accent: "#fb7185", accentOnLight: "#e11d48" },
];

export const MODE_BY_ID: Record<VisualMode, ModeMeta> = Object.fromEntries(
  MODES.map((mode) => [mode.id, mode]),
) as Record<VisualMode, ModeMeta>;
