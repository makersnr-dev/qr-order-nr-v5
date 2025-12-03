// /api/verify.js
// 모든 JWT(admin / super / customer 공통) 검증 엔드포인트
// HS256 (HMAC-SHA256)
// JWT_SECRET 사용
// - Authorization: Bearer <token>
// - POST { token } 
// - POST raw token (이전 방식) 모두 지원

export const config = { runtime: "edge" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// -------------------------------------------------------
// base64url → bytes
// -------------------------------------------------------
function base64UrlToBytes(b64url) {
  let base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  if (pad) base64 += "=".repeat(4 - pad);

  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

// -------------------------------------------------------
// base64url → JSON
// -------------------------------------------------------
function base64UrlToJson(b64url) {
  let base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  if (pad) base64 += "=".repeat(4 - pad);
  return JSON.parse(atob(base64));
}

// -------------------------------------------------------
// 요청에서 토큰 추출 (Authorization / JSON body / raw body)
// -------------------------------------------------------
async function extractToken(req) {
  // 1) Authorization: Bearer <token>
  const auth = req.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ")) {
    return auth.substring("Bearer ".length).trim();
  }

  // 2) POST JSON { token }
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      const body = await req.json();
      if (body?.token) return body.token;
    } catch (_) {}
  }

  // 3) 예전 방식: raw body = token
  try {
    const raw = (await req.text()).trim();
    if (raw) return raw;
  } catch (_) {}

  return null;
}

// -------------------------------------------------------
// JWT 검증 (HS256)
// -------------------------------------------------------
async function verifyToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("BAD_FORMAT");

  const [head, body, sig] = parts;

  const header = base64UrlToJson(head);
  if (!header || header.alg !== "HS256") {
    throw new Error("UNSUPPORTED_ALG");
  }

  const secret = process.env.JWT_SECRET || "dev-secret-please-change";
  const enc = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const data = `${head}.${body}`;
  const signatureBytes = base64UrlToBytes(sig);

  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    enc.encode(data)
  );

  if (!ok) throw new Error("INVALID_SIGNATURE");

  return base64UrlToJson(body);
}

// -------------------------------------------------------
// Handler
// -------------------------------------------------------
export default async function handler(req) {
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  const token = await extractToken(req);

  if (!token) {
    return json({ ok: false, error: "NO_TOKEN" }, 400);
  }

  try {
    const pay
