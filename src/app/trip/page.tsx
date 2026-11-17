"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { GoogleButton } from "@/components/GoogleButton";
import { TripView } from "@/components/TripView";
import { displayNameOf, useSession } from "@/lib/supabase";
import { useDemoTrip, useLiveTrip } from "@/lib/tripStore";

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="center-screen">
      <div className="center-card px px-lift">
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

function DemoTrip() {
  const store = useDemoTrip();
  return <TripView store={store} />;
}

function LiveTrip({ tripId, me }: { tripId: string; me: { id: string; name: string } }) {
  const store = useLiveTrip(tripId, me);
  if (store.status === "loading") return <div className="center-screen loading-dots">Gathering the party</div>;
  if (store.status === "notfound")
    return (
      <Message title="Trip not found">
        <p>This trip doesn’t exist, or you’re not in its party. Ask a member for the invite link.</p>
        <Link href="/" className="btn">
          Back to your trips
        </Link>
      </Message>
    );
  if (store.status === "error")
    return (
      <Message title="Couldn’t load the trip">
        <p>{store.error}</p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Try again
        </button>
      </Message>
    );
  return <TripView store={store} />;
}

function TripRoute() {
  const params = useSearchParams();
  const id = params.get("id");
  const session = useSession();
  const me = useMemo(
    () => (session.status === "signedIn" ? { id: session.session.user.id, name: displayNameOf(session.session) } : null),
    [session],
  );

  if (id === "demo") return <DemoTrip />;
  if (!id)
    return (
      <Message title="No trip picked">
        <Link href="/" className="btn">
          Back to your trips
        </Link>
      </Message>
    );
  if (session.status === "loading") return <div className="center-screen loading-dots">Checking your pack</div>;
  if (session.status === "unconfigured")
    return (
      <Message title="Sign-in isn’t set up">
        <p>Add Supabase keys to open real trips. The demo trip works without them.</p>
        <Link href="/trip/?id=demo" className="btn">
          Open the demo trip
        </Link>
      </Message>
    );
  if (!me)
    return (
      <Message title="Sign in to see this trip">
        <p>Trips are private to their party.</p>
        <GoogleButton returnPath={`/trip/?id=${id}`} />
      </Message>
    );
  return <LiveTrip tripId={id} me={me} />;
}

export default function TripPage() {
  return (
    <Suspense fallback={<div className="center-screen loading-dots">Unrolling the map</div>}>
      <TripRoute />
    </Suspense>
  );
}
