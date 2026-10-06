"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { PlaylistEvent, PlaylistEventTone } from "@/types/music";

const TONE_COLOR: Record<PlaylistEventTone, string> = {
  navigate: "#a78bfa",
  add: "#34d399",
  remove: "#fb7185",
  traverse: "#22d3ee",
  warning: "#fbbf24",
};

const VISIBLE_MS = 2800;

/** Floating message describing the last playlist operation. */
export default function EventToast({ event }: { event: PlaylistEvent | null }) {
  const [visible, setVisible] = useState<PlaylistEvent | null>(null);

  useEffect(() => {
    if (!event) return;
    setVisible(event);
    const timer = setTimeout(() => setVisible(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [event]);

  return (
    <div className="pointer-events-none under-header absolute inset-x-0 z-30 flex justify-center px-4 lg:top-24">
      <AnimatePresence mode="wait">
        {visible && (
          <motion.div
            key={visible.id}
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.22 }}
            className="glass flex max-w-md items-center gap-2 rounded-full px-4 py-1.5 text-xs text-white/85"
            role="status"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TONE_COLOR[visible.tone], boxShadow: `0 0 10px ${TONE_COLOR[visible.tone]}` }} />
            <span className="truncate">{visible.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
