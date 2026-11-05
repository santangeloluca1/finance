"use client";

import { useEffect, useState } from "react";

export type ThemePref = "auto" | "light" | "dark";
const KEY = "portafoglio:theme";

/** Script eseguito prima dell'idratazione per evitare il lampo di tema sbagliato. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

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
