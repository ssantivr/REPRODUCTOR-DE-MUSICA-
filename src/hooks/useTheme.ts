"use client";

import { useCallback, useEffect, useState } from "react";
import { THEME_KEY, type Theme } from "@/lib/theme";

/** Light / dark theme: lives in `data-theme` on <html> (the CSS variables hang from it) and is remembered in the browser. */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>("dark");

  // The inline script of the layout already applied the saved theme: just read it back
  useEffect(() => {
    if (document.documentElement.dataset.theme === "light") setTheme("light");
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private mode or storage blocked: the theme still changes for this visit
    }
    setTheme(next);
  }, []);

  return { theme, toggleTheme };
}
