"use client";

import { cn } from "cn";
import { useEffect, useState } from "react";

import { SPINNER_VERBS } from "@/lib/ai/verbs";
import { useMediaQuery } from "@/lib/use-media-query";

/** The glyph grows and shrinks, like Claude Code's spinner. */
const FRAMES = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];
const FRAME_MS = 120;

function elapsedLabel(seconds: number) {
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * While the assistant works on a reply: a spinner, a verb picked for this reply, and the time
 * so far. `hidden` keeps it running out of sight, so it picks up where it was.
 */
export function WorkingIndicator({ hidden = false }: { hidden?: boolean }) {
  const [verb] = useState(() => SPINNER_VERBS[Math.floor(Math.random() * SPINNER_VERBS.length)]);
  const [frame, setFrame] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const still = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    // Timed from the clock, since background tabs slow intervals down.
    const start = performance.now();
    const timer = window.setInterval(() => {
      setFrame((current) => current + 1);
      setSeconds(Math.floor((performance.now() - start) / 1000));
    }, FRAME_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <p className={cn("items-center gap-2 text-sm", hidden ? "hidden" : "flex")}>
      <span aria-hidden className="inline-block w-4 text-center leading-none text-primary">
        {still ? "✻" : FRAMES[frame % FRAMES.length]}
      </span>
      <span className="text-shimmer">{verb}…</span>
      <span aria-hidden className="text-xs text-muted-foreground tabular-nums">
        ({elapsedLabel(seconds)})
      </span>
    </p>
  );
}
