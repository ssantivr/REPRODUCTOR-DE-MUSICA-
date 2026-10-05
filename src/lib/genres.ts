import type { Genre } from "@/types/music";

/** `label` is shown in the interface (Spanish); `hue` drives the particle color. */
export const GENRES: Record<Genre, { label: string; hue: number }> = {
  electronic: { label: "Electrónica", hue: 185 },
  rock: { label: "Rock", hue: 355 },
  pop: { label: "Pop", hue: 315 },
  urban: { label: "Urbano", hue: 28 },
  jazz: { label: "Jazz", hue: 50 },
  ambient: { label: "Ambient", hue: 160 },
  classical: { label: "Clásica", hue: 230 },
  indie: { label: "Indie", hue: 270 },
};

export const GENRE_KEYS = Object.keys(GENRES) as Genre[];

/** HSL color for a genre. Night mode desaturates it so it looks like starlight. */
export function genreColor(genre: Genre, alpha = 1, night = false): string {
  const { hue } = GENRES[genre];
  return night ? `hsla(${hue}, 30%, 80%, ${alpha})` : `hsla(${hue}, 90%, 63%, ${alpha})`;
}
