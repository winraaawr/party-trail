# Party Trail

A shared map for trips with friends: where everyone is right now, what's next on the itinerary, and the hotel you're all walking back to tonight. Pixel-art overworld style.

- **Live party map**: location sharing is on by default when you open a trip (one tap in the header turns it off); everyone shows up as their own pixel character.
- **Itinerary**: stops plotted as a numbered trail on the map, with a "Next up" countdown and reminders 30 minutes before each stop and when it starts.
- **Stays**: mark hotels, hostels and campsites with check-in and check-out dates.
- **Google sign-in and invites**: each trip gets an invite code and link; friends sign in and land in the trip.
- **Realtime**: locations, stops, stays and new members sync live through Supabase Realtime.
- **Demo trip** at `/trip/?id=demo` runs without a backend.

Stack: Next.js (static export) · Supabase (Auth, Postgres with RLS, Realtime) · Leaflet with OpenStreetMap/CARTO tiles · Nominatim place search · GitHub Pages.

## Run it locally

```bash
npm install
cp .env.example .env.local   # fill in after the Supabase steps below
npm run dev                  # http://localhost:3000
```

The demo trip works without any keys.

## 1. Set up Supabase

1. Create a project at supabase.com.
2. Open **SQL Editor → New query**, paste `supabase/schema.sql`, and run it. This creates the tables, row-level security, the invite-code join function and the realtime publication.
3. Copy **Project URL** and the **anon public key** from **Project Settings → API** into `.env.local`.

## 2. Turn on Google sign-in

1. In Google Cloud Console, create an **OAuth client ID** (type: Web application).
   - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
2. In Supabase, open **Authentication → Sign In / Providers → Google**, enable it, and paste the client ID and secret.
3. In **Authentication → URL Configuration**:
   - Site URL: `https://<you>.github.io/<repo>/`
   - Redirect URLs: add `http://localhost:3000/**` and `https://<you>.github.io/<repo>/**`

## 3. Deploy to GitHub Pages

1. Push this folder to a GitHub repo on `main`.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Settings → Secrets and variables → Actions**, add the repository secrets `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Both values ship in the browser bundle; that's expected. Row-level security is what protects the data.
4. Push. `.github/workflows/deploy.yml` builds with the right base path (`/<repo>`) and publishes `out/`.

## How it fits GitHub Pages

Pages only serves static files, so everything runs in the browser:

- Routes take their parameters from the query string (`/trip/?id=…`, `/join/?code=…`), so no server is needed for dynamic paths.
- Auth uses Supabase's PKCE redirect flow, which is fine on a static site.
- All authorization lives in Postgres row-level security (`supabase/schema.sql`). A trip, its members, locations, itinerary and stays are visible only to that trip's members. Joining goes through the `join_trip(code)` function.

## Known limits

- **Reminders fire while the app is open** (any tab, including background tabs once notifications are allowed). Reminders with the app closed need Web Push: a service worker plus a scheduled Supabase Edge Function that sends the pushes. That's the natural next step.
- **Location sharing is foreground-only.** Browsers don't allow background geolocation for web apps. Locations older than 15 minutes show as "last seen".
- Place search uses the public Nominatim service (one request per second, fair use). For heavy traffic, switch to a keyed geocoder.
- Map tiles come from CARTO's free basemaps (attribution required, fair use).

## Design

The visual system is in `DESIGN.md`. The `impeccable` design skill is installed in `.claude/skills/impeccable`. Run `/impeccable critique the trip screen` or `/impeccable polish` in Claude Code to keep iterating.
