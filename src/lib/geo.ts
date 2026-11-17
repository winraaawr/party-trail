export type LatLng = { lat: number; lng: number };

export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m: number): string {
  if (m < 50) return "right here";
  if (m < 1000) return `${Math.round(m / 10) * 10} m away`;
  if (m < 10000) return `${(m / 1000).toFixed(1)} km away`;
  return `${Math.round(m / 1000)} km away`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** A location older than this is shown as stale rather than live. */
export const STALE_MS = 15 * 60 * 1000;

export type PlaceResult = { name: string; detail: string; lat: number; lng: number };

/**
 * Place search through OpenStreetMap Nominatim. Free, no key; the usage policy
 * asks for at most one request per second, so callers debounce.
 */
export async function searchPlaces(query: string, near?: LatLng, signal?: AbortSignal): Promise<PlaceResult[]> {
  const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "6", addressdetails: "0" });
  if (near) {
    const d = 0.5;
    params.set("viewbox", `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    signal,
    headers: { "Accept-Language": navigator.language || "en" },
  });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const rows = (await res.json()) as { display_name: string; name?: string; lat: string; lon: string }[];
  return rows.map((r) => {
    const parts = r.display_name.split(", ");
    return {
      name: r.name || parts[0],
      detail: parts.slice(r.name ? 1 : 1, 4).join(", "),
      lat: Number(r.lat),
      lng: Number(r.lon),
    };
  });
}

export async function reversePlace(p: LatLng, signal?: AbortSignal): Promise<string | null> {
  try {
    const params = new URLSearchParams({ lat: String(p.lat), lon: String(p.lng), format: "jsonv2", zoom: "17" });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, { signal });
    if (!res.ok) return null;
    const r = (await res.json()) as { name?: string; display_name?: string };
    return r.name || r.display_name?.split(", ").slice(0, 2).join(", ") || null;
  } catch {
    return null;
  }
}

export function formatWhen(iso: string): { day: string; time: string; clock: string; period: string } {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).formatToParts(d);
  const period = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  const clock = parts
    .filter((p) => p.type !== "dayPeriod")
    .map((p) => p.value)
    .join("")
    .trim();
  return {
    day: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }),
    time: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    clock,
    period,
  };
}

export function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const s = new Date(`${start}T00:00:00`).toLocaleDateString(undefined, opts);
  if (!end || end === start) return s;
  const e = new Date(`${end}T00:00:00`).toLocaleDateString(undefined, opts);
  return `${s} – ${e}`;
}

/** Convert a Date to the value a <input type="datetime-local"> expects. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
