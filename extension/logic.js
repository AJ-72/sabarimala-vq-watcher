// Pure logic: no chrome.* or network calls, so it can be unit-tested in Node.

export const ORIGIN = "https://sabarimalaonline.org";
export const FEED_PATH = "/api/eDarshan/darshansummary/100001";

export const DEFAULT_MIN_TICKETS = 2;
export const MAX_DATES_PER_CHECK = 5; // caps route lookups at 5 dates x 3 routes per check

// Fallback if the portal's route list can't be loaded. IDs are the values the booking page's
// "Select Route" dropdown uses.
export const DEFAULT_ROUTES = [
  { id: 1, name: "Pamba - Marakkoottam - 4 Kms" },
  { id: 2, name: "Erumely - Kalaketti Traditional Path - 46 Kms" },
  { id: 3, name: "Vandiperiyar - Sathram - Pulmedu - 16 Kms" },
];

/** Booking page link; the content script reads vqdate/vqroute and selects them. */
export function bookingUrl(isoDate, routeId) {
  return `${ORIGIN}/#/darshan?vqdate=${isoDate}${routeId ? `&vqroute=${routeId}` : ""}`;
}

/** Path for one date + route's slot list, in the same unpadded y-m-d form the portal uses. */
export function routeSlotsPath(isoDate, routeId) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `/api/eDarshan/darshanRoutewiseAvailability/${y}-${m}-${d}/100001/${routeId}`;
}

/** Portal route list -> [{id, name}]. Falls back to DEFAULT_ROUTES on anything unexpected. */
export function parseRoutes(json) {
  if (!Array.isArray(json)) return DEFAULT_ROUTES;
  const routes = json
    .filter((r) => r && Number.isInteger(r.reportingMasterId) && typeof r.reportingPlace === "string")
    .map((r) => ({ id: r.reportingMasterId, name: r.reportingPlace }));
  return routes.length ? routes : DEFAULT_ROUTES;
}

/** One route's slot response -> [{slot, tickets}]. Throws on unexpected shape. */
export function parseRouteSlots(json) {
  if (!json || typeof json !== "object" || !Array.isArray(json.darshanSlots)) {
    throw new Error("Route availability is missing darshanSlots — the site may have changed");
  }
  return json.darshanSlots
    .filter((s) => s && typeof s.slotName === "string" && Number.isFinite(Number(s.noOfTicketsAvailable)))
    .map((s) => ({ slot: s.slotName, tickets: Number(s.noOfTicketsAvailable) }));
}

/**
 * Collapse slots into one opening per date + route, keeping only slots with at least
 * minTickets left. Returns [] for a route with no qualifying slot.
 */
export function routeOpening(date, route, slots, minTickets) {
  const ok = slots.filter((s) => s.tickets >= minTickets).sort((a, b) => b.tickets - a.tickets);
  if (!ok.length) return [];
  return [{ key: `${date}|${route.id}`, date, routeId: route.id, routeName: route.name, slots: ok }];
}

/** Openings whose date+route was not qualifying at the previous check. null = first run. */
export function newOpenings(prevKeys, openings) {
  const prev = new Set(prevKeys || []);
  return openings.filter((o) => prevKeys === null || !prev.has(o.key));
}

/** "Pamba - Marakkoottam - 4 Kms" -> "Pamba" */
export function shortRoute(name) {
  return String(name).split(" - ")[0];
}

/** "21:00 - 22:00" -> "21:00–22:00" (shorter for notifications) */
export function shortSlot(slot) {
  return String(slot).replace(/\s*-\s*/, "–");
}

/**
 * Slot times with tickets left, earliest first, as shown on the booking page's slot boxes:
 * "20:00–21:00 (2 left), 21:00–22:00 (4 left)". At most `max` slots, then "+N more".
 */
export function describeSlots(slots, max = 3) {
  const byTime = [...slots].sort((a, b) => a.slot.localeCompare(b.slot));
  const shown = byTime.slice(0, max).map((s) => `${shortSlot(s.slot)} (${s.tickets} left)`).join(", ");
  const rest = byTime.length - max;
  return rest > 0 ? `${shown} +${rest} more` : shown;
}

/** "17 Dec · Pamba · 20:00–21:00 (2 left), 21:00–22:00 (4 left)" */
export function describeOpening(o) {
  return `${formatDates([o.date])} · ${shortRoute(o.routeName)} · ${describeSlots(o.slots)}`;
}
export const MIN_INTERVAL_MIN = 2;
export const DEFAULT_INTERVAL_MIN = 3;

/** Turn the raw feed JSON into a small, validated summary. Throws on unexpected shape. */
export function parseSummary(json) {
  if (!json || typeof json !== "object") throw new Error("Feed is not a JSON object");
  for (const key of ["availableDatesList", "bookedDates"]) {
    if (!Array.isArray(json[key])) throw new Error(`Feed is missing ${key} — the site may have changed`);
  }
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const clean = (arr) => (arr || []).filter((d) => typeof d === "string" && iso.test(d)).sort();
  return {
    available: clean(json.availableDatesList),
    booked: clean(json.bookedDates),
    notReleased: clean(json.blockedDates),
    seasonStart: json.startAndEndDates?.[0] ?? null,
    seasonEnd: json.startAndEndDates?.[1] ?? null,
  };
}

/** Parse "2026-12-24, 2027-01-10..2027-01-14" into a sorted list of ISO dates. Empty input = watch everything. */
export function parseTargets(text) {
  const out = new Set();
  for (const part of String(text || "").split(/[\s,]+/).filter(Boolean)) {
    const range = part.split("..");
    if (range.length === 2) {
      let d = toDate(range[0]);
      const end = toDate(range[1]);
      if (end < d) throw new Error(`Range ${part} ends before it starts`);
      for (let i = 0; d <= end && i < 400; i++) {
        out.add(d.toISOString().slice(0, 10));
        d = new Date(d.getTime() + 86400000);
      }
    } else {
      out.add(toDate(part).toISOString().slice(0, 10));
    }
  }
  return [...out].sort();
}

function toDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`"${s}" is not a date like 2026-12-24`);
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new Error(`"${s}" is not a real date`);
  return d;
}

/**
 * Dates that are open now, were not open at the previous check, and are ones we watch.
 * prevAvailable === null means first run: report everything currently open, so the user
 * knows the watcher works.
 */
export function newlyOpen(prevAvailable, available, targets) {
  const prev = new Set(prevAvailable || []);
  const watch = targets && targets.length ? new Set(targets) : null;
  return available.filter((d) => (prevAvailable === null || !prev.has(d)) && (!watch || watch.has(d)));
}

export function clampMinTickets(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_MIN_TICKETS;
  return Math.min(10, Math.max(1, v)); // portal allows up to 10 persons per booking
}

export function clampInterval(min) {
  const n = Number(min);
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL_MIN;
  return Math.max(MIN_INTERVAL_MIN, Math.round(n));
}

export function formatDates(dates) {
  return dates
    .map((d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }))
    .join(", ");
}
