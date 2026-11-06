"use client";

import { useCallback, useEffect, useState } from "react";

/** Conversazioni con Minerva, salvate su questo dispositivo. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Messaggio citato quando si risponde a una risposta. */
  replyTo?: { id: string; excerpt: string };
  /** Domande di seguito proposte da Minerva. */
  followUps?: string[];
  at: string;
}

export interface Thread {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

const KEY = "portafoglio:chats:v1";
const listeners = new Set<() => void>();

export function readThreads(): Thread[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Thread[];
  } catch {
    return [];
  }
}

export function writeThread(t: Thread) {
  const all = [t, ...readThreads().filter((x) => x.id !== t.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 40);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
  listeners.forEach((l) => l());
}

export function deleteThread(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(readThreads().filter((x) => x.id !== id)));
  } catch {}
  listeners.forEach((l) => l());
}

export function useThreads() {
  const [list, setList] = useState<Thread[]>([]);
  const refresh = useCallback(() => setList(readThreads()), []);
  useEffect(() => {
    refresh();
    listeners.add(refresh);
    return () => {
      listeners.delete(refresh);
    };
  }, [refresh]);
  return list;
}

export const msgId = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Separa il testo dalle domande di seguito ("§§ a | b | c" in fondo). */
export function splitFollowUps(text: string): { text: string; followUps: string[] } {
  const i = text.lastIndexOf("§§");
  if (i < 0) return { text, followUps: [] };
  const followUps = text
    .slice(i + 2)
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .slice(0, 3);
  return { text: text.slice(0, i).trimEnd(), followUps };
}

/** Messaggio dell'utente come lo vede il modello: con la citazione se risponde a qualcosa. */
export function toModelText(m: ChatMessage) {
  return m.replyTo ? `> ${m.replyTo.excerpt}\n\n${m.text}` : m.text;
}
