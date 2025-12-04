// /api/_lib/rate-limit.js
// Node 환경(Vercel API Routes) + Edge 환경 모두 지원하는 Rate Limit

const LIMIT_WINDOW = 10_000; // 10초 윈도우
const LIMIT_MAX = 20;        // 10초당 20회 허용
const ipMap = new Map();

/**
 * 요청 IP 가져오기 (Edge / Node 모두 대응)
 */
function getIp(req) {
  try {
    // --- Edge Request(Headers.get) 스타일 ---
    if (typeof req.headers?.get === "function") {
      return (
        req.headers.get("x-real-ip") ||
        req.headers.get("x-forwarded-for") ||
        "0.0.0.0"
      );
    }

    // --- Node.js Request(plain object) 스타일 ---
    const h = req.headers || {};
    return (
      h["x-real-ip"] ||
      h["x-forwarded-for"] ||
      req.socket?.remoteAddress ||
      "0.0.0.0"
    );

  } catch (err) {
    console.error("[rate-limit] getIp error:", err);
    return "0.0.0.0";
  }
}

/**
 * rateLimit(req, label)
 */
export function rateLimit(req, label = "default") {
  const ip = getIp(req);
  const key = `${label}:${ip}`;
  const now = Date.now();

  let bucket = ipMap.get(key);
  if (!bucket) {
    bucket = { count: 1, start: now };
    ipMap.set(key, bucket);
    return { ok: true };
  }

  // 윈도우 재설정
  if (now - bucket.start > LIMIT_WINDOW) {
    bucket.count = 1;
    bucket.start = now;
    return { ok: true };
  }

  // 초과 요청
  if (bucket.count >= LIMIT_MAX) {
    return {
      ok: false,
      reason: "RATE_LIMIT_EXCEEDED",
    };
  }

  bucket.count++;
  return { ok: true };
}
