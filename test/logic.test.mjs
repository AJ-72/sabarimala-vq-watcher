import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSummary, parseTargets, newlyOpen, clampInterval, formatDates, bookingUrl,
  routeSlotsPath, parseRouteSlots, parseRoutes, routeOpening, newOpenings, describeOpening, describeSlots, clampMinTickets,
} from "../extension/logic.js";

const feed = {
  availableDatesList: ["2026-11-28"],
  bookedDates: ["2026-11-26", "2026-11-27"],
  blockedDates: [],
  startAndEndDates: ["2026-11-26", "2027-03-15"],
};

test("parseSummary reads the live feed shape", () => {
  const s = parseSummary(feed);
  assert.deepEqual(s.available, ["2026-11-28"]);
  assert.equal(s.booked.length, 2);
  assert.equal(s.seasonEnd, "2027-03-15");
});

test("parseSummary fails loudly if the site changes shape", () => {
  assert.throws(() => parseSummary({ foo: 1 }), /availableDatesList/);
  assert.throws(() => parseSummary(null), /not a JSON object/);
});

test("parseTargets handles lists and ranges", () => {
  assert.deepEqual(parseTargets("2026-12-24, 2027-01-10..2027-01-12"), ["2026-12-24", "2027-01-10", "2027-01-11", "2027-01-12"]);
  assert.deepEqual(parseTargets(""), []);
  assert.deepEqual(parseTargets("2026-12-31..2027-01-01"), ["2026-12-31", "2027-01-01"]);
});

test("parseTargets rejects bad input", () => {
  assert.throws(() => parseTargets("24-12-2026"), /not a date/);
  assert.throws(() => parseTargets("2026-02-30"), /not a real date/);
  assert.throws(() => parseTargets("2027-01-05..2027-01-01"), /ends before/);
});

test("newlyOpen alerts only on dates that just opened and are watched", () => {
  assert.deepEqual(newlyOpen(["2026-11-28"], ["2026-11-28", "2026-12-24"], []), ["2026-12-24"]);
  assert.deepEqual(newlyOpen(["2026-11-28"], ["2026-11-28", "2026-12-24"], ["2026-11-30"]), []);
  assert.deepEqual(newlyOpen(["2026-12-24"], ["2026-12-24"], ["2026-12-24"]), []);
  // Date closes, then reopens (cancellation) -> alert again
  assert.deepEqual(newlyOpen([], ["2026-12-24"], ["2026-12-24"]), ["2026-12-24"]);
});

test("first run reports what is already open", () => {
  assert.deepEqual(newlyOpen(null, ["2026-11-28"], []), ["2026-11-28"]);
});

test("interval is clamped to at least 2 minutes", () => {
  assert.equal(clampInterval(0.5), 2);
  assert.equal(clampInterval("5"), 5);
  assert.equal(clampInterval("abc"), 3);
});

test("bookingUrl points at the booking page with the date and route", () => {
  assert.equal(bookingUrl("2027-01-02"), "https://sabarimalaonline.org/#/darshan?vqdate=2027-01-02");
  assert.equal(bookingUrl("2027-01-02", 3), "https://sabarimalaonline.org/#/darshan?vqdate=2027-01-02&vqroute=3");
});

// Shape captured from the live portal on 2026-11-25 (17 Dec, Pamba route).
const liveRouteSlots = {
  flag: "Q", errMsg: null,
  darshanSlots: [
    { darshanDate: "17-Dec-2026", slotId: 18, slotName: "21:00 - 22:00", maxNoOfPersons: 10, noOfTicketsAvailable: 4, reportingPlace: "Pamba", availId: 1787 },
  ],
};
const pamba = { id: 1, name: "Pamba - Marakkoottam - 4 Kms" };

test("routeSlotsPath uses the portal's unpadded date form", () => {
  assert.equal(routeSlotsPath("2027-01-06", 3), "/api/eDarshan/darshanRoutewiseAvailability/2027-1-6/100001/3");
});

test("parseRouteSlots reads ticket counts and fails loudly on a changed shape", () => {
  assert.deepEqual(parseRouteSlots(liveRouteSlots), [{ slot: "21:00 - 22:00", tickets: 4 }]);
  assert.deepEqual(parseRouteSlots({ flag: "Q", darshanSlots: [] }), []);
  assert.throws(() => parseRouteSlots({ flag: "E", errMsg: "x" }), /darshanSlots/);
});

test("parseRoutes reads the portal route list, falls back on junk", () => {
  assert.deepEqual(parseRoutes([{ reportingMasterId: 2, reportingPlace: "Erumely - X" }]), [{ id: 2, name: "Erumely - X" }]);
  assert.equal(parseRoutes({ nope: 1 }).length, 3);
});

test("routeOpening keeps only slots with enough tickets (need 2)", () => {
  const slots = [{ slot: "04:00 - 05:00", tickets: 1 }, { slot: "21:00 - 22:00", tickets: 4 }, { slot: "05:00 - 06:00", tickets: 2 }];
  const [o] = routeOpening("2026-12-17", pamba, slots, 2);
  assert.equal(o.key, "2026-12-17|1");
  assert.deepEqual(o.slots.map((s) => s.slot), ["21:00 - 22:00", "05:00 - 06:00"]); // most tickets first, 1-ticket slot dropped
  assert.deepEqual(routeOpening("2026-12-17", pamba, [{ slot: "04:00 - 05:00", tickets: 1 }], 2), []);
});

test("newOpenings alerts per date+route, again after it drops below and comes back", () => {
  const o = (key) => ({ key });
  assert.deepEqual(newOpenings(["a|1"], [o("a|1"), o("a|3")]), [o("a|3")]);
  assert.deepEqual(newOpenings([], [o("a|1")]), [o("a|1")]);
  assert.deepEqual(newOpenings(null, [o("a|1")]), [o("a|1")]);
});

test("describeOpening lists every slot time with tickets left, earliest first", () => {
  const [o] = routeOpening("2026-12-17", pamba, [
    { slot: "21:00 - 22:00", tickets: 4 }, { slot: "20:00 - 21:00", tickets: 2 }, { slot: "04:00 - 05:00", tickets: 1 },
  ], 2);
  // the 1-ticket slot is below "Tickets needed: 2", so it is not listed
  assert.equal(describeOpening(o), "Thu, 17 Dec · Pamba · 20:00–21:00 (2 left), 21:00–22:00 (4 left)");
});

test("describeSlots caps the list and says how many more", () => {
  const slots = ["04:00 - 05:00", "05:00 - 06:00", "06:00 - 07:00", "07:00 - 08:00", "08:00 - 09:00"].map((slot) => ({ slot, tickets: 3 }));
  assert.equal(describeSlots(slots), "04:00–05:00 (3 left), 05:00–06:00 (3 left), 06:00–07:00 (3 left) +2 more");
});

test("describeOpening names the date, route, best slot and count", () => {
  const [o] = routeOpening("2026-12-17", pamba, [{ slot: "21:00 - 22:00", tickets: 4 }, { slot: "20:00 - 21:00", tickets: 2 }], 2);
  assert.equal(describeOpening(o), "Thu, 17 Dec · Pamba · 20:00–21:00 (2 left), 21:00–22:00 (4 left)");
});

test("minTickets is clamped to 1..10", () => {
  assert.equal(clampMinTickets(0), 1);
  assert.equal(clampMinTickets("2"), 2);
  assert.equal(clampMinTickets(50), 10);
  assert.equal(clampMinTickets("x"), 2);
});

test("formatDates is readable", () => {
  assert.match(formatDates(["2026-12-24"]), /24 Dec/);
});
