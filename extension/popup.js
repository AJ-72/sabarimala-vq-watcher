import { parseTargets, clampInterval, clampMinTickets, formatDates, describeOpening, DEFAULT_INTERVAL_MIN, DEFAULT_MIN_TICKETS } from "./logic.js";

const $ = (id) => document.getElementById(id);

async function render() {
  const s = await chrome.storage.local.get({ targetsText: "", intervalMin: DEFAULT_INTERVAL_MIN, minTickets: DEFAULT_MIN_TICKETS, ntfyTopic: "", enabled: true, targets: [], lastCheck: null });
  $("targets").value = s.targetsText;
  $("minTickets").value = clampMinTickets(s.minTickets);
  $("interval").value = s.intervalMin;
  $("ntfy").value = s.ntfyTopic;
  $("enabled").checked = s.enabled;

  const lc = s.lastCheck;
  const el = $("status");
  if (!lc) { el.textContent = "No check yet."; return; }
  const when = new Date(lc.at).toLocaleTimeString();
  if (!lc.ok) { el.innerHTML = `<span class="err">Last check failed at ${when}:</span> `; el.append(lc.error); return; }
  el.innerHTML = `<span class="ok">Checked at ${when}.</span><br>`;
  const openings = lc.openings || [];
  if (openings.length) {
    el.append(`Open with ${lc.minTickets}+ tickets (click to book):`);
    const ul = document.createElement("ul");
    ul.style.cssText = "margin:4px 0;padding-left:18px";
    for (const o of openings) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#";
      a.textContent = describeOpening(o);
      a.onclick = (ev) => { ev.preventDefault(); chrome.runtime.sendMessage({ openDate: o.date, routeId: o.routeId }); };
      li.append(a);
      ul.append(li);
    }
    el.append(ul);
  } else if ((lc.watchedOpen || []).length) {
    el.append(`${formatDates(lc.watchedOpen)} open, but no route has ${lc.minTickets}+ tickets in one slot.`);
  } else {
    el.append(s.targets.length ? "None of your dates are open." : "No dates open.");
  }
  if (lc.skippedDates) { el.append(document.createElement("br")); el.append(`(${lc.skippedDates} more open dates not checked by route — narrow your dates.)`); }
  el.append(document.createElement("br"));
  el.append(`Season: ${lc.summary.seasonStart} to ${lc.summary.seasonEnd}; ${lc.summary.booked.length} dates fully booked.`);
}

function say(text, isErr) {
  $("msg").textContent = text;
  $("msg").className = isErr ? "err" : "ok";
}

$("save").onclick = async () => {
  let targets;
  try { targets = parseTargets($("targets").value); } catch (e) { return say(e.message, true); }
  const ntfyTopic = $("ntfy").value.trim();
  if (ntfyTopic && !/^[A-Za-z0-9_-]{6,64}$/.test(ntfyTopic)) return say("ntfy topic: 6–64 letters, digits, - or _", true);
  await chrome.storage.local.set({
    targetsText: $("targets").value.trim(),
    targets,
    intervalMin: clampInterval($("interval").value),
    minTickets: clampMinTickets($("minTickets").value),
    ntfyTopic,
    enabled: $("enabled").checked,
    prevKeys: null, // re-baseline so openings that already match are reported once
  });
  await chrome.runtime.sendMessage("reschedule");
  say(`Saved. Watching ${targets.length ? targets.length + " date(s)" : "all dates"}.`);
  render();
};

// ---- Nominees ----
const { RELATIONSHIPS, validateNominee } = globalThis.VQNominee;

function nomRow(n = {}) {
  const row = document.createElement("div");
  row.className = "nom";
  const input = (cls, value, ph, max) => {
    const i = document.createElement("input");
    i.type = "text"; i.className = cls; i.value = value || ""; i.placeholder = ph;
    if (max) i.maxLength = max;
    return i;
  };
  const sel = document.createElement("select");
  sel.className = "rel";
  sel.append(new Option("Select", ""), ...RELATIONSHIPS.map((r) => new Option(r, r)));
  sel.value = n.relationship || "";
  const del = document.createElement("button");
  del.textContent = "✕"; del.title = "Remove";
  del.onclick = () => row.remove();
  row.append(input("pil", n.pilgrim, "e.g. RAVI KUMAR"), input("nm", n.name, "Letters only", 32), input("age", n.age, "Age", 3), sel, del);
  return row;
}

function readNomRows() {
  return [...document.querySelectorAll("#nomRows .nom")].map((r) => ({
    pilgrim: r.querySelector(".pil").value.trim(),
    name: r.querySelector(".nm").value.trim().replace(/\s+/g, " "),
    age: r.querySelector(".age").value.trim(),
    relationship: r.querySelector(".rel").value,
  })).filter((n) => n.pilgrim || n.name || n.age || n.relationship); // ignore fully blank lines
}

function nomSay(text, isErr) {
  $("nomMsg").textContent = text;
  $("nomMsg").className = isErr ? "err" : "ok";
}

async function renderNominees() {
  const { nominees = [], nomineeAutofill = true, pilgrimAutoSelect = true, contributionsNo = true } = await chrome.storage.local.get(["nominees", "nomineeAutofill", "pilgrimAutoSelect", "contributionsNo"]);
  $("nomEnabled").checked = nomineeAutofill;
  $("contribNo").checked = contributionsNo;
  $("pilEnabled").checked = pilgrimAutoSelect;
  $("nomRows").replaceChildren(...(nominees.length ? nominees : [{}]).map(nomRow));
}

$("nomAdd").onclick = () => $("nomRows").append(nomRow());
$("nomSave").onclick = async () => {
  const list = readNomRows();
  for (const n of list) {
    const err = validateNominee(n);
    if (err) return nomSay(err, true);
  }
  const seen = new Set();
  for (const n of list) {
    const k = globalThis.VQNominee.normalizeName(n.pilgrim);
    if (seen.has(k)) return nomSay(`${n.pilgrim} is listed twice`, true);
    seen.add(k);
  }
  if (list.length > globalThis.VQNominee.MAX_PILGRIMS) return nomSay(`The portal allows at most ${globalThis.VQNominee.MAX_PILGRIMS} pilgrims per booking`, true);
  await chrome.storage.local.set({ nominees: list, nomineeAutofill: $("nomEnabled").checked, pilgrimAutoSelect: $("pilEnabled").checked });
  nomSay(`Saved ${list.length} pilgrim${list.length === 1 ? "" : "s"}.`);
};
$("nomEnabled").onchange = () => chrome.storage.local.set({ nomineeAutofill: $("nomEnabled").checked });
$("pilEnabled").onchange = () => chrome.storage.local.set({ pilgrimAutoSelect: $("pilEnabled").checked });
$("contribNo").onchange = () => chrome.storage.local.set({ contributionsNo: $("contribNo").checked });

renderNominees();

$("check").onclick = async () => { say("Checking…"); await chrome.runtime.sendMessage("checkNow"); say("Done."); render(); };
$("test").onclick = async () => { await chrome.runtime.sendMessage("testAlert"); say("Test alert sent (desktop, and phone if ntfy is set)."); };

render();
