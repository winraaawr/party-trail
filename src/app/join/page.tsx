"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { GoogleButton } from "@/components/GoogleButton";
import { getSupabase, useSession } from "@/lib/supabase";

function JoinRoute() {
  const params = useSearchParams();
  const router = useRouter();
  const code = (params.get("code") ?? "").trim().toUpperCase();
  const session = useSession();
  const [error, setError] = useState<string | null>(null);
  const tried = useRef(false);

  useEffect(() => {
    if (session.status !== "signedIn" || !code || tried.current) return;
    tried.current = true;
    getSupabase()
      .rpc("join_trip", { code })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else router.replace(`/trip/?id=${data}`);
      });
  }, [session.status, code, router]);

  let body: React.ReactNode;
  if (!code) {
    body = (
      <>
        <h1>Missing invite code</h1>
        <p>This link is incomplete. Ask your friend to send the invite link again.</p>
      </>
    );
  } else if (session.status === "unconfigured") {
    body = (
      <>
        <h1>Sign-in isn’t set up</h1>
        <p>This copy of Party Trail has no Supabase keys yet, so invites can’t be used.</p>
      </>
    );
  } else if (session.status === "signedOut") {
    body = (
      <>
        <h1>You’re invited</h1>
        <p>
          Sign in with Google to join the trip with code <strong>{code}</strong>.
        </p>
        <GoogleButton returnPath={`/join/?code=${encodeURIComponent(code)}`} label="Sign in with Google to join" />
      </>
    );
  } else if (error) {
    body = (
      <>
        <h1>Couldn’t join</h1>
        <p>{error}</p>
        <Link href="/" className="btn">
          Go to your trips
        </Link>
      </>
    );
  } else {
    body = <p className="loading-dots">Joining the party</p>;
  }

  return (
    <main className="center-screen">
      <div className="center-card px px-lift">{body}</div>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<div className="center-screen loading-dots">Opening invite</div>}>
      <JoinRoute />
    </Suspense>
  );
}
