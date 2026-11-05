"use client";

import { useEffect, useState } from "react";

export type ThemePref = "auto" | "light" | "dark";
import { THEME_KEY as KEY } from "./boot";

export function useTheme(): [ThemePref, (t: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>("auto");
  useEffect(() => {
    try {
      const t = localStorage.getItem(KEY);
      if (t === "light" || t === "dark") setPref(t);
    } catch {}
  }, []);
  const set = (t: ThemePref) => {
    setPref(t);
    try {
      if (t === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {}
    if (t === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  };
  return [pref, set];
}
