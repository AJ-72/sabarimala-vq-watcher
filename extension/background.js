import {
  ORIGIN, FEED_PATH, DEFAULT_INTERVAL_MIN, DEFAULT_MIN_TICKETS, MAX_DATES_PER_CHECK, DEFAULT_ROUTES,
  parseSummary, parseRoutes, parseRouteSlots, routeOpening, newOpenings, routeSlotsPath,
  clampInterval, clampMinTickets, bookingUrl, describeOpening,
} from "./logic.js";

const ALARM = "check";
const PENDING_MS = 15 * 60 * 1000;
const ROUTES_TTL_MS = 6 * 60 * 60 * 1000;

// Open the booking page for a date (and route). pendingDate also covers the case where the
// portal sends you to log in first: the date and route are picked once you reach the booking page.
async function openFor(date, routeId) {
  await chrome.storage.local.set({ pendingDate: { date, routeId: routeId || null, until: Date.now() + PENDING_MS } });
  const tab = await chrome.tabs.create({ url: bookingUrl(date, routeId) });
  if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
}

async function getSettings() {
  const s = await chrome.storage.local.get({
    targets: [], targetsText: "", intervalMin: DEFAULT_INTERVAL_MIN, minTickets: DEFAULT_MIN_TICKETS, ntfyTopic: "", enabled: true,
  });
  s.intervalMin = clampInterval(s.intervalMin);
  s.minTickets = clampMinTickets(s.minTickets);
  return s;
}

async function schedule() {
  const s = await getSettings();
  await chrome.alarms.clear(ALARM);
  if (s.enabled) chrome.alarms.create(ALARM, { periodInMinutes: s.intervalMin, delayInMinutes: 0.1 });
  await setBadge(s.enabled ? "" : "off", "#777");
}

// Same public requests the portal's Virtual-Q availability page makes for a logged-out visitor.
async function portalJson(path, method = "POST") {
  const res = await fetch(ORIGIN + path, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/json" } : {},
    body: method === "POST" ? "" : undefined,
    credentials: "omit",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Portal answered HTTP ${res.status}${res.status === 403 ? " (blocked — open the portal in a tab and check it loads)" : ""}`);
  try { return JSON.parse(await res.text()); } catch { throw new Error("Portal did not return JSON — it may be down or changed"); }
}

async function getRoutes() {
  const { routesCache } = await chrome.storage.local.get("routesCache");
  if (routesCache && routesCache.until > Date.now()) return routesCache.routes;
  let routes = DEFAULT_ROUTES;
  try { routes = parseRoutes(await portalJson("/api/tofcommon/getReportingMaster", "GET")); } catch (e) { console.warn("route list failed, using defaults", e); }
  await chrome.storage.local.set({ routesCache: { routes, until: Date.now() + ROUTES_TTL_MS } });
  return routes;
}

async function check() {
  const s = await getSettings();
  const { prevKeys = null } = await chrome.storage.local.get("prevKeys");
  const checkedAt = new Date().toISOString();
  try {
    // Step 1: which dates are open at all (one request).
    const summary = await portalJson(FEED_PATH).then(parseSummary);
    const watchedOpen = s.targets.length ? summary.available.filter((d) => s.targets.includes(d)) : summary.available;

    // Step 2: only for watched open dates, ask each route how many tickets each slot has left.
    const routes = await getRoutes();
    const openings = [];
    for (const date of watchedOpen.slice(0, MAX_DATES_PER_CHECK)) {
      for (const route of routes) {
        const slots = parseRouteSlots(await portalJson(routeSlotsPath(date, route.id)));
        openings.push(...routeOpening(date, route, slots, s.minTickets));
      }
    }

    const fresh = newOpenings(prevKeys, openings);
    await chrome.storage.local.set({
      prevKeys: openings.map((o) => o.key),
      lastCheck: { at: checkedAt, ok: true, summary, watchedOpen, openings, minTickets: s.minTickets, skippedDates: Math.max(0, watchedOpen.length - MAX_DATES_PER_CHECK) },
    });
    await setBadge(openings.length ? String(openings.length) : "", "#1a7f37");
    if (fresh.length) await alertUser(fresh, s);
  } catch (e) {
    await chrome.storage.local.set({ lastCheck: { at: checkedAt, ok: false, error: String(e.message || e) } });
    await setBadge("!", "#b42318");
  }
}

async function alertUser(openings, s) {
  const title = `Virtual-Q: ${s.minTickets}+ tickets open`;
  const message = openings.slice(0, 4).map(describeOpening).join("\n") + (openings.length > 4 ? `\n+${openings.length - 4} more` : "");
  const id = "open-" + Date.now();
  // Body click opens the first opening; up to two buttons open specific date + route pairs.
  await chrome.storage.session.set({ [id]: openings.map((o) => ({ date: o.date, routeId: o.routeId })) });
  chrome.notifications.create(id, {
    type: "basic", iconUrl: "icon.png", title, message, priority: 2, requireInteraction: true,
    buttons: openings.slice(0, 2).map((o) => ({ title: "Book " + describeOpening(o).split(" · ").slice(0, 2).join(" · ") })),
  });
  if (s.ntfyTopic) {
    // Phone push via ntfy.sh. Only dates, routes and ticket counts are sent — no personal data.
    // On the phone the link opens the booking page; picking date and route is done by hand there.
    try {
      const actions = openings.slice(0, 3)
        .map((o) => `view, ${describeOpening(o).split(" · ").slice(0, 2).join(" ").replace(/[,;]/g, "")}, ${bookingUrl(o.date, o.routeId)}`)
        .join("; ");
      await fetch("https://ntfy.sh/" + encodeURIComponent(s.ntfyTopic), {
        method: "POST",
        headers: { Title: title, Priority: "urgent", Tags: "rotating_light", Click: bookingUrl(openings[0].date, openings[0].routeId), Actions: actions },
        body: message,
      });
    } catch (e) {
      console.warn("ntfy push failed", e);
    }
  }
}

async function setBadge(text, color) {
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
}

async function targetsFor(id) {
  const got = await chrome.storage.session.get(id);
  return got[id] || [];
}
chrome.notifications.onClicked.addListener(async (id) => {
  const [first] = await targetsFor(id);
  if (first) await openFor(first.date, first.routeId);
  chrome.notifications.clear(id);
});
chrome.notifications.onButtonClicked.addListener(async (id, i) => {
  const t = (await targetsFor(id))[i];
  if (t) await openFor(t.date, t.routeId);
  chrome.notifications.clear(id);
});
chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) check(); });
chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg === "reschedule") schedule().then(() => reply(true));
  if (msg === "checkNow") check().then(() => reply(true));
  if (msg === "testAlert") {
    getSettings()
      .then((s) => alertUser([{ key: "test", date: "2026-12-24", routeId: 1, routeName: "Pamba - Marakkoottam - 4 Kms", slots: [{ slot: "21:00 - 22:00", tickets: 4 }] }], s))
      .then(() => reply(true));
  }
  if (msg && msg.openDate) openFor(msg.openDate, msg.routeId).then(() => reply(true));
  return true;
});
