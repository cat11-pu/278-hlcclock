// hlc.js：混合逻辑时钟的比较与推进
// 时刻用 [物理, 逻辑] 表示。

export function compareStamp(stamp, other) {
  if (stamp[0] !== other[0]) {
    return stamp[0] > other[0] ? 1 : -1;
  }
  if (stamp[1] !== other[1]) {
    return stamp[1] > other[1] ? 1 : -1;
  }
  return 0;
}

export function advance(stamp, other) {
  if (other[0] > stamp[0]) {
    return [other[0], other[1]];
  }
  if (other[0] === stamp[0]) {
    return [stamp[0], Math.max(stamp[1], other[1]) + 1];
  }
  return [stamp[0], stamp[1] + 1];
}
