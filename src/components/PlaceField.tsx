"use client";

import { useEffect, useId, useRef, useState } from "react";
import { reversePlace, searchPlaces, type LatLng, type PlaceResult } from "@/lib/geo";
import { Icon } from "./Icon";

export type Place = { name: string; lat: number; lng: number };

export type MapPicker = {
  /** Put the map in pick mode; `cb` receives the clicked point. */
  request(cb: (p: LatLng) => void): void;
  cancel(): void;
  /** Show (or clear) the pending point on the map. */
  preview(p: LatLng | null): void;
  picking: boolean;
  near: LatLng | null;
};

export function PlaceField({
  label,
  value,
  onChange,
  picker,
  required,
}: {
  label: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  picker: MapPicker;
  required?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [state, setState] = useState<"idle" | "searching" | "error" | "empty">("idle");
  const timer = useRef<number>(undefined);
  const abort = useRef<AbortController>(undefined);

  useEffect(() => {
    picker.preview(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => picker.preview(null), []);

  useEffect(() => {
    window.clearTimeout(timer.current);
    abort.current?.abort();
    if (query.trim().length < 3) {
      setResults([]);
      setState("idle");
      return;
    }
    timer.current = window.setTimeout(async () => {
      const ctrl = new AbortController();
      abort.current = ctrl;
      setState("searching");
      try {
        const r = await searchPlaces(query.trim(), picker.near ?? undefined, ctrl.signal);
        setResults(r);
        setState(r.length ? "idle" : "empty");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setState("error");
      }
    }, 650);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const choose = (p: Place) => {
    onChange(p);
    setQuery("");
    setResults([]);
  };

  const pickOnMap = () =>
    picker.request(async (p) => {
      onChange({ name: "Dropped pin", ...p });
      const name = await reversePlace(p);
      if (name) onChange({ name, ...p });
    });

  if (value) {
    return (
      <div className="field">
        <span>{label}</span>
        <div className="picked">
          <Icon name="pin" />
          <span className="picked-name">{value.name}</span>
          <button type="button" className="link-btn" onClick={() => onChange(null)}>
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
        {required ? "" : " (optional)"}
      </label>
      <input
        id={id}
        className="input"
        type="search"
        autoComplete="off"
        placeholder="Search a place or address"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-describedby={`${id}-hint`}
      />
      <div className="place-tools" id={`${id}-hint`}>
        <button type="button" className="link-btn" onClick={pickOnMap}>
          {picker.picking ? "Tap the map…" : "Pick on map"}
        </button>
        {state === "searching" && <small className="loading-dots">Searching</small>}
        {state === "empty" && <small>No places match “{query}”. Try a street or landmark, or pick on the map.</small>}
        {state === "error" && <small className="form-error">Place search is unavailable. Pick the spot on the map instead.</small>}
      </div>
      {results.length > 0 && (
        <ul className="place-results" role="listbox" aria-label="Places">
          {results.map((r, i) => (
            <li key={`${r.lat},${r.lng},${i}`}>
              <button type="button" onClick={() => choose({ name: r.name, lat: r.lat, lng: r.lng })}>
                {r.name}
                {r.detail && <small>{r.detail}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
