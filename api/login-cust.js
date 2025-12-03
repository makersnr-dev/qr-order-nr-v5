// /api/login-cust.js
// 고객 로그인 (HS256 WebCrypto, base64url 표준화)
// verify.js 와 100% 호환되는 JWT 서명 적용

export const config = { runtime: "edge" };

// JSON 응답
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json;charset=utf-8" },
  });
}

/* ---------------------------------------------
 * base64url 인코더 (verify.js와 동일한 규칙)
 * --------------------------------------------- */
function base64url(str) {
  return btoa(str)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlBytes(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return btoa(s)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/* ---------------------------------------------
 * JWT HS256 서명 (Edge WebCrypto)
 * --------------------------------------------- */
async function signJwt(payload) {
  const enc = new TextEncoder();
  const secret = process.env.JWT_SECRET || "dev-secret-please-change";

  // 헤더 + 바디(base64url)
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const data = `${header}.${body}`;

  // HMAC SHA-256 WebCrypto 서명
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const sigBytes = new Uint8Array(signature);
  const sigUrl = base64urlBytes(sigBytes);

  return `${data}.${sigUrl}`;
}

/* ---------------------------------------------
 * 저장된 고객 목록 파싱 (CUST_USERS_JSON)
 * --------------------------------------------- */
function getCustUsers() {
  const raw =
    process.env.CUST_USERS_JSON ||
    '[{"id":"guest@example.com","pw":"1234","name":"게스트","provider":"local"}]';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_e) {
    return { error: "BAD_CUST_USERS_JSON_PARSE", users: [] };
  }

  const users = [];

  // 배열 형태: [{id:"", pw:""}]
  if (Array.isArray(parsed)) {
    for (const u of parsed) {
      if (!u || typeof u !== "object") continue;
      const id = u.id || u.uid || u.email;
      const pw = u.pw || u.password;
      if (!id || !pw) continue;
      users.push({
        id: String(id),
        pw: String(pw),
        name: u.name || u.displayName || String(id),
        provider: u.provider || "local",
      });
    }
  }

  // 객체 형태: {"user@example.com":"1234"}
  else if (parsed && typeof parsed === "object") {
    for (const [k, v] of Object.entries(parsed)) {
      if (v == null) continue;
      users.push({
        id: String(k),
        pw: String(v),
        name: String(k),
        provider: "local",
      });
    }
  }

  return { error: null, users };
}

/* ---------------------------------------------
 * 메인 핸들러
 * --------------------------------------------- */
export default async function handler(req) {
  if (req.method !== "POST") {
    return json({ error: "Method" }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch (_e) {
    return json({ ok: false, error: "BAD_JSON" }, 400);
  }

  const uid = (body?.uid || "").trim();
  const pwd = (body?.pwd || "").trim();

  if (!uid || !pwd) {
    return json({ ok: false, error: "ID_AND_PASSWORD_REQUIRED" }, 400);
  }

  // 저장된 고객 찾기
  const { error, users } = getCustUsers();
  if (error && users.length === 0) {
    console.error("[login-cust] config error:", error);
    return json({ ok: false, error }, 500);
  }

  const user = users.find((u) => u.id === uid && u.pw === pwd);

  if (!user) {
    return json({ ok: false, error: "INVALID_CREDENTIALS" }, 401);
  }

  // payload 구성 (super/admin 과 동일한 구조 유지)
  const payload = {
    sub: user.id,                   // 내부 고유 ID
    uid: user.id,                   // 화면 표시용
    realm: "cust",                  // 고객 영역
    provider: user.provider || "local",
    name: user.name || user.id,
    iat: Math.floor(Date.now() / 1000),
  };

  // JWT 생성
  const token = await signJwt(payload);

  return json({
    ok: true,
    token,
    user: payload,
  });
}
