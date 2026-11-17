"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDateRange, formatWhen, type LatLng } from "@/lib/geo";
import { requestNotificationPermission, useLocationSharing, useNow, usePref, useReminders } from "@/lib/hooks";
import { KIND_ICON } from "@/lib/sprites";
import { DEMO_START } from "@/lib/tripStore";
import type { Activity, IconName, TripStore } from "@/lib/types";
import { Icon } from "./Icon";
import type { MapPicker } from "./PlaceField";
import { Avatar } from "./Sprite";
import { ItineraryTab, PartyTab, StaysTab } from "./TripPanels";
import type { MapFocus } from "./TripMap";

const TripMap = dynamic(() => import("./TripMap"), {
  ssr: false,
  loading: () => <div className="center-screen loading-dots">Unrolling the map</div>,
});

type Tab = "itinerary" | "party" | "stays";
type Sheet = "collapsed" | "half" | "expanded";
type Toast = { id: string; text: string; icon: IconName };

function useDarkScheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return dark;
}

function relative(iso: string, now: number): { big: string; small: string } {
  const mins = Math.round((new Date(iso).getTime() - now) / 60000);
  if (mins <= 0) return { big: "Now", small: "started" };
  if (mins < 60) return { big: `${mins}m`, small: "from now" };
  if (mins < 24 * 60) return { big: `${Math.round(mins / 60)}h`, small: "from now" };
  const w = formatWhen(iso);
  return { big: w.time, small: w.day };
}

export function TripView({ store }: { store: TripStore }) {
  const router = useRouter();
  const now = useNow(20_000);
  const dark = useDarkScheme();
  const tripId = store.trip?.id ?? "none";

  const [tab, setTab] = useState<Tab>("itinerary");
  const [sheet, setSheet] = useState<Sheet>("half");
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sharing, setSharing] = usePref(`pt:share:${tripId}`, true);
  const [remind, setRemind] = usePref("pt:remind", false);

  // ── Map picking (forms ask the map for a point) ──
  const [picking, setPicking] = useState(false);
  const [preview, setPreview] = useState<LatLng | null>(null);
  const pickCb = useRef<((p: LatLng) => void) | null>(null);
  const sheetBeforePick = useRef<Sheet>("half");

  const toast = useCallback((text: string, icon: IconName) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((t) => [...t.slice(-2), { id, text, icon }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6500);
  }, []);

  // Party activity (someone added a stop, someone joined) → dialogue box.
  const seen = useRef(0);
  useEffect(() => {
    const fresh: Activity[] = store.activity.slice(seen.current);
    seen.current = store.activity.length;
    fresh.forEach((a) => toast(a.text, a.icon));
  }, [store.activity, toast]);

  const shareState = useLocationSharing(sharing, store.publishLocation, store.demo ? DEMO_START : undefined);
  useEffect(() => {
    if (shareState === "denied") {
      toast("Location is blocked for this site. Allow it in your browser settings to share where you are.", "locate");
      setSharing(false);
    } else if (shareState === "unavailable") {
      toast("This device can’t report a location right now.", "locate");
      setSharing(false);
    }
  }, [shareState, toast, setSharing]);

  const toggleSharing = async () => {
    if (sharing) {
      setSharing(false);
      await store.clearLocation().catch(() => {});
      toast("You’ve stopped sharing your location. The party no longer sees you on the map.", "locate");
    } else {
      setSharing(true);
    }
  };

  useReminders(tripId, store.items, remind, (r) => toast(r.text, KIND_ICON[r.item.kind]));

  const toggleReminders = async () => {
    if (remind) {
      setRemind(false);
      return;
    }
    const perm = await requestNotificationPermission();
    setRemind(true);
    if (perm === "granted") toast("Reminders on. You’ll get a notification 30 minutes before each stop.", "bell");
    else toast("Reminders on in this tab. Allow notifications in your browser to get them when the tab is in the background.", "bell");
  };

  const nextItem = useMemo(
    () => store.items.find((i) => new Date(i.starts_at).getTime() > now - 10 * 60000) ?? null,
    [store.items, now],
  );

  const focusOn = useCallback((p: { lat: number; lng: number }, zoom?: number) => {
    setFocus({ lat: p.lat, lng: p.lng, zoom, nonce: Date.now() });
    if (window.matchMedia("(max-width: 760px)").matches) setSheet("collapsed");
  }, []);

  const picker: MapPicker = useMemo(
    () => ({
      picking,
      near: store.locations[store.me.id] ?? (store.stays[0] || null) ?? null,
      request(cb) {
        pickCb.current = cb;
        setPicking(true);
        setSheet((s) => {
          sheetBeforePick.current = s;
          return "collapsed";
        });
      },
      cancel() {
        pickCb.current = null;
        setPicking(false);
        setSheet(sheetBeforePick.current);
      },
      preview: setPreview,
    }),
    [picking, store.locations, store.me.id, store.stays],
  );

  const onPick = (p: LatLng) => {
    pickCb.current?.(p);
    pickCb.current = null;
    setPicking(false);
    setSheet(sheetBeforePick.current === "collapsed" ? "half" : sheetBeforePick.current);
  };

  const leave = async () => {
    if (!window.confirm(`Leave “${store.trip?.name}”? You can rejoin with the invite code.`)) return;
    await store.leaveTrip();
    router.push("/");
  };

  const trip = store.trip!;
  const dates = formatDateRange(trip.start_date, trip.end_date);
  const subtitle = [trip.destination, dates].filter(Boolean).join(" · ");
  const shownMembers = store.members.slice(0, 5);
  const rel = nextItem ? relative(nextItem.starts_at, now) : null;

  const tabs: { id: Tab; label: string; icon: IconName; count: number }[] = [
    { id: "itinerary", label: "Itinerary", icon: "flag", count: store.items.length },
    { id: "party", label: "Party", icon: "person", count: store.members.length },
    { id: "stays", label: "Stays", icon: "inn", count: store.stays.length },
  ];

  return (
    <div className="trip-screen">
      <header className="shell">
        <Link href="/" className="btn btn--icon btn--sm btn--on-shell" aria-label="All trips" title="All trips">
          <Icon name="back" />
        </Link>
        <div className="trip-title">
          <div className="trip-title-row">
            <h1>{trip.name}</h1>
            {store.demo && <span className="demo-badge">Demo</span>}
          </div>
          {subtitle && <small>{subtitle}</small>}
        </div>
        <span className="shell-spacer" />
        <button
          type="button"
          className="party-stack party-stack--btn"
          onClick={() => {
            setTab("party");
            if (sheet === "collapsed") setSheet("half");
          }}
          aria-label={`Party: ${store.members.length} travelers`}
        >
          {shownMembers.map((m) => (
            <Avatar key={m.user_id} seed={m.user_id} size="sm" label={m.display_name} />
          ))}
          {store.members.length > shownMembers.length && <span className="more">+{store.members.length - shownMembers.length}</span>}
        </button>
        <div className="shell-actions">
          <button
            type="button"
            className="btn btn--sm btn--on-shell"
            aria-pressed={sharing}
            onClick={toggleSharing}
            title={sharing ? "Stop sharing your location" : "Share your live location with the party"}
          >
            <Icon name="locate" />
            <span className="hide-sm">{sharing ? (shareState === "starting" ? "Locating…" : "Sharing") : "Share location"}</span>
            <span className="visually-hidden">{sharing ? "(on)" : "(off)"}</span>
          </button>
          <button
            type="button"
            className="btn btn--sm btn--icon btn--on-shell"
            aria-pressed={remind}
            onClick={toggleReminders}
            aria-label={remind ? "Turn reminders off" : "Turn reminders on"}
            title={remind ? "Reminders on" : "Reminders off"}
          >
            <Icon name={remind ? "bell" : "bellOff"} />
          </button>
        </div>
      </header>

      <div className="trip-body">
        <aside className={`trip-panel is-${sheet}`} aria-label="Trip details">
          <button
            type="button"
            className="sheet-handle"
            aria-label={sheet === "expanded" ? "Shrink panel" : "Expand panel"}
            onClick={() => setSheet((s) => (s === "collapsed" ? "half" : s === "half" ? "expanded" : "collapsed"))}
          />
          {nextItem && rel ? (
            <button
              type="button"
              className="next-up"
              onClick={() => {
                setTab("itinerary");
                if (nextItem.lat != null) focusOn({ lat: nextItem.lat, lng: nextItem.lng! }, 16);
              }}
            >
              <span className="icon-tile" aria-hidden="true">
                <Icon name={KIND_ICON[nextItem.kind]} size={18} />
              </span>
              <span className="next-up-text">
                <span className="label">Next up</span>
                <strong>{nextItem.title}</strong>
              </span>
              <span className="when">
                {rel.big}
                <small>{rel.small}</small>
              </span>
            </button>
          ) : (
            <div className="next-up next-up--empty">
              <span className="icon-tile" aria-hidden="true">
                <Icon name="flag" size={18} />
              </span>
              <span>
                <span className="label">Next up</span>
                <strong>Nothing planned yet</strong>
              </span>
              <span />
            </div>
          )}
          <div className="tabs" role="tablist" aria-label="Trip sections">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                className="tab"
                onClick={() => {
                  setTab(t.id);
                  if (sheet === "collapsed") setSheet("half");
                }}
              >
                <Icon name={t.icon} size={14} />
                {t.label}
                <span className="count">{t.count}</span>
              </button>
            ))}
          </div>
          <div className="tab-body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === "itinerary" && (
              <ItineraryTab store={store} now={now} nextItemId={nextItem?.id ?? null} picker={picker} onFocus={focusOn} />
            )}
            {tab === "party" && <PartyTab store={store} now={now} onFocus={focusOn} onLeave={leave} />}
            {tab === "stays" && <StaysTab store={store} picker={picker} onFocus={focusOn} />}
          </div>
        </aside>

        <div className="trip-map">
          <TripMap
            meId={store.me.id}
            members={store.members}
            locations={store.locations}
            items={store.items}
            stays={store.stays}
            nextItemId={nextItem?.id ?? null}
            focus={focus}
            picking={picking}
            picked={preview}
            onPick={onPick}
            dark={dark}
          />
          {picking && (
            <div className="pick-banner px px-lift" role="status">
              <Icon name="pin" />
              Tap the map to drop a pin
              <button type="button" className="btn btn--sm" onClick={picker.cancel}>
                Cancel
              </button>
            </div>
          )}
          <div className="map-tools">
            {store.locations[store.me.id] && (
              <button
                type="button"
                className="btn btn--icon px-lift"
                aria-label="Center on me"
                title="Center on me"
                onClick={() => focusOn(store.locations[store.me.id], 16)}
              >
                <Icon name="locate" size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast px">
            <span className="icon-tile" aria-hidden="true">
              <Icon name={t.icon} size={16} />
            </span>
            <p>{t.text}</p>
            <button
              type="button"
              className="btn btn--sm btn--icon btn--on-shell"
              aria-label="Dismiss"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
