"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { distanceMeters } from "./geo";
import type { ItineraryItem } from "./types";

function readPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
function writePref(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? "1" : "0");
  } catch {
    /* storage unavailable: preference lasts for this visit only */
  }
}

export function usePref(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  // Read storage on first render so a saved "off" never flashes on (and never
  // triggers a location prompt). These hooks only run in the browser.
  const [value, setValue] = useState(() => (typeof window === "undefined" ? fallback : readPref(key, fallback)));
  useEffect(() => setValue(readPref(key, fallback)), [key, fallback]);
  const set = useCallback(
    (v: boolean) => {
      setValue(v);
      writePref(key, v);
    },
    [key],
  );
  return [value, set];
}

// ─── Live location ───────────────────────────────────────────────────────────

const MIN_INTERVAL_MS = 15_000;
const MIN_MOVE_M = 25;

export type ShareState = "off" | "starting" | "on" | "denied" | "unavailable";

/**
 * Watches the device position while `enabled` and publishes it, throttled to
 * one write per 15 s unless the traveler moved more than 25 m.
 */
export function useLocationSharing(
  enabled: boolean,
  publish: (p: { lat: number; lng: number; accuracy: number | null }) => Promise<void>,
  simulate?: { lat: number; lng: number },
): ShareState {
  const [state, setState] = useState<ShareState>("off");
  const lastSent = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const publishRef = useRef(publish);
  publishRef.current = publish;

  useEffect(() => {
    if (!enabled) {
      setState("off");
      lastSent.current = null;
      return;
    }
    if (simulate) {
      setState("on");
      publishRef.current({ ...simulate, accuracy: 10 }).catch(() => {});
      return;
    }
    if (!("geolocation" in navigator)) {
      setState("unavailable");
      return;
    }
    setState("starting");
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setState("on");
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null };
        const prev = lastSent.current;
        const now = Date.now();
        if (prev && now - prev.at < MIN_INTERVAL_MS && distanceMeters(prev, p) < MIN_MOVE_M) return;
        lastSent.current = { at: now, lat: p.lat, lng: p.lng };
        publishRef.current(p).catch(() => {
          lastSent.current = null;
        });
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
    // simulate is a stable demo constant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return state;
}

// ─── Itinerary reminders ─────────────────────────────────────────────────────

export const LEAD_MINUTES = 30;

export type Reminder = { key: string; item: ItineraryItem; text: string };

function firedSet(storageKey: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(storageKey) ?? "[]"));
  } catch {
    return new Set();
  }
}

/**
 * Checks the itinerary every 20 s. Fires once when a stop is 30 minutes out
 * and once when it starts: always in-app, and as a system notification when
 * the traveler has allowed them. Works while the app is open in a tab.
 */
export function useReminders(
  tripId: string,
  items: ItineraryItem[],
  systemEnabled: boolean,
  onReminder: (r: Reminder) => void,
) {
  const cb = useRef(onReminder);
  cb.current = onReminder;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const storageKey = `pt:fired:${tripId}`;
    const fired = firedSet(storageKey);

    const check = () => {
      const now = Date.now();
      for (const item of itemsRef.current) {
        const start = new Date(item.starts_at).getTime();
        const mins = Math.round((start - now) / 60000);
        let stage: "lead" | "start" | null = null;
        if (start > now && start - now <= LEAD_MINUTES * 60000) stage = "lead";
        if (start <= now && now - start < 5 * 60000) stage = "start";
        if (!stage) continue;
        const key = `${item.id}:${stage}:${item.starts_at}`;
        if (fired.has(key)) continue;
        fired.add(key);
        const where = item.place_name ? ` at ${item.place_name}` : "";
        const text = stage === "lead" ? `${item.title} starts in ${mins} min${where}` : `${item.title} is starting now${where}`;
        cb.current({ key, item, text });
        if (systemEnabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            new Notification("Party Trail", { body: text, tag: key, icon: undefined });
          } catch {
            /* some mobile browsers only allow notifications from a service worker */
          }
        }
      }
      try {
        localStorage.setItem(storageKey, JSON.stringify([...fired].slice(-200)));
      } catch {
        /* ignore */
      }
    };

    check();
    const t = window.setInterval(check, 20_000);
    return () => window.clearInterval(t);
  }, [tripId, systemEnabled]);
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

/** Re-render on an interval so relative times ("3 min ago") stay current. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}
