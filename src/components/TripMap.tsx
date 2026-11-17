"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { STALE_MS, formatWhen, timeAgo, type LatLng } from "@/lib/geo";
import { KIND_ICON, colorFor, heroSvg, iconSvg } from "@/lib/sprites";
import type { ItineraryItem, Member, MemberLocation, Stay } from "@/lib/types";

export type MapFocus = { lat: number; lng: number; zoom?: number; nonce: number };

type Props = {
  meId: string;
  members: Member[];
  locations: Record<string, MemberLocation>;
  items: ItineraryItem[];
  stays: Stay[];
  nextItemId: string | null;
  focus: MapFocus | null;
  picking: boolean;
  picked: LatLng | null;
  onPick: (p: LatLng) => void;
  dark: boolean;
};

const iconCache = new Map<string, L.DivIcon>();
function divIcon(key: string, make: () => L.DivIconOptions): L.DivIcon {
  let icon = iconCache.get(key);
  if (!icon) {
    icon = L.divIcon({ className: "mk", ...make() });
    iconCache.set(key, icon);
  }
  return icon;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function memberIcon(m: Member, isMe: boolean, stale: boolean) {
  const first = isMe ? "You" : m.display_name.split(" ")[0];
  return divIcon(`m:${m.user_id}:${first}:${isMe}:${stale}`, () => ({
    html: `<div class="mk-member${isMe ? " mk-me" : ""}${stale ? " is-stale" : ""}" style="--tag:${colorFor(m.user_id)}"><div class="mk-sprite">${heroSvg(m.user_id, 3)}</div><span class="mk-tag">${escapeHtml(first)}</span></div>`,
    iconSize: [60, 56],
    iconAnchor: [30, 38],
    popupAnchor: [0, -36],
  }));
}

function stopIcon(n: number, state: "next" | "past" | "future") {
  return divIcon(`s:${n}:${state}`, () => ({
    html: `<div class="mk-stop${state === "next" ? " is-next" : state === "past" ? " is-past" : ""}">${n}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  }));
}

const innIcon = () =>
  divIcon("inn", () => ({
    html: `<div class="mk-inn">${iconSvg("inn", 20)}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  }));

const pickIcon = () =>
  divIcon("pick", () => ({
    html: `<div class="mk-pick">${iconSvg("pin", 32)}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 30],
  }));

function FocusController({ focus }: { focus: MapFocus | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    map.flyTo([focus.lat, focus.lng], focus.zoom ?? Math.max(map.getZoom(), 15), { duration: 0.8 });
  }, [focus, map]);
  return null;
}

function FitOnce({ points }: { points: LatLng[] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || points.length === 0) return;
    done.current = true;
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 14);
    else {
      // On phones the bottom sheet covers roughly half the map; fit above it.
      const sheet = window.matchMedia("(max-width: 760px)").matches ? Math.round(window.innerHeight * 0.46) : 0;
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), {
        paddingTopLeft: [48, 48],
        paddingBottomRight: [48, 48 + sheet],
        maxZoom: 15,
      });
    }
  }, [points, map]);
  return null;
}

function PickHandler({ picking, onPick }: { picking: boolean; onPick: (p: LatLng) => void }) {
  const map = useMapEvents({
    click(e) {
      if (picking) onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  useEffect(() => {
    map.getContainer().classList.toggle("is-picking", picking);
  }, [picking, map]);
  return null;
}

/** Leaflet measures its box once; re-measure when the panel resizes. */
function SizeWatcher() {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

export default function TripMap(props: Props) {
  const { meId, members, locations, items, stays, nextItemId, focus, picking, picked, onPick, dark } = props;
  const now = Date.now();

  const routed = useMemo(() => items.filter((i) => i.lat != null && i.lng != null), [items]);
  const nextIdx = routed.findIndex((i) => i.id === nextItemId);
  // Walked part of the trail is muted; the road ahead is dashed ember.
  const toLine = (list: ItineraryItem[]) => list.map((i) => [i.lat!, i.lng!] as [number, number]);
  const pastLine = toLine(nextIdx === -1 ? routed : routed.slice(0, nextIdx + 1));
  const aheadLine = toLine(nextIdx === -1 ? [] : routed.slice(nextIdx));

  const initialPoints = useMemo<LatLng[]>(() => {
    const pts: LatLng[] = [];
    Object.values(locations).forEach((l) => pts.push(l));
    stays.forEach((s) => pts.push(s));
    routed.forEach((i) => pts.push({ lat: i.lat!, lng: i.lng! }));
    return pts;
    // only the first non-empty set matters (FitOnce)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routed.length > 0, stays.length > 0, Object.keys(locations).length > 0]);

  // Standard 256px tiles drawn at 512px: the basemap itself becomes pixel art.
  // OpenStreetMap's own tiles: no key or account. Night mode is a CSS filter
  // on the tile pane (see --map-filter), so one tile set serves both themes.
  const tiles = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

  return (
    <MapContainer center={[20, 0]} zoom={2} zoomControl minZoom={3} worldCopyJump className="map">
      <TileLayer
        key={tiles}
        url={tiles}
        tileSize={512}
        zoomOffset={-1}
        maxZoom={19}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <SizeWatcher />
      <FitOnce points={initialPoints} />
      <FocusController focus={focus} />
      <PickHandler picking={picking} onPick={onPick} />

      {pastLine.length > 1 && (
        <Polyline positions={pastLine} pathOptions={{ color: "#6b5f78", weight: 4, dashArray: "6 10", lineCap: "butt", opacity: 0.7 }} />
      )}
      {aheadLine.length > 1 && (
        <Polyline positions={aheadLine} pathOptions={{ color: "#d4592a", weight: 5, dashArray: "10 8", lineCap: "butt" }} />
      )}

      {stays.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={innIcon()} zIndexOffset={100}>
          <Popup>
            <strong>{s.name}</strong>
            {s.address && <div>{s.address}</div>}
            {(s.check_in || s.check_out) && (
              <div>
                {s.check_in ?? "?"} → {s.check_out ?? "?"}
              </div>
            )}
          </Popup>
        </Marker>
      ))}

      {routed.map((it, i) => {
        const state = it.id === nextItemId ? "next" : new Date(it.starts_at).getTime() < now ? "past" : "future";
        const w = formatWhen(it.starts_at);
        return (
          <Marker key={it.id} position={[it.lat!, it.lng!]} icon={stopIcon(i + 1, state)} zIndexOffset={state === "next" ? 400 : 200}>
            <Popup>
              <strong>{it.title}</strong>
              <div>
                <span dangerouslySetInnerHTML={{ __html: iconSvg(KIND_ICON[it.kind], 10) }} /> {w.day}, {w.time}
              </div>
              {it.place_name && <div>{it.place_name}</div>}
            </Popup>
          </Marker>
        );
      })}

      {members.map((m) => {
        const l = locations[m.user_id];
        if (!l) return null;
        const stale = now - new Date(l.updated_at).getTime() > STALE_MS;
        return (
          <Marker
            key={m.user_id}
            position={[l.lat, l.lng]}
            icon={memberIcon(m, m.user_id === meId, stale)}
            zIndexOffset={m.user_id === meId ? 1000 : 600}
          >
            <Popup>
              <strong>{m.user_id === meId ? "You" : m.display_name}</strong>
              <div>Updated {timeAgo(l.updated_at)}</div>
            </Popup>
          </Marker>
        );
      })}

      {picked && <Marker position={[picked.lat, picked.lng]} icon={pickIcon()} interactive={false} zIndexOffset={2000} />}
    </MapContainer>
  );
}
