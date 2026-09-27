// hlc.js：时钟比较与推进（基线：一律原样返回）
export function compareStamp(stamp, other) {
  return 0;
}

export function advance(stamp, other) {
  return stamp;
}
