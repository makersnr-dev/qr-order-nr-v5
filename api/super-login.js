// /api/super-login.js
export const config = { runtime: "edge" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// base64url 인코딩
function b64url(str) {
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function sign(payload, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const data = `${head}.${body}`;

  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  let s = "";
  const bytes = new Uint8Array(sig);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return `${data}.${b64url(s)}`;
}

export default async function handler(req) {
  if (req.method !== "POST") return json({ ok: false }, 405);

  const body = await req.json().catch(() => ({}));
  const uid = (body.uid || "").trim();
  const pwd = (body.pwd || "").trim();

  // 환경변수 SUPER_ADMINS_JSON (원래 구조)
  let admins = [];
  try {
    admins = JSON.parse(process.env.SUPER_ADMINS_JSON || "[]");
  } catch {
    return json({ ok: false, error: "BAD_SUPER_ADMINS_JSON" });
  }

  const user = admins.find((u) => u.id === uid && u.pw === pwd);
  if (!user) return json({ ok: false, error: "INVALID_CREDENTIALS" }, 401);

  const payload = {
    uid,
    realm: "super",
    iat: Date.now(),
  };

  const secret = process.env.JWT_SECRET || "dev-secret";
  const token = await sign(payload, secret);

  return json({ ok: true, token });
}
