// Nominee autofill rules. Plain script (not a module) so the content script can use it;
// it attaches VQNominee to globalThis, which the popup and the Node tests also read.
(function (root) {
  // Options of the booking page's Relationship dropdown (GET /api/eDarshan/getRelationMaster, 25 Nov 2026).
  const RELATIONSHIPS = ["Father", "Mother", "Son", "Daughter", "Brother", "Sister", "Spouse"];

  /** Lower-case, letters and spaces only, single spaces: "  Ravi  K. " -> "ravi k" */
  function normalizeName(s) {
    return String(s || "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  }

  /** Same rules the booking page enforces. Returns an error message, or null if OK. */
  function validateNominee(n) {
    if (!n || !normalizeName(n.pilgrim)) return "Pilgrim name is required";
    const label = `For ${n.pilgrim}: `;
    const name = String(n.name || "").trim();
    if (!name) return label + "nominee name is required";
    if (!/^[a-zA-Z ]+$/.test(name)) return label + "nominee name can only have letters and spaces";
    if (name.length > 32) return label + "nominee name can be at most 32 characters";
    const age = String(n.age ?? "").trim();
    if (!/^[0-9]{1,3}$/.test(age) || Number(age) < 1 || Number(age) > 120) return label + "nominee age must be 1 to 120";
    if (!RELATIONSHIPS.includes(n.relationship)) return label + "pick a relationship";
    return null;
  }

  /**
   * For each row's pilgrim name, the saved nominee for that pilgrim (or null).
   * Matching ignores case, punctuation and extra spaces; it never guesses beyond that.
   */
  function matchRows(rowPilgrimNames, nominees) {
    const byName = new Map();
    for (const n of nominees || []) {
      const key = normalizeName(n.pilgrim);
      if (key && !byName.has(key)) byName.set(key, n);
    }
    return rowPilgrimNames.map((p) => byName.get(normalizeName(p)) || null);
  }

  /**
   * Which rows of the portal's Pilgrim List to tick: indexes of rows whose name is one of the
   * saved pilgrims, plus the saved pilgrims not found in these rows.
   */
  function pickRows(rowNames, nominees) {
    const wanted = new Map();
    for (const n of nominees || []) {
      const k = normalizeName(n.pilgrim);
      if (k && !wanted.has(k)) wanted.set(k, n.pilgrim);
    }
    const indexes = [];
    const found = new Set();
    rowNames.forEach((name, i) => {
      const k = normalizeName(name);
      if (wanted.has(k) && !found.has(k)) { indexes.push(i); found.add(k); }
    });
    const missing = [...wanted.entries()].filter(([k]) => !found.has(k)).map(([, v]) => v);
    return { indexes, missing };
  }

  // The portal allows up to 5 pilgrims per booking ("Others ( Upto 5 Pilgrims )").
  const MAX_PILGRIMS = 5;

  root.VQNominee = { RELATIONSHIPS, MAX_PILGRIMS, normalizeName, validateNominee, matchRows, pickRows };
})(globalThis);
