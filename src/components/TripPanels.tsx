"use client";

import { useEffect, useMemo, useState } from "react";
import { STALE_MS, distanceMeters, formatDateRange, formatDistance, formatWhen, timeAgo, toLocalInput } from "@/lib/geo";
import { KIND_ICON, KIND_LABEL } from "@/lib/sprites";
import { appUrl } from "@/lib/supabase";
import type { ItemKind, ItineraryItem, Member, MemberLocation, Stay, TripStore } from "@/lib/types";
import { Icon } from "./Icon";
import { PlaceField, type MapPicker, type Place } from "./PlaceField";
import { Avatar } from "./Sprite";

type Focus = (p: { lat: number; lng: number }, zoom?: number) => void;

function errorText(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong. Try again.";
}

/** Two-step remove: first press arms, second press confirms. */
function RemoveButton({ label, onConfirm }: { label: string; onConfirm: () => Promise<void> }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 3500);
    return () => window.clearTimeout(t);
  }, [armed]);
  if (armed) {
    return (
      <button
        type="button"
        className="btn btn--sm btn--danger"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setArmed(false);
          }
        }}
      >
        Remove
      </button>
    );
  }
  return (
    <button type="button" className="btn btn--sm btn--icon btn--quiet" aria-label={label} title={label} onClick={() => setArmed(true)}>
      <Icon name="trash" />
    </button>
  );
}

// ─── Party ───────────────────────────────────────────────────────────────────

export function PartyTab({
  store,
  now,
  onFocus,
  onLeave,
}: {
  store: TripStore;
  now: number;
  onFocus: Focus;
  onLeave: () => void;
}) {
  const { members, locations, me, trip } = store;
  const mine = locations[me.id];
  const [copied, setCopied] = useState(false);
  const inviteLink = trip ? appUrl(`/join/?code=${trip.invite_code}`) : "";

  const sorted = useMemo(() => {
    const rank = (m: Member) => (m.user_id === me.id ? 0 : locations[m.user_id] ? 1 : 2);
    return [...members].sort((a, b) => rank(a) - rank(b) || a.display_name.localeCompare(b.display_name));
  }, [members, locations, me.id]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this invite link", inviteLink);
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: trip?.name, text: `Join “${trip?.name}” on Party Trail`, url: inviteLink });
    } catch {
      /* dismissed */
    }
  };

  return (
    <>
      <section aria-labelledby="party-h">
        <div className="section-head">
          <h2 id="party-h">
            {members.length} {members.length === 1 ? "traveler" : "travelers"}
          </h2>
        </div>
        <ul className="rows">
          {sorted.map((m) => {
            const l: MemberLocation | undefined = locations[m.user_id];
            const isMe = m.user_id === me.id;
            const stale = l ? now - new Date(l.updated_at).getTime() > STALE_MS : false;
            let meta = isMe ? "Location sharing is off" : "Not sharing location";
            if (l) {
              const parts = [stale ? `Last seen ${timeAgo(l.updated_at, now)}` : `Live · ${timeAgo(l.updated_at, now)}`];
              if (!isMe && mine) parts.push(formatDistance(distanceMeters(mine, l)));
              meta = parts.join(" · ");
            }
            return (
              <li key={m.user_id} className="rowi">
                <Avatar seed={m.user_id} />
                <button type="button" className="rowi-main" disabled={!l} onClick={() => l && onFocus(l, 16)}>
                  <span className="rowi-title">
                    {isMe ? `${m.display_name === "You" ? "You" : `${m.display_name} (you)`}` : m.display_name}
                    {m.role === "leader" && <span className="demo-badge">Leader</span>}
                  </span>
                  <span className="rowi-meta">
                    <span className={`status-dot${l ? (stale ? " stale" : " live") : ""}`} aria-hidden="true" />
                    {meta}
                  </span>
                </button>
                {l && (
                  <button
                    type="button"
                    className="btn btn--sm btn--icon"
                    aria-label={`Show ${isMe ? "yourself" : m.display_name} on the map`}
                    title="Show on map"
                    onClick={() => onFocus(l, 16)}
                  >
                    <Icon name="locate" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {trip && (
        <section className="invite px" id="invite" aria-labelledby="invite-h">
          <h2 id="invite-h" className="field-label">
            Invite code
          </h2>
          <div className="invite-code">{trip.invite_code}</div>
          <p>Send the link to friends. They sign in with Google and land straight in this trip.</p>
          <div className="invite-actions">
            <button type="button" className="btn btn--primary" onClick={copy}>
              <Icon name={copied ? "check" : "copy"} />
              {copied ? "Link copied" : "Copy invite link"}
            </button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button type="button" className="btn" onClick={share}>
                <Icon name="mail" />
                Share…
              </button>
            )}
          </div>
        </section>
      )}

      {!store.demo && (
        <div>
          <button type="button" className="link-btn link-btn--danger" onClick={onLeave}>
            Leave this trip
          </button>
        </div>
      )}
    </>
  );
}

// ─── Itinerary ───────────────────────────────────────────────────────────────

function nextFullHour() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

function AddItemForm({ store, picker, onDone }: { store: TripStore; picker: MapPicker; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ItemKind>("activity");
  const [when, setWhen] = useState(() => toLocalInput(nextFullHour()));
  const [place, setPlace] = useState<Place | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError("Give the stop a name.");
    setBusy(true);
    setError(null);
    try {
      await store.addItem({
        title: title.trim(),
        kind,
        starts_at: new Date(when).toISOString(),
        place_name: place?.name ?? null,
        lat: place?.lat ?? null,
        lng: place?.lng ?? null,
        notes: notes.trim() || null,
      });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="add-form px form-grid" onSubmit={submit} aria-label="Add a stop">
      <label className="field">
        <span>What’s happening</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dinner at the night market" autoFocus maxLength={120} />
      </label>
      <div className="form-row form-row--wide">
        <label className="field">
          <span>Type</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as ItemKind)}>
            {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>When</span>
          <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
        </label>
      </div>
      <PlaceField label="Where" value={place} onChange={setPlace} picker={picker} />
      <label className="field">
        <span>Notes (optional)</span>
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Booking ref, meeting point, what to bring" />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Saving…" : "Add to itinerary"}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ItineraryTab({
  store,
  now,
  nextItemId,
  picker,
  onFocus,
}: {
  store: TripStore;
  now: number;
  nextItemId: string | null;
  picker: MapPicker;
  onFocus: Focus;
}) {
  const [adding, setAdding] = useState(false);
  const routedIndex = useMemo(() => {
    const map = new Map<string, number>();
    store.items.filter((i) => i.lat != null).forEach((i, n) => map.set(i.id, n + 1));
    return map;
  }, [store.items]);

  const days = useMemo(() => {
    const groups: { day: string; items: ItineraryItem[] }[] = [];
    for (const it of store.items) {
      const day = formatWhen(it.starts_at).day;
      const g = groups[groups.length - 1];
      if (g && g.day === day) g.items.push(it);
      else groups.push({ day, items: [it] });
    }
    return groups;
  }, [store.items]);

  const todayLabel = formatWhen(new Date(now).toISOString()).day;

  return (
    <>
      <div className="section-head">
        <h2>
          {store.items.length === 0
            ? "Itinerary"
            : `${store.items.length} ${store.items.length === 1 ? "stop" : "stops"} over ${days.length} ${days.length === 1 ? "day" : "days"}`}
        </h2>
        {!adding && (
          <button type="button" className="btn btn--sm btn--primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={12} />
            Add stop
          </button>
        )}
      </div>
      {adding && <AddItemForm store={store} picker={picker} onDone={() => setAdding(false)} />}

      {store.items.length === 0 && !adding && (
        <div className="empty px">
          <p>
            No stops yet. Add the first one — a flight, a dinner, a museum — and everyone gets a reminder 30 minutes before it starts.
          </p>
          <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={12} />
            Add the first stop
          </button>
        </div>
      )}

      {days.map((g) => (
        <section key={g.day} className="day-group" aria-label={g.day}>
          <h3 className="day-label">{g.day === todayLabel ? `Today · ${g.day}` : g.day}</h3>
          <ol className="rows">
            {g.items.map((it) => {
              const start = new Date(it.starts_at).getTime();
              const state = it.id === nextItemId ? "is-next" : start < now ? "is-past" : "";
              const n = routedIndex.get(it.id);
              return (
                <li key={it.id} className={`stop ${state}`}>
                  <span className="stop-time">
                    {formatWhen(it.starts_at).clock}
                    <small>{formatWhen(it.starts_at).period}</small>
                  </span>
                  <span className="stop-marker" aria-hidden="true">
                    {n ? <span className="stop-num">{n}</span> : <Icon name={KIND_ICON[it.kind]} />}
                  </span>
                  <button
                    type="button"
                    className="rowi-main"
                    disabled={it.lat == null}
                    onClick={() => it.lat != null && onFocus({ lat: it.lat, lng: it.lng! }, 16)}
                  >
                    <span className="rowi-title">{it.title}</span>
                    <span className="rowi-meta">
                      <Icon name={KIND_ICON[it.kind]} size={10} /> {KIND_LABEL[it.kind]}
                      {it.place_name ? ` · ${it.place_name}` : ""}
                    </span>
                    {it.notes && <span className="rowi-notes">{it.notes}</span>}
                  </button>
                  <span className="stop-actions">
                    <RemoveButton label={`Remove ${it.title}`} onConfirm={() => store.removeItem(it.id)} />
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </>
  );
}

// ─── Stays ───────────────────────────────────────────────────────────────────

function AddStayForm({ store, picker, onDone }: { store: TripStore; picker: MapPicker; onDone: () => void }) {
  const trip = store.trip;
  const [name, setName] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [checkIn, setCheckIn] = useState(trip?.start_date ?? "");
  const [checkOut, setCheckOut] = useState(trip?.end_date ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!place) return setError("Mark where the stay is: search the address or pick it on the map.");
    setBusy(true);
    setError(null);
    try {
      await store.addStay({
        name: name.trim() || place.name,
        address: place.name,
        lat: place.lat,
        lng: place.lng,
        check_in: checkIn || null,
        check_out: checkOut || null,
        notes: notes.trim() || null,
      });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="add-form px form-grid" onSubmit={submit} aria-label="Add a stay">
      <label className="field">
        <span>Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Hotel, hostel, campsite" autoFocus maxLength={120} />
      </label>
      <PlaceField label="Address" value={place} onChange={setPlace} picker={picker} required />
      <div className="form-row">
        <label className="field">
          <span>Check-in</span>
          <input className="input" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </label>
        <label className="field">
          <span>Check-out</span>
          <input className="input" type="date" value={checkOut} min={checkIn || undefined} onChange={(e) => setCheckOut(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Notes (optional)</span>
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Door code, booking number, who has the key" />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? "Saving…" : "Mark stay"}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function StaysTab({ store, picker, onFocus }: { store: TripStore; picker: MapPicker; onFocus: Focus }) {
  const [adding, setAdding] = useState(false);
  const sorted = useMemo(
    () => [...store.stays].sort((a, b) => (a.check_in ?? "").localeCompare(b.check_in ?? "")),
    [store.stays],
  );
  return (
    <>
      <div className="section-head">
        <h2>Where you’re sleeping</h2>
        {!adding && (
          <button type="button" className="btn btn--sm btn--primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={12} />
            Add stay
          </button>
        )}
      </div>
      {adding && <AddStayForm store={store} picker={picker} onDone={() => setAdding(false)} />}
      {sorted.length === 0 && !adding && (
        <div className="empty px">
          <p>Mark the hotel so nobody has to scroll back through the group chat for the address at 2 a.m.</p>
          <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
            <Icon name="inn" />
            Mark a stay
          </button>
        </div>
      )}
      <ul className="rows">
        {sorted.map((s: Stay) => (
          <li key={s.id} className="rowi">
            <span className="stop-marker stop-marker--inn" aria-hidden="true">
              <Icon name="inn" />
            </span>
            <button type="button" className="rowi-main" onClick={() => onFocus(s, 17)}>
              <span className="rowi-title">{s.name}</span>
              {s.address && s.address !== s.name && <span className="rowi-meta">{s.address}</span>}
              {(s.check_in || s.check_out) && (
                <span className="rowi-meta">{formatDateRange(s.check_in, s.check_out)}</span>
              )}
              {s.notes && <span className="rowi-notes">{s.notes}</span>}
            </button>
            <RemoveButton label={`Remove ${s.name}`} onConfirm={() => store.removeStay(s.id)} />
          </li>
        ))}
      </ul>
    </>
  );
}
