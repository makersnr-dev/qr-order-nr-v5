// /api/_lib/rate-limit.js
// (그냥 복붙하면 됨)

export const config = { runtime: "edge" };

const LIMIT_1MIN = 50;   // 1분 50회
const LIMIT_10SEC = 20;  // 10초 20회
const LIMIT_1SEC = 5;    // 1초 5회

// 글로벌 캐시 (같은 지역 기준)
const buckets = new Map();

export function rateLimit(req, name = "global") {
  const ip =
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for") ||
    "0.0.0.0";

  const key = `${name}:${ip}`;
  const now = Date.now();

  if (!buckets.has(key)) buckets.set(key, []);

  const arr = buckets.get(key);

  // 오래된 기록 제거 (1분 지나면 삭제)
  while (arr.length && now - arr[0] > 60000) {
    arr.shift();
  }

  // 1초 제한
  const perSec = arr.filter(t => now - t < 1000).length;
  if (perSec >= LIMIT_1SEC) {
    return { ok: false, reason: "RATE_LIMIT_1SEC" };
  }

  // 10초 제한
  const per10 = arr.filter(t => now - t < 10000).length;
  if (per10 >= LIMIT_10SEC) {
    return { ok: false, reason: "RATE_LIMIT_10SEC" };
  }

  // 1분 제한
  if (arr.length >= LIMIT_1MIN) {
    return { ok: false, reason: "RATE_LIMIT_1MIN" };
  }

  arr.push(now);
  return { ok: true };
}
