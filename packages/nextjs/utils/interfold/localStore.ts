"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let version = 0;
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/**
 * Bumps on every writeJson, so every component reading the same localStorage key re-renders
 * together (the Fleet page reads one owner's labels in the list and in the guide). -1 during
 * server rendering and hydration, when localStorage must not be read.
 */
export const useLocalStoreVersion = () =>
  useSyncExternalStore(
    subscribe,
    () => version,
    () => -1,
  );

export const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

export const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota: subscribers still re-read, and get the old value */
  }
  version++;
  listeners.forEach(fn => fn());
};
