// /api/_lib/rate-limit.js

const LIMIT_WINDOW = 10_000; // 10초
const LIMIT_MAX = 20;        // 10초당 20회
const ipMap = new Map();

/**
 * 요청 IP 가져오기 (보안 및 환경 호환성 강화)
 */
function getIp(req) {
  try {
    let ip = "0.0.0.0";
    
    // 1. Edge/Node 헤더 통합 처리
    const headers = typeof req.headers?.get === "function" ? req.headers : new Map(Object.entries(req.headers || {}));
    
    ip = headers.get("x-real-ip") || headers.get("x-forwarded-for") || req.socket?.remoteAddress || "0.0.0.0";

    // x-forwarded-for가 '1.2.3.4, 5.6.7.8' 형태로 올 경우 첫 번째 IP 선택
    if (ip.includes(',')) {
      ip = ip.split(',')[0].trim();
    }
    
    return ip;
  } catch (err) {
    return "0.0.0.0";
  }
}

/**
 * rateLimit(req, label)
 */
export function rateLimit(req, label = "default") {
  // 🛡️ [추가] 메모리 누수 방지: 맵이 너무 커지면(예: 5000명 이상) 한 번 비워줌
  if (ipMap.size > 5000) {
    console.log("[rate-limit] Memory Cleanup Executed");
    ipMap.clear();
  }

  const ip = getIp(req);
  const key = `${label}:${ip}`;
  const now = Date.now();

  let bucket = ipMap.get(key);
  
  if (!bucket) {
    bucket = { count: 1, start: now };
    ipMap.set(key, bucket);
    return { ok: true };
  }

  // 윈도우 재설정 (10초 지났으면 초기화)
  if (now - bucket.start > LIMIT_WINDOW) {
    bucket.count = 1;
    bucket.start = now;
    return { ok: true };
  }

  // 초과 요청 체크
  if (bucket.count >= LIMIT_MAX) {
    return {
      ok: false,
      reason: "RATE_LIMIT_EXCEEDED",
    };
  }

  bucket.count++;
  return { ok: true };
}
