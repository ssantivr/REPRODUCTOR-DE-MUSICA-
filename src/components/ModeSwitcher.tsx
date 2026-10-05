"use client";

import { motion } from "framer-motion";
import { MODES } from "@/lib/modes";
import type { VisualMode } from "@/types/music";

interface ModeSwitcherProps {
  mode: VisualMode;
  onChange: (mode: VisualMode) => void;
}

export default function ModeSwitcher({ mode, onChange }: ModeSwitcherProps) {
  return (
    <div className="glass flex max-w-full items-center gap-1 overflow-x-auto rounded-full p-1" role="tablist" aria-label="Modo visual">
      {MODES.map((item, index) => {
        const active = item.id === mode;
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={active}
            title={`${item.hint} (tecla ${index + 1})`}
            onClick={() => onChange(item.id)}
            className="relative shrink-0 rounded-full px-3 py-1.5 text-xs font-medium tracking-wide transition-colors sm:px-4"
            style={{ color: active ? "#05030f" : "rgba(255,255,255,0.7)" }}
          >
            {active && (
              <motion.span
                layoutId="mode-pill"
                className="absolute inset-0 rounded-full"
                style={{ background: item.accent, boxShadow: `0 0 24px ${item.accent}80` }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            )}
            <span className="relative">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
