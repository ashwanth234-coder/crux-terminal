"use client";

import { useSyncExternalStore } from "react";

/** Starred launches, kept in this browser only ("v3#0", "v2#2"). */
const KEY = "crux:watchlist";
const listeners = new Set<() => void>();
let cache: string[] | null = null;

function read(): string[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as string[]).filter((k) => typeof k === "string") : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: string[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or full storage: the star still works for this visit.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const NONE: string[] = [];

export function launchKey(version: number, id: number | string) {
  return `v${version}#${id}`;
}

export function useWatchlist() {
  const list = useSyncExternalStore(subscribe, read, () => NONE);
  return {
    list,
    has: (key: string) => list.includes(key),
    toggle: (key: string) => write(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]),
  };
}
