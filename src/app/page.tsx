"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Icon } from "@/components/Icon";
import { PixelScene } from "@/components/PixelScene";
import { Avatar } from "@/components/Sprite";
import { formatDateRange } from "@/lib/geo";
import { GoogleButton } from "@/components/GoogleButton";
import { displayNameOf, getSupabase, signOut, useSession } from "@/lib/supabase";
import type { Trip } from "@/lib/types";

export default function Home() {
  const session = useSession();
  if (session.status === "loading") return <div className="center-screen loading-dots">Checking your pack</div>;
  if (session.status === "signedIn") return <TripsHome session={session.session} />;
  return <Landing configured={session.status !== "unconfigured"} />;
}

function Landing({ configured }: { configured: boolean }) {
  return (
    <main className="landing">
      <header className="shell">
        <span className="brand">
          <Icon name="flag" size={22} />
          Party Trail
        </span>
      </header>

      <section className="hero">
        <PixelScene />
        <div className="hero-card px px-lift">
          <h1 className="hero-title">
            Keep the party <em>together.</em>
          </h1>
          <p className="hero-copy">
            One shared map for the trip: where everyone is right now, what’s next on the plan, and the hotel you’re all
            walking back to tonight.
          </p>
          <div className="hero-actions">
            {configured && <GoogleButton returnPath="/" />}
            <Link href="/trip/?id=demo" className="btn">
              Look around a demo trip
            </Link>
          </div>
          {!configured && (
            <p className="notice">
              <Icon name="bell" />
              <span>
                Sign-in isn’t connected yet. Add your Supabase keys to <code>.env.local</code> (see README); the demo trip
                works without them.
              </span>
            </p>
          )}
        </div>
      </section>

      <section className="trail" aria-labelledby="how-h">
        <div className="trail-inner">
          <h2 id="how-h">From group chat to map in a minute</h2>
          <ol className="trail-steps">
            <li>
              <span className="waypoint px">1</span>
              <h3>Start a trip</h3>
              <p>Name it, set the dates. You’re the party leader and get an invite code.</p>
            </li>
            <li>
              <span className="waypoint px">2</span>
              <h3>Send the invite link</h3>
              <p>Friends sign in with Google and drop straight into the trip. No accounts to set up.</p>
            </li>
            <li>
              <span className="waypoint px">3</span>
              <h3>Follow the trail</h3>
              <p>Share your location, plot the stops, mark the hotel. Everyone gets a reminder before each stop.</p>
            </li>
          </ol>
        </div>
      </section>
      <footer className="footer">Map data © OpenStreetMap contributors, tiles © CARTO.</footer>
    </main>
  );
}

// ─── Signed in ───────────────────────────────────────────────────────────────

type TripRow = Trip & { members: number };

function TripsHome({ session }: { session: Session }) {
  const router = useRouter();
  const [trips, setTrips] = useState<TripRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const name = displayNameOf(session);

  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("trips")
        .select("*, trip_members(count)")
        .order("start_date", { ascending: false, nullsFirst: false });
      if (error) return setLoadError(error.message);
      setTrips(
        (data ?? []).map((t) => ({ ...t, members: (t.trip_members as { count: number }[])?.[0]?.count ?? 1 }) as TripRow),
      );
    })();
  }, []);

  return (
    <div className="page">
      <header className="shell">
        <span className="brand">
          <Icon name="flag" size={22} />
          Party Trail
        </span>
        <span className="shell-spacer" />
        <span className="shell-user">
          <Avatar seed={session.user.id} size="sm" />
          <span className="name">{name}</span>
        </span>
        <button
          type="button"
          className="btn btn--sm btn--on-shell"
          onClick={async () => {
            await signOut();
            router.refresh();
          }}
        >
          <Icon name="exit" />
          <span className="hide-sm">Sign out</span>
        </button>
      </header>

      <main className="home">
        <section aria-labelledby="trips-h">
          <h1 id="trips-h">Your trips</h1>
          {loadError && <p className="form-error">Couldn’t load your trips: {loadError}</p>}
          {!trips && !loadError && <p className="loading-dots">Loading trips</p>}
          {trips && trips.length === 0 && (
            <div className="empty px">
              <p>
                No trips yet. Start one on the right, or paste the invite code a friend sent you. Want to see how it works
                first?
              </p>
              <Link href="/trip/?id=demo" className="btn">
                Open the demo trip
              </Link>
            </div>
          )}
          {trips && trips.length > 0 && (
            <ul className="trip-list">
              {trips.map((t) => (
                <li key={t.id}>
                  <Link href={`/trip/?id=${t.id}`} className="trip-row px">
                    <span className="flag" aria-hidden="true">
                      <Icon name="flag" size={20} />
                    </span>
                    <span>
                      <strong>{t.name}</strong>
                      <small>
                        {[t.destination, formatDateRange(t.start_date, t.end_date), `${t.members} in the party`]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </span>
                    <span className="chev" aria-hidden="true">
                      <Icon name="back" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="side-forms">
          <CreateTrip />
          <JoinByCode />
        </div>
      </main>
    </div>
  );
}

function CreateTrip() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Give the trip a name.");
    setBusy(true);
    setError(null);
    // Id is made here: RLS hides the row from RETURNING until the creator's
    // membership (added by a trigger) exists, so insert without reading back.
    const id = crypto.randomUUID();
    const { error } = await getSupabase()
      .from("trips")
      .insert({ id, name: name.trim(), destination: destination.trim() || null, start_date: start || null, end_date: end || null });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.push(`/trip/?id=${id}`);
  };

  return (
    <section className="px" aria-labelledby="new-h">
      <h2 id="new-h">Start a trip</h2>
      <form className="form-grid" onSubmit={submit}>
        <label className="field">
          <span>Trip name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tokyo in spring" maxLength={80} />
        </label>
        <label className="field">
          <span>Destination (optional)</span>
          <input className="input" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Tokyo, Japan" />
        </label>
        <div className="form-row">
          <label className="field">
            <span>From</span>
            <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input className="input" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          <Icon name="flag" />
          {busy ? "Starting…" : "Start trip"}
        </button>
      </form>
    </section>
  );
}

function JoinByCode() {
  const router = useRouter();
  const [code, setCode] = useState("");
  return (
    <section className="px" aria-labelledby="join-h">
      <h2 id="join-h">Join with a code</h2>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) router.push(`/join/?code=${encodeURIComponent(code.trim().toUpperCase())}`);
        }}
      >
        <label className="field">
          <span>Invite code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="K7Q2XM"
            className="input input--code"
            maxLength={12}
            autoCapitalize="characters"
          />
        </label>
        <button type="submit" className="btn btn--block" disabled={!code.trim()}>
          Join trip
        </button>
      </form>
    </section>
  );
}

