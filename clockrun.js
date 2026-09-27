// clockrun.js：按整批共用的应用预算推进各节点混合逻辑时钟，用尽即挂账
import { advance } from "./hlc.js";

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isCount(value) {
  return typeof value === "number" && Number.isFinite(value) && Math.floor(value) === value && value >= 0;
}

// 事件必须带 node 与非负整数的 p、l；非法报 E_BAD_EVENT
function validateEvent(event, code) {
  if (event === null || typeof event !== "object"
      || event.kind !== "recv"
      || typeof event.node !== "string"
      || !isCount(event.p) || !isCount(event.l)) {
    throw codedError(code, "illegal event");
  }
}

function eventKey(event) {
  return "id:" + event.id;
}

// 深拷贝跨轮状态，并给节点表中缺时钟的节点补 [0,0]
function normalizeState(spec) {
  const source = spec.state || {};
  const clocks = {};
  (spec.nodes || []).forEach(function (name) {
    clocks[name] = Array.isArray(source.clocks && source.clocks[name])
      ? source.clocks[name].slice()
      : [0, 0];
  });
  return {
    clocks: clocks,
    ledger: Array.isArray(source.ledger) ? source.ledger.map(function (row) { return row.slice(); }) : [],
    applied: Array.isArray(source.applied) ? source.applied.slice() : []
  };
}

// 逐条处理：结转账先入队，随后是新事件；返回处理结果
function run(spec, limit) {
  const nodeCode = spec.node_error_code || "E_NO_NODE";
  const eventCode = spec.event_error_code || "E_BAD_EVENT";
  const nodeTable = spec.nodes || [];
  const state = normalizeState(spec);
  const seen = new Set(state.applied);

  // 队列项：[node, p, l, key]，账先于新事件，共用同一份预算
  const queue = state.ledger.map(function (row) {
    return [row[0], row[1], row[2], row.length > 3 ? row[3] : "ledger:" + row[0] + ":" + row[1] + ":" + row[2]];
  });
  const events = spec.events || [];
  events.forEach(function (event, index) {
    validateEvent(event, eventCode);
    queue.push([event.node, event.p, event.l,
      Object.prototype.hasOwnProperty.call(event, "id") ? eventKey(event) : "ev:" + index + ":" + event.node + ":" + event.p + ":" + event.l]);
  });

  const bounded = limit !== Infinity;
  let budget = bounded ? Math.max(0, Math.floor(limit)) : Infinity;
  let appliedCount = 0;
  let judged = 0;
  const remaining = [];
  let exhausted = false;

  for (let i = 0; i < queue.length; i += 1) {
    const row = queue[i];
    if (seen.has(row[3])) continue;
    if (bounded && budget <= 0) { exhausted = true; }
    if (exhausted) {
      // 预算用尽：本条连同后续消息压在账上，带出下一轮
      remaining.push(row);
      continue;
    }
    if (nodeTable.indexOf(row[0]) === -1) {
      throw codedError(nodeCode, "unknown node " + row[0]);
    }
    state.clocks[row[0]] = advance(state.clocks[row[0]], [row[1], row[2]]);
    seen.add(row[3]);
    appliedCount += 1;
    if (i >= state.ledger.length) judged += 1;
    budget -= 1;
  }

  state.ledger = remaining;
  state.applied = Array.from(seen);
  return {
    state: state,
    applied: appliedCount,
    ledger_before: remaining.length,
    ledger: remaining.map(function (row) { return [row[0], row[1], row[2]]; }),
    judged: judged,
    judged_bound: events.length
  };
}

export function step(spec) {
  return run(spec, typeof spec.budget === "number" ? spec.budget : 0);
}

export function close(spec) {
  const result = run(Object.assign({}, spec, { budget: Infinity }), Infinity);
  return { state: result.state, catchup: result.applied };
}
