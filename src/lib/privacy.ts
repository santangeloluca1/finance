"use client";

import { useEffect, useState } from "react";

import { PRIVACY_KEY as KEY } from "./boot";

/** Nasconde gli importi (sfocandoli) quando si usa l'app in pubblico. */
export function usePrivacy(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(document.documentElement.dataset.privacy === "on"), []);
  const toggle = () => {
    const next = !on;
    setOn(next);
    if (next) document.documentElement.dataset.privacy = "on";
    else delete document.documentElement.dataset.privacy;
    try {
      localStorage.setItem(KEY, next ? "on" : "off");
    } catch {}
  };
  return [on, toggle];
}
