"use client";

import { useState } from "react";
import { signInWithGoogle } from "@/lib/supabase";

export function GoogleButton({ returnPath, label = "Sign in with Google" }: { returnPath: string; label?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn--primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await signInWithGoogle(returnPath);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Google sign-in failed. Try again.");
            setBusy(false);
          }
        }}
      >
        <GoogleMark />
        {busy ? "Opening Google…" : label}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function GoogleMark() {
  // Google "G" redrawn on the pixel grid in its four brand colours.
  const rows = ["..BBBB..", ".B....B.", "R.......", "R...BBBB", "Y......B", "Y......G", ".G....G.", "..GGGG.."];
  const c: Record<string, string> = { B: "#4285F4", R: "#EA4335", Y: "#FBBC05", G: "#34A853" };
  return (
    <span className="sprite g-mark" aria-hidden="true">
      <svg viewBox="0 0 8 8" width="14" height="14" shapeRendering="crispEdges">
        {rows.flatMap((r, y) =>
          [...r].map((ch, x) => (c[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={c[ch]} /> : null)),
        )}
      </svg>
    </span>
  );
}

