// clockrun.js：按整批共用的应用预算推进各节点 HLC，用尽的消息压账，收尾不限预算补账。
import { compareStamp, advance } from "./hlc.js";

function code(spec, which, fallback) {
  const key = which === "node" ? "node_error_code" : "event_error_code";
  return spec && typeof spec[key] === "string" ? spec[key] : fallback;
}

function fail(spec, which, fallback, message) {
  const err = new Error(message);
  err.code = code(spec, which, fallback);
  throw err;
}

function isInt(value) {
  return typeof value === "number" && Number.isFinite(value) && Math.floor(value) === value;
}

// 合法事件：recv，带字符串 node 与非负整数 p、l。
function inspectEvent(event, spec) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    fail(spec, "event", "E_BAD_EVENT", "event must be an object");
  }
  if (event.kind !== "recv" || typeof event.node !== "string"
      || !isInt(event.p) || event.p < 0 || !isInt(event.l) || event.l < 0) {
    fail(spec, "event", "E_BAD_EVENT", "invalid recv event");
  }
  if (spec.nodes.indexOf(event.node) === -1) {
    fail(spec, "node", "E_NO_NODE", "unknown node: " + event.node);
  }
}

function stampKey(node, p, l) {
  return node + "\u0000" + p + "\u0000" + l;
}

function cloneState(state, nodes) {
  const clocks = {};
  nodes.forEach(function (name) {
    const stamp = state.clocks && state.clocks[name];
    clocks[name] = Array.isArray(stamp) ? [stamp[0], stamp[1]] : [0, 0];
  });
  return {
    clocks: clocks,
    ledger: (state.ledger || []).map(function (row) { return [row[0], row[1], row[2]]; }),
    applied: (state.applied || []).slice()
  };
}

// 把一条消息应用到某节点时钟上。
function applyTo(state, node, p, l) {
  state.clocks[node] = advance(state.clocks[node], [p, l]);
  state.applied.push(stampKey(node, p, l));
}

export function step(spec) {
  const events = Array.isArray(spec.events) ? spec.events : [];
  const nodes = spec.nodes || [];
  const state = cloneState(spec.state || { clocks: {}, ledger: [], applied: [] }, nodes);

  let budget = spec.budget;
  if (!isInt(budget) || budget < 0) {
    budget = 0;
  }

  // 上一轮压账的消息先出账（FIFO），再处理本轮新事件；已处理集合里的跳过。
  const carried = state.ledger;
  state.ledger = [];
  const pendingNew = [];
  let applied = 0;
  let judged = 0;

  for (let i = 0; i < carried.length; i += 1) {
    const row = carried[i];
    if (budget > 0) {
      applyTo(state, row[0], row[1], row[2]);
      budget -= 1;
      applied += 1;
    } else {
      state.ledger.push([row[0], row[1], row[2]]);
    }
  }

  for (let i = 0; i < events.length; i += 1) {
    inspectEvent(events[i], spec);
    const event = events[i];
    if (state.applied.indexOf(stampKey(event.node, event.p, event.l)) !== -1) {
      continue;
    }
    judged += 1;
    if (budget > 0) {
      applyTo(state, event.node, event.p, event.l);
      budget -= 1;
      applied += 1;
    } else {
      pendingNew.push([event.node, event.p, event.l]);
    }
  }

  for (let i = 0; i < pendingNew.length; i += 1) {
    state.ledger.push(pendingNew[i]);
  }

  return {
    state: state,
    applied: applied,
    ledger_before: state.ledger.length,
    ledger: state.ledger.map(function (row) { return [row[0], row[1], row[2]]; }),
    judged: judged,
    judged_bound: events.length
  };
}

export function close(spec) {
  const nodes = spec.nodes || [];
  const state = cloneState(spec.state || { clocks: {}, ledger: [], applied: [] }, nodes);
  const carried = state.ledger;
  state.ledger = [];
  let catchup = 0;
  for (let i = 0; i < carried.length; i += 1) {
    const row = carried[i];
    applyTo(state, row[0], row[1], row[2]);
    catchup += 1;
  }
  return { state: state, catchup: catchup };
}
