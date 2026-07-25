"use client";

import { useEffect } from "react";

import { getReducedMotionOverride } from "@/lib/preferences";

/** Applies stored local display preferences on first paint. Renders
 * nothing — this is a side-effect-only component. */
export function PreferencesInit() {
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = getReducedMotionOverride()
      ? "true"
      : "false";
  }, []);

  return null;
}
