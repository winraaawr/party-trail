"use client";

import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const supabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseConfigured) {
    throw new Error("Supabase is not configured. Copy .env.example to .env.local and fill it in.");
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true },
    });
  }
  return client;
}

/** Absolute URL inside this deployment, respecting the GitHub Pages base path. */
export function appUrl(path: string): string {
  return `${window.location.origin}${BASE_PATH}${path}`;
}

export async function signInWithGoogle(returnPath: string) {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: appUrl(returnPath) },
  });
  if (error) throw error;
}

export async function signOut() {
  await getSupabase().auth.signOut();
}

export type SessionState =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "signedOut" }
  | { status: "signedIn"; session: Session };

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>(
    supabaseConfigured ? { status: "loading" } : { status: "unconfigured" },
  );

  useEffect(() => {
    if (!supabaseConfigured) return;
    const sb = getSupabase();
    let alive = true;
    sb.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setState(data.session ? { status: "signedIn", session: data.session } : { status: "signedOut" });
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setState(session ? { status: "signedIn", session } : { status: "signedOut" });
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export function displayNameOf(session: Session): string {
  const m = session.user.user_metadata ?? {};
  return (m.full_name as string) || (m.name as string) || session.user.email?.split("@")[0] || "Traveler";
}
