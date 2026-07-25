"use client";

import { useEffect } from "react";

import { applyTheme, getReducedMotionOverride, getTheme } from "@/lib/preferences";

/** Applies stored local display preferences on first paint. Renders
 * nothing — this is a side-effect-only component.
 *
 * The theme is also applied by a blocking inline script in the layout
 * head (to avoid a flash of the wrong theme); re-applying it here keeps
 * it correct if the OS preference changes while "system" is selected. */
export function PreferencesInit() {
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = getReducedMotionOverride()
      ? "true"
      : "false";

    applyTheme(getTheme());

    // Track the OS theme while "system" is selected, so a light/dark
    // switch in the OS reflects live without a reload.
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (getTheme() === "system") applyTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return null;
}
