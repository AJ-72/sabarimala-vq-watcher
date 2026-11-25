// Runs on sabarimalaonline.org. If the watcher sent you here for a date (and route): select the date
// and route, go to Select Pilgrim, tick your saved pilgrims and add them, then fill the nominee rows.
// It never chooses the slot, never presses Add to Wishlist / Submit, and never touches payment or OTP.
(() => {
  const TAG = "[VQ Watcher]";

  function targetFromHash() {
    const m = location.hash.match(/[?&]vqdate=(\d{4}-\d{2}-\d{2})/);
    if (!m) return null;
    const r = location.hash.match(/[?&]vqroute=(\d+)/);
    return { date: m[1], routeId: r ? r[1] : null };
  }

  async function pendingTarget() {
    const fromUrl = targetFromHash();
    if (fromUrl) return fromUrl;
    const { pendingDate: p } = await chrome.storage.local.get("pendingDate");
    return p && p.until > Date.now() ? { date: p.date, routeId: p.routeId ? String(p.routeId) : null } : null;
  }

  // The booking page's route dropdown is a plain <select name="reportingPlace"> whose values are route ids.
  // Setting it and firing "change" makes the page load that route's slots, same as choosing it by hand.
  async function selectRoute(routeId) {
    const sel = await waitFor(() => document.querySelector('select[name="reportingPlace"]'), 5000);
    if (!sel) return null;
    const opt = [...sel.options].find((o) => o.value === routeId);
    if (!opt) return null;
    sel.value = routeId;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return opt.text.split(" - ")[0];
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(fn, ms = 20000, cancelled = () => false) {
    const end = Date.now() + ms;
    while (Date.now() < end && !cancelled()) {
      const v = fn();
      if (v) return v;
      await sleep(250);
    }
    return null;
  }

  function banner(text, ok) {
    let el = document.getElementById("vq-watcher-banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "vq-watcher-banner";
      el.style.cssText = "position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483647;padding:10px 16px;border-radius:8px;font:600 14px system-ui,sans-serif;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.3);cursor:pointer;max-width:90vw";
      el.title = "Click to dismiss";
      el.onclick = () => el.remove();
      document.body.appendChild(el);
    }
    el.style.background = ok ? "#1a7f37" : "#b42318";
    el.textContent = text;
  }

  // Angular Material calendar cells carry aria-label like "Sat Jan 02 2027" (Date.toDateString()).
  function cellLabel(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toDateString();
  }

  const prettyDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  // Dates the portal says are open right now (same public request as its own calendar), or null.
  async function openDatesNow() {
    try {
      const res = await fetch("/api/eDarshan/darshansummary/100001", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "", credentials: "omit", cache: "no-store",
      });
      const j = await res.json();
      return Array.isArray(j.availableDatesList) ? j.availableDatesList : null;
    } catch {
      return null;
    }
  }

  // The date step is over, whether or not the date could be picked. Pilgrims and nominees are still
  // worth doing: if the date is gone you only need to pick another one. Found 25 Nov 2026: an alert
  // clicked after its date sold out stopped at "booked out" and left the pilgrims unselected.
  async function finishDateStep(message, ok) {
    banner(`${TAG} ${message}`, ok);
    await chrome.storage.local.remove("pendingDate"); // don't redo the date when we come back
    await chrome.storage.local.set({ dateNote: { text: message, ok, until: Date.now() + 2 * 60 * 1000 } });
    await startPilgrimPick();
    return true;
  }

  async function selectDate(iso, cancelled, routeId) {
    // Wait for the booking page itself ("Select Pilgrim" only exists there), not just any date box:
    // right after a page change the previous page's date box can still be on screen.
    const input = await waitFor(() => {
      const onBookingPage = [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Select Pilgrim");
      return onBookingPage && (document.querySelector('input[name="darshanDate"]') || document.querySelector('input[aria-owns^="mat-datepicker"]'));
    }, 20000, cancelled);
    if (!input || cancelled()) return false; // not on the booking page; leave pendingDate for the next page
    const pretty = prettyDate(iso);

    const openBtn = input.closest(".mat-form-field")?.querySelector('button[aria-label="Open calendar"]') || document.querySelector('button[aria-label="Open calendar"]');
    if (!openBtn) return finishDateStep(`Couldn't find the calendar button — pick ${pretty} by hand.`, false);

    // The page loads which dates are open a moment after it renders; until then every date is
    // disabled. So if the date looks disabled, close the calendar and look again for a few seconds
    // before concluding it's booked out. (Found 25 Nov 2026: opening the calendar immediately
    // reported an open date as "booked out".)
    const label = cellLabel(iso);
    const isDisabled = (c) => c.getAttribute("aria-disabled") === "true" || c.classList.contains("mat-calendar-body-disabled");
    let cell = null;
    let openNow = null; // portal's open dates, fetched once the date first looks disabled
    for (let attempt = 0; attempt < 12 && !cancelled(); attempt++) {
      if (attempt) {
        document.querySelector(".cdk-overlay-backdrop")?.click(); // close the calendar
        await sleep(700);
      }
      openBtn.click();
      if (!(await waitFor(() => document.querySelector(".mat-calendar"), 5000, cancelled))) {
        if (cancelled()) return false; // page changed under us; the newer attempt takes over
        return finishDateStep(`Calendar didn't open — pick ${pretty} by hand.`, false);
      }
      cell = await findCalendarCell(label, cancelled);
      if (!cell || !isDisabled(cell)) break;
      // Disabled: either really gone, or the calendar hasn't loaded yet. Ask the portal once;
      // if the date isn't open there, stop now instead of retrying for 10 seconds.
      if (openNow === null) {
        openNow = (await openDatesNow()) || [];
        if (!openNow.includes(iso)) break;
      }
    }
    if (cancelled()) return false;
    document.querySelector(".cdk-overlay-backdrop")?.click(); // leave no calendar open
    const others = (openNow || []).filter((d) => d !== iso);
    const othersText = others.length ? ` Open now: ${others.slice(0, 4).map(prettyDate).join(", ")}.` : "";
    if (!cell) return finishDateStep(`${pretty} isn't in the calendar — it may be outside the season.${othersText}`, false);
    if (isDisabled(cell)) return finishDateStep(`${pretty} has just been booked out — pick another date.${othersText}`, false);

    cell.click();
    await sleep(300);
    const route = routeId ? await selectRoute(routeId) : null;
    return finishDateStep(route
      ? `Selected ${pretty} on the ${route} route. Pick a slot, check everything, then continue.`
      : `Selected ${pretty}. Choose your route and slot, then continue.`, true);
  }

  // With the calendar open, move to the month holding `label` and return its cell (or null).
  async function findCalendarCell(label, cancelled = () => false) {
    const target = new Date(label);
    const find = () => [...document.querySelectorAll(".mat-calendar-body-cell")].find((c) => c.getAttribute("aria-label") === label);
    for (let i = 0; i < 14 && !cancelled(); i++) {
      const cell = find();
      if (cell) return cell;
      // Decide direction from any cell currently shown.
      const shown = document.querySelector(".mat-calendar-body-cell")?.getAttribute("aria-label");
      const goBack = shown && new Date(shown) > target;
      const btn = document.querySelector(goBack ? ".mat-calendar-previous-button" : ".mat-calendar-next-button");
      if (!btn || btn.disabled) return null;
      btn.click();
      await sleep(200);
    }
    return null;
  }

  // Each navigation starts a new attempt; an older attempt gives up at its next step, and the new one
  // waits for it to stop first, so two attempts never click the calendar at the same time.
  let generation = 0;
  let current = Promise.resolve();
  function run() {
    const mine = ++generation;
    const previous = current;
    current = (async () => {
      await previous;
      if (mine !== generation) return;
      try {
        const t = await pendingTarget();
        if (!t) return;
        const done = await selectDate(t.date, () => mine !== generation, t.routeId);
        if (done && mine === generation) await chrome.storage.local.remove("pendingDate");
      } catch (e) {
        console.warn(TAG, e);
      }
    })();
  }

  run();

  // ---- Nominee autofill ----
  // Each Nominee Details row: read-only pilgrim name, "Enter Nominee Name", "Enter Age", Relationship <select>.
  // Only empty rows are filled, each row at most once per page view, so your own edits are never overwritten.
  const setInput = (el, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true })); // Angular ngModel listens for input
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  };

  function nomineeRows() {
    return [...document.querySelectorAll('input[placeholder="Enter Nominee Name"]')].map((nameEl) => {
      const tr = nameEl.closest("tr");
      if (!tr) return null;
      const pilgrimEl = tr.querySelector("input[readonly], input[disabled]");
      return {
        tr,
        nameEl,
        pilgrim: (pilgrimEl ? pilgrimEl.value : tr.cells[1]?.textContent || "").trim(),
        ageEl: tr.querySelector('input[placeholder="Enter Age"]'),
        relEl: tr.querySelector("select"),
      };
    }).filter(Boolean);
  }

  // ---- Optional contributions ----
  // After pilgrims are added, the page shows "Contribute for Pilgrim Relief fund" (radio group
  // name="contribute") and "Contribution to Clean Sabarimala Project (Optional)" (name="sanityYesOrNo"),
  // both defaulting to Yes. Set each to No once per page view; if you switch one back to Yes it stays.
  const CONTRIBUTION_GROUPS = { contribute: "Pilgrim Relief fund", sanityYesOrNo: "Clean Sabarimala" };

  async function setContributionsNo() {
    const { contributionsNo = true } = await chrome.storage.local.get("contributionsNo");
    if (!contributionsNo) return [];
    const changed = [];
    for (const [name, label] of Object.entries(CONTRIBUTION_GROUPS)) {
      const group = document.querySelector(`mat-radio-group[name="${name}"]`);
      if (!group || group.dataset.vqNo) continue;
      group.dataset.vqNo = "done";
      const no = [...group.querySelectorAll("mat-radio-button")].find((b) => b.textContent.trim() === "No");
      if (no && !no.classList.contains("mat-radio-checked")) {
        no.querySelector("input")?.click();
        changed.push(label);
      }
    }
    return changed;
  }

  async function autofillPass() {
    const changed = await setContributionsNo();
    await fillNominees(changed);
  }

  async function fillNominees(contributionsChanged = []) {
    const contribText = contributionsChanged.length ? `Set ${contributionsChanged.join(" and ")} contribution to No.` : "";
    const { nominees = [], nomineeAutofill = true } = await chrome.storage.local.get(["nominees", "nomineeAutofill"]);
    if (!nomineeAutofill || !nominees.length) {
      if (contribText) banner(`${TAG} ${contribText}`, true);
      return;
    }
    const rows = nomineeRows().filter((r) => !r.tr.dataset.vqNominee);
    if (!rows.length) {
      if (contribText) banner(`${TAG} ${contribText}`, true);
      return;
    }
    const matches = globalThis.VQNominee.matchRows(rows.map((r) => r.pilgrim), nominees);
    const filled = [], skipped = [], unknown = [];
    rows.forEach((r, i) => {
      r.tr.dataset.vqNominee = "seen";
      const n = matches[i];
      if (!r.pilgrim) return; // row not populated yet; leave for the next pass
      if (!n) { unknown.push(r.pilgrim); return; }
      if (r.nameEl.value.trim()) { skipped.push(r.pilgrim); return; }
      setInput(r.nameEl, n.name);
      if (r.ageEl && !r.ageEl.value.trim()) setInput(r.ageEl, String(n.age));
      if (r.relEl && !r.relEl.value) {
        const opt = [...r.relEl.options].find((o) => o.text.trim().toLowerCase() === n.relationship.toLowerCase());
        if (opt) {
          r.relEl.value = opt.value;
          r.relEl.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      r.tr.dataset.vqNominee = "filled";
      filled.push(r.pilgrim);
    });
    rows.filter((r) => !r.pilgrim).forEach((r) => delete r.tr.dataset.vqNominee);
    const total = nomineeRows().length;
    const parts = [];
    if (filled.length) parts.push(`Filled nominee for ${filled.length} of ${total} pilgrim${total === 1 ? "" : "s"}. Check before you submit.`);
    if (unknown.length) parts.push(`No saved nominee for ${unknown.join(", ")}. Fill by hand or add them in the extension.`);
    if (contribText) parts.push(contribText);
    if (!parts.length) return;
    // Keep the date step's outcome visible (e.g. "booked out — pick another date"), since the
    // pilgrim step replaced that banner.
    const { dateNote } = await chrome.storage.local.get("dateNote");
    let ok = !unknown.length;
    if (dateNote && dateNote.until > Date.now()) {
      parts.unshift(dateNote.text);
      ok = ok && dateNote.ok;
    }
    await chrome.storage.local.remove("dateNote");
    banner(`${TAG} ${parts.join(" ")}`, ok);
  }

  let fillTimer = null;
  new MutationObserver(() => {
    clearTimeout(fillTimer);
    fillTimer = setTimeout(() => autofillPass().catch((e) => console.warn(TAG, e)), 300);
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ---- Pilgrim selection ----
  // "Select Pilgrim" goes to #/piligrimServiceMaster: a paged table with a checkbox per saved pilgrim and
  // two unlabelled buttons at the bottom (grey .btn-clear = Reset, orange .btn-addto = add the ticked
  // pilgrims and return). Tested 25 Nov 2026: adding pilgrims keeps the date, route and slot already chosen.
  const PICK_MS = 2 * 60 * 1000;

  async function savedPilgrims() {
    const { nominees = [], pilgrimAutoSelect = true } = await chrome.storage.local.get(["nominees", "pilgrimAutoSelect"]);
    return pilgrimAutoSelect ? nominees : [];
  }

  // Called after the alert flow picks date and route: go to the Pilgrim List if no pilgrims are added yet.
  async function startPilgrimPick() {
    const pilgrims = await savedPilgrims();
    if (!pilgrims.length) return;
    if (document.querySelectorAll('input[placeholder="Enter Nominee Name"]').length) return; // pilgrims already added
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Select Pilgrim");
    if (!btn) { banner(`${TAG} Couldn't find "Select Pilgrim". Add your pilgrims by hand.`, false); return; }
    await chrome.storage.local.set({ pilgrimPick: { until: Date.now() + PICK_MS } });
    btn.click();
  }

  const rowName = (row) => (row.querySelector(".mat-column-fullname")?.textContent || "").replace(/Full Name\s*:/i, "").trim();

  async function onPilgrimListPage() {
    if (!location.hash.startsWith("#/piligrimServiceMaster")) return;
    const pilgrims = await savedPilgrims();
    if (!pilgrims.length) return;
    const { pilgrimPick } = await chrome.storage.local.get("pilgrimPick");
    const fromFlow = !!(pilgrimPick && pilgrimPick.until > Date.now());
    await chrome.storage.local.remove("pilgrimPick");

    // Wait until the table has rows with names (they load after the page).
    const ready = await waitFor(() => [...document.querySelectorAll("mat-table mat-row")].some((r) => rowName(r)), 15000);
    if (!ready) { banner(`${TAG} Pilgrim list didn't load. Tick your pilgrims by hand.`, false); return; }
    await sleep(400);

    let remaining = pilgrims.slice(0, globalThis.VQNominee.MAX_PILGRIMS);
    const ticked = [];
    for (let page = 0; page < 30 && remaining.length; page++) {
      const rows = [...document.querySelectorAll("mat-table mat-row")];
      const { indexes } = globalThis.VQNominee.pickRows(rows.map(rowName), remaining);
      for (const i of indexes) {
        const cb = rows[i].querySelector("mat-checkbox");
        if (cb && !cb.classList.contains("mat-checkbox-checked")) cb.querySelector("input")?.click();
        ticked.push(rowName(rows[i]));
      }
      const tickedNorm = new Set(ticked.map(globalThis.VQNominee.normalizeName));
      remaining = remaining.filter((p) => !tickedNorm.has(globalThis.VQNominee.normalizeName(p.pilgrim)));
      if (!remaining.length) break;
      const next = document.querySelector(".mat-paginator-navigation-next");
      if (!next || next.disabled) break;
      next.click();
      await sleep(400);
    }

    const overLimit = pilgrims.length > globalThis.VQNominee.MAX_PILGRIMS
      ? ` Only the first ${globalThis.VQNominee.MAX_PILGRIMS} saved pilgrims are used (portal limit).` : "";
    if (remaining.length) {
      banner(`${TAG} Ticked ${ticked.length}; not found in your pilgrim list: ${remaining.map((p) => p.pilgrim).join(", ")}. Fix the names in the extension or tick by hand, then press the orange button at the bottom right.${overLimit}`, false);
      return;
    }
    const add = document.querySelector("button.btn-addto");
    if (fromFlow && add) {
      banner(`${TAG} Ticked ${ticked.join(", ")}. Adding them to the booking…`, true);
      add.click();
    } else {
      banner(`${TAG} Ticked ${ticked.join(", ")}. Press the orange button at the bottom right to add them.${overLimit}`, true);
    }
  }

  // ---- Page changes ----
  // The portal is a single-page app that changes pages with history.pushState, which fires no
  // hashchange event (found 25 Nov 2026: clicking "Select Pilgrim" went unnoticed). So watch the URL
  // itself and react whenever it changes, e.g. after logging in or returning from the Pilgrim List.
  let lastHref = location.href;
  function onPageChange() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    run();
    onPilgrimListPage().catch((e) => console.warn(TAG, e));
  }
  window.addEventListener("hashchange", onPageChange);
  window.addEventListener("popstate", onPageChange);
  setInterval(onPageChange, 300);

  onPilgrimListPage().catch((e) => console.warn(TAG, e));
})();
