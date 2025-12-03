// /api/login-super.js
// SUPER 관리자 로그인 (Edge + WebCrypto HS256)

export const config = { runtime: "edge" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json;charset=utf-8" },
  });
}

// HS256 JWT 서명 (admin/cust 로그인과 동일한 최신 방식)
async function sign(payload) {
  const enc = new TextEncoder();
  const secret = process.env.JWT_SECRET || "dev-secret-please-change";

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const head = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  const data = `${head}.${body}`;

  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const bytes = new Uint8Array(sig);

  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);

  const b64 = btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${data}.${b64}`;
}

// SUPER 계정 불러오기
function getSuperUsers() {
  const raw =
    process.env.SUPER_USERS_JSON ||
    '[{"id":"super","pw":"1234","name":"슈퍼관리자"}]';

  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  // 요청 JSON 읽기
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "BAD_JSON" }, 400);
  }

  const uid = (body?.uid || "").trim();
  const pwd = (body?.pwd || "").trim();
  if (!uid || !pwd) {
    return json({ ok: false, error: "ID_AND_PASSWORD_REQUIRED" }, 400);
  }

  // SUPER 계정 확인
  const users = getSuperUsers();
  const user = users.find((u) => u.id === uid && u.pw === pwd);

  if (!user) {
    return json({ ok: false, error: "INVALID_CREDENTIALS" }, 401);
  }

  // JWT payload
  const payload = {
    sub: user.id,
    uid: user.id,
    realm: "super",                // 🔥 super 관리자임을 명확히 표시
    provider: "local",
    name: user.name || user.id,
    iat: Math.floor(Date.now() / 1000),
  };

  // JWT 발급
  const token = await sign(payload);

  return json({
    ok: true,
    token,
    user: payload,
  });
}
