import { test } from "node:test";
import assert from "node:assert/strict";
import "../extension/nominee.js";

const { RELATIONSHIPS, normalizeName, validateNominee, matchRows } = globalThis.VQNominee;

const ok = { pilgrim: "RAVI KUMAR", name: "Sita Devi", age: "45", relationship: "Spouse" };

test("relationship list matches the portal's dropdown", () => {
  assert.deepEqual(RELATIONSHIPS, ["Father", "Mother", "Son", "Daughter", "Brother", "Sister", "Spouse"]);
});

test("normalizeName ignores case, punctuation and spacing", () => {
  assert.equal(normalizeName("  Ravi  Kumar. "), "ravi kumar");
  assert.equal(normalizeName("RAVI KUMAR"), "ravi kumar");
});

test("validateNominee accepts a valid entry", () => {
  assert.equal(validateNominee(ok), null);
});

test("validateNominee enforces the portal's field rules", () => {
  assert.match(validateNominee({ ...ok, pilgrim: " " }), /Pilgrim name/);
  assert.match(validateNominee({ ...ok, name: "" }), /required/);
  assert.match(validateNominee({ ...ok, name: "Sita.D" }), /letters and spaces/);
  assert.match(validateNominee({ ...ok, name: "A".repeat(33) }), /32/);
  assert.match(validateNominee({ ...ok, age: "0" }), /1 to 120/);
  assert.match(validateNominee({ ...ok, age: "121" }), /1 to 120/);
  assert.match(validateNominee({ ...ok, age: "4a" }), /1 to 120/);
  assert.match(validateNominee({ ...ok, relationship: "Friend" }), /relationship/);
});

test("matchRows pairs rows with saved nominees by pilgrim name", () => {
  const saved = [ok, { pilgrim: "Meena S", name: "Hari", age: "44", relationship: "Father" }];
  const res = matchRows(["meena s", "Ravi  Kumar.", "Unknown Person"], saved);
  assert.equal(res[0].name, "Hari");
  assert.equal(res[1].name, "Sita Devi");
  assert.equal(res[2], null);
});

test("pickRows finds saved pilgrims in the portal's list (one page at a time)", () => {
  const saved = [{ pilgrim: "Krishna Menon" }, { pilgrim: "GOPAL NAIR" }, { pilgrim: "Not There" }];
  const page = ["KRISHNA MENON", "SURESH BABU", "GOPAL NAIR.", ""];
  assert.deepEqual(globalThis.VQNominee.pickRows(page, saved), { indexes: [0, 2], missing: ["Not There"] });
});

test("pickRows ticks a duplicate name only once", () => {
  assert.deepEqual(globalThis.VQNominee.pickRows(["A B", "A B"], [{ pilgrim: "a b" }]).indexes, [0]);
});

test("matchRows does not guess on partial names", () => {
  assert.deepEqual(matchRows(["Ravi"], [ok]), [null]);
});
