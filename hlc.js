// hlc.js：混合逻辑时钟的时刻比较与推进
// 时刻结构：[物理时刻 p, 逻辑计数 l]
export function compareStamp(stamp, other) {
  if (stamp[0] !== other[0]) return stamp[0] < other[0] ? -1 : 1;
  if (stamp[1] !== other[1]) return stamp[1] < other[1] ? -1 : 1;
  return 0;
}

export function advance(stamp, other) {
  const localP = stamp[0];
  const localL = stamp[1];
  const msgP = other[0];
  const msgL = other[1];
  if (msgP > localP) return [msgP, msgL];
  if (msgP === localP) return [localP, Math.max(localL, msgL) + 1];
  return [localP, localL + 1];
}
