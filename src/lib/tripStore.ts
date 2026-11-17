"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import type {
  Activity,
  ItineraryItem,
  Member,
  MemberLocation,
  NewItem,
  NewStay,
  Stay,
  Trip,
  TripStore,
} from "./types";

const byTime = (a: ItineraryItem, b: ItineraryItem) => a.starts_at.localeCompare(b.starts_at);
let activitySeq = 0;
const activity = (text: string, icon: Activity["icon"]): Activity => ({ id: `a${++activitySeq}`, text, icon });

// ─── Live (Supabase) ─────────────────────────────────────────────────────────

export function useLiveTrip(tripId: string, me: { id: string; name: string }): TripStore {
  const [status, setStatus] = useState<TripStore["status"]>("loading");
  const [error, setError] = useState<string>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [locations, setLocations] = useState<Record<string, MemberLocation>>({});
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [feed, setFeed] = useState<Activity[]>([]);
  const membersRef = useRef<Member[]>([]);
  membersRef.current = members;

  const nameOf = (id: string) => membersRef.current.find((m) => m.user_id === id)?.display_name ?? "Someone";

  const loadMembers = useCallback(async () => {
    const sb = getSupabase();
    const { data: rows, error: e1 } = await sb.from("trip_members").select("user_id, role").eq("trip_id", tripId);
    if (e1) throw e1;
    const ids = (rows ?? []).map((r) => r.user_id as string);
    const { data: profiles, error: e2 } = ids.length
      ? await sb.from("profiles").select("id, display_name, avatar_url").in("id", ids)
      : { data: [], error: null };
    if (e2) throw e2;
    const list: Member[] = (rows ?? []).map((r) => {
      const p = profiles?.find((x) => x.id === r.user_id);
      return {
        user_id: r.user_id,
        role: r.role,
        display_name: p?.display_name ?? "Traveler",
        avatar_url: p?.avatar_url ?? null,
      };
    });
    setMembers(list);
    return list;
  }, [tripId]);

  useEffect(() => {
    const sb = getSupabase();
    let alive = true;

    (async () => {
      try {
        const { data: t, error: te } = await sb.from("trips").select("*").eq("id", tripId).maybeSingle();
        if (te) throw te;
        if (!t) {
          if (alive) setStatus("notfound");
          return;
        }
        const [, loc, it, st] = await Promise.all([
          loadMembers(),
          sb.from("locations").select("*").eq("trip_id", tripId),
          sb.from("itinerary_items").select("*").eq("trip_id", tripId).order("starts_at"),
          sb.from("stays").select("*").eq("trip_id", tripId).order("check_in"),
        ]);
        for (const r of [loc, it, st]) if (r.error) throw r.error;
        if (!alive) return;
        setTrip(t as Trip);
        setLocations(Object.fromEntries((loc.data as MemberLocation[]).map((l) => [l.user_id, l])));
        setItems(it.data as ItineraryItem[]);
        setStays(st.data as Stay[]);
        setStatus("ready");
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    })();

    const filter = `trip_id=eq.${tripId}`;
    const channel = sb
      .channel(`trip:${tripId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "locations", filter }, (p) => {
        const row = (p.new ?? p.old) as MemberLocation;
        setLocations((prev) => {
          const next = { ...prev };
          if (p.eventType === "DELETE") delete next[(p.old as MemberLocation).user_id];
          else next[row.user_id] = p.new as MemberLocation;
          return next;
        });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "itinerary_items", filter },
        (p: RealtimePostgresChangesPayload<ItineraryItem>) => {
          if (p.eventType === "DELETE") {
            setItems((prev) => prev.filter((i) => i.id !== (p.old as ItineraryItem).id));
            return;
          }
          const row = p.new as ItineraryItem;
          setItems((prev) => [...prev.filter((i) => i.id !== row.id), row].sort(byTime));
          if (p.eventType === "INSERT" && row.created_by !== me.id) {
            setFeed((f) => [...f, activity(`${nameOf(row.created_by)} added “${row.title}” to the itinerary`, "flag")]);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stays", filter },
        (p: RealtimePostgresChangesPayload<Stay>) => {
          if (p.eventType === "DELETE") {
            setStays((prev) => prev.filter((s) => s.id !== (p.old as Stay).id));
            return;
          }
          const row = p.new as Stay;
          setStays((prev) => [...prev.filter((s) => s.id !== row.id), row]);
          if (p.eventType === "INSERT" && row.created_by !== me.id) {
            setFeed((f) => [...f, activity(`${nameOf(row.created_by)} marked ${row.name} as a stay`, "inn")]);
          }
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_members", filter }, async (p) => {
        const before = new Set(membersRef.current.map((m) => m.user_id));
        const list = await loadMembers().catch(() => null);
        if (p.eventType === "INSERT" && list) {
          const joined = list.find((m) => !before.has(m.user_id) && m.user_id !== me.id);
          if (joined) setFeed((f) => [...f, activity(`${joined.display_name} joined the party`, "person")]);
        }
      })
      .subscribe();

    return () => {
      alive = false;
      sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, me.id, loadMembers]);

  return useMemo<TripStore>(
    () => ({
      status,
      error,
      demo: false,
      me,
      trip,
      members,
      locations,
      items,
      stays,
      activity: feed,
      async addItem(item: NewItem) {
        const { data, error } = await getSupabase()
          .from("itinerary_items")
          .insert({ ...item, trip_id: tripId })
          .select()
          .single();
        if (error) throw error;
        setItems((prev) => [...prev.filter((i) => i.id !== data.id), data as ItineraryItem].sort(byTime));
      },
      async removeItem(id: string) {
        const { error } = await getSupabase().from("itinerary_items").delete().eq("id", id);
        if (error) throw error;
        setItems((prev) => prev.filter((i) => i.id !== id));
      },
      async addStay(stay: NewStay) {
        const { data, error } = await getSupabase()
          .from("stays")
          .insert({ ...stay, trip_id: tripId })
          .select()
          .single();
        if (error) throw error;
        setStays((prev) => [...prev.filter((s) => s.id !== data.id), data as Stay]);
      },
      async removeStay(id: string) {
        const { error } = await getSupabase().from("stays").delete().eq("id", id);
        if (error) throw error;
        setStays((prev) => prev.filter((s) => s.id !== id));
      },
      async publishLocation(pos) {
        const row = { trip_id: tripId, user_id: me.id, ...pos, updated_at: new Date().toISOString() };
        setLocations((prev) => ({ ...prev, [me.id]: row }));
        const { error } = await getSupabase().from("locations").upsert(row);
        if (error) throw error;
      },
      async clearLocation() {
        setLocations((prev) => {
          const next = { ...prev };
          delete next[me.id];
          return next;
        });
        await getSupabase().from("locations").delete().eq("trip_id", tripId).eq("user_id", me.id);
      },
      async leaveTrip() {
        const sb = getSupabase();
        await sb.from("locations").delete().eq("trip_id", tripId).eq("user_id", me.id);
        const { error } = await sb.from("trip_members").delete().eq("trip_id", tripId).eq("user_id", me.id);
        if (error) throw error;
      },
    }),
    [status, error, me, trip, members, locations, items, stays, feed, tripId],
  );
}

// ─── Demo (in-memory, no backend) ────────────────────────────────────────────

const DEMO_CENTER = { lat: 38.7116, lng: -9.1366 }; // Lisbon, Baixa

function demoSeed(meId: string) {
  const now = new Date();
  const at = (dayOffset: number, h: number, m = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const soon = new Date(now.getTime() + 40 * 60 * 1000).toISOString();
  const today = now.toISOString().slice(0, 10);
  const plus = (n: number) => new Date(now.getTime() + n * 86400000).toISOString().slice(0, 10);

  const trip: Trip = {
    id: "demo",
    name: "Lisbon long weekend",
    destination: "Lisbon, Portugal",
    start_date: plus(-1),
    end_date: plus(2),
    invite_code: "DEMO42",
    created_by: "u-ana",
  };
  const members: Member[] = [
    { user_id: "u-ana", role: "leader", display_name: "Ana Ribeiro", avatar_url: null },
    { user_id: meId, role: "member", display_name: "You", avatar_url: null },
    { user_id: "u-kenji", role: "member", display_name: "Kenji Mori", avatar_url: null },
    { user_id: "u-priya", role: "member", display_name: "Priya Nair", avatar_url: null },
    { user_id: "u-tom", role: "member", display_name: "Tom Okafor", avatar_url: null },
  ];
  const ago = (min: number) => new Date(now.getTime() - min * 60000).toISOString();
  const locations: Record<string, MemberLocation> = {
    "u-ana": { user_id: "u-ana", lat: 38.7139, lng: -9.1334, accuracy: 12, updated_at: ago(0.2) },
    "u-kenji": { user_id: "u-kenji", lat: 38.7105, lng: -9.1427, accuracy: 20, updated_at: ago(1) },
    "u-priya": { user_id: "u-priya", lat: 38.7172, lng: -9.1403, accuracy: 8, updated_at: ago(3) },
    "u-tom": { user_id: "u-tom", lat: 38.6979, lng: -9.2063, accuracy: 30, updated_at: ago(52) },
  };
  const item = (
    id: string,
    title: string,
    kind: ItineraryItem["kind"],
    starts_at: string,
    place_name: string,
    lat: number,
    lng: number,
    notes: string | null = null,
  ): ItineraryItem => ({ id, trip_id: "demo", title, kind, starts_at, place_name, lat, lng, notes, created_by: "u-ana" });

  const items: ItineraryItem[] = [
    item("i1", "Pastéis at Manteigaria", "food", at(0, 9, 0), "Manteigaria Chiado", 38.7107, -9.1428),
    item("i2", "Tram 28 to Alfama", "transport", soon, "Praça Martim Moniz", 38.7163, -9.1357, "Board at the front, it fills fast."),
    item("i3", "Castelo de São Jorge", "sight", at(0, 15, 30), "Castelo de São Jorge", 38.7139, -9.1335),
    item("i4", "Sunset at Miradouro", "sight", at(0, 19, 45), "Miradouro da Senhora do Monte", 38.7191, -9.1325),
    item("i5", "Dinner: Taberna da Rua das Flores", "food", at(0, 21, 0), "Rua das Flores 103", 38.7094, -9.1446),
    item("i6", "Train to Sintra", "transport", at(1, 9, 30), "Rossio station", 38.7142, -9.1409),
    item("i7", "Belém tower & monastery", "sight", at(2, 11, 0), "Torre de Belém", 38.6916, -9.216),
  ].sort(byTime);

  const stays: Stay[] = [
    {
      id: "s1",
      trip_id: "demo",
      name: "Casa do Barão",
      address: "Rua da Emenda 84, Chiado",
      lat: 38.7101,
      lng: -9.1452,
      check_in: plus(-1),
      check_out: plus(2),
      notes: "Door code arrives by text at 14:00.",
      created_by: "u-ana",
    },
  ];
  return { trip, members, locations, items, stays, today };
}

export function useDemoTrip(): TripStore {
  const me = useMemo(() => ({ id: "u-me", name: "You" }), []);
  const seed = useMemo(() => demoSeed(me.id), [me.id]);
  const [locations, setLocations] = useState(seed.locations);
  const [items, setItems] = useState(seed.items);
  const [stays, setStays] = useState(seed.stays);
  const [members, setMembers] = useState(seed.members);
  const [feed, setFeed] = useState<Activity[]>([]);

  // Friends wander a little so the map feels alive.
  useEffect(() => {
    const walkers = ["u-ana", "u-kenji", "u-priya"];
    const t = window.setInterval(() => {
      setLocations((prev) => {
        const next = { ...prev };
        for (const id of walkers) {
          const l = next[id];
          if (!l) continue;
          next[id] = {
            ...l,
            lat: l.lat + (Math.random() - 0.5) * 0.0004,
            lng: l.lng + (Math.random() - 0.5) * 0.0005,
            updated_at: new Date().toISOString(),
          };
        }
        return next;
      });
    }, 4000);
    return () => window.clearInterval(t);
  }, []);

  // Scripted party moments, so notifications can be seen without a backend.
  useEffect(() => {
    const a = window.setTimeout(() => {
      const it: ItineraryItem = {
        id: "i-k1",
        trip_id: "demo",
        title: "Ginjinha shot at A Ginjinha",
        kind: "food",
        starts_at: new Date(Date.now() + 2.5 * 3600000).toISOString(),
        place_name: "Largo de São Domingos 8",
        lat: 38.7146,
        lng: -9.1385,
        notes: null,
        created_by: "u-kenji",
      };
      setItems((prev) => [...prev, it].sort(byTime));
      setFeed((f) => [...f, activity("Kenji Mori added “Ginjinha shot at A Ginjinha” to the itinerary", "flag")]);
    }, 9000);
    const b = window.setTimeout(() => {
      setMembers((prev) =>
        prev.some((m) => m.user_id === "u-lea")
          ? prev
          : [...prev, { user_id: "u-lea", role: "member", display_name: "Léa Martin", avatar_url: null }],
      );
      setLocations((prev) => ({
        ...prev,
        "u-lea": { user_id: "u-lea", lat: 38.7125, lng: -9.1392, accuracy: 15, updated_at: new Date().toISOString() },
      }));
      setFeed((f) => [...f, activity("Léa Martin joined the party", "person")]);
    }, 22000);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, []);

  return useMemo<TripStore>(
    () => ({
      status: "ready",
      demo: true,
      me,
      trip: seed.trip,
      members,
      locations,
      items,
      stays,
      activity: feed,
      async addItem(item) {
        const row: ItineraryItem = { ...item, id: `i${Date.now()}`, trip_id: "demo", created_by: me.id };
        setItems((prev) => [...prev, row].sort(byTime));
      },
      async removeItem(id) {
        setItems((prev) => prev.filter((i) => i.id !== id));
      },
      async addStay(stay) {
        setStays((prev) => [...prev, { ...stay, id: `s${Date.now()}`, trip_id: "demo", created_by: me.id }]);
      },
      async removeStay(id) {
        setStays((prev) => prev.filter((s) => s.id !== id));
      },
      async publishLocation(pos) {
        setLocations((prev) => ({
          ...prev,
          [me.id]: { user_id: me.id, ...pos, updated_at: new Date().toISOString() },
        }));
      },
      async clearLocation() {
        setLocations((prev) => {
          const next = { ...prev };
          delete next[me.id];
          return next;
        });
      },
      async leaveTrip() {},
    }),
    [me, seed.trip, members, locations, items, stays, feed],
  );
}

export const DEMO_START = DEMO_CENTER;
