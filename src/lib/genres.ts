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

/**
 * HSL color for a genre. Night mode desaturates it so it looks like starlight.
 * In the interface the lightness follows the theme through a CSS variable; the
 * canvas cannot read variables, so it says which theme it is painting (`light`).
 */
export function genreColor(genre: Genre, alpha = 1, night = false, light?: boolean): string {
  const { hue } = GENRES[genre];
  if (night) return `hsla(${hue}, 30%, ${light ? "45%" : "80%"}, ${alpha})`;
  const lightness = light === undefined ? "var(--genre-l, 63%)" : light ? "42%" : "63%";
  return `hsla(${hue}, 90%, ${lightness}, ${alpha})`;
}
