import assert from "node:assert";
import { compareStamp, advance } from "../hlc.js";
import { step, close } from "../clockrun.js";
import { render } from "../app.js";

const base = {
  budget: 2, nodes: ["n1", "n2"],
  state: { clocks: { n1: [0, 0], n2: [0, 0] }, ledger: [], applied: [] },
  events: [],
  node_error_code: "E_NO_NODE", event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("compareStamp returns a number", () => {
  assert.strictEqual(typeof compareStamp([1, 1], [1, 1]), "number");
});

check("advance returns a pair", () => {
  assert.ok(Array.isArray(advance([0, 0], [1, 1])));
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
