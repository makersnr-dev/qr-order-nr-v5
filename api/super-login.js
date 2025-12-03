// /api/super-login.js
import { signJWT } from "../src/shared/jwt.js";

export const config = { runtime: "edge" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json;charset=utf-8" },
  });
}

function loadSuperAdmins() {
  try {
    const raw = process.env.SUPER_ADMINS_JSON || "[]";
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  // JSON body 읽기
  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "BAD_JSON" }, 400);
  }

  const uid = (body.uid || "").trim();
  const pwd = (body.pwd || "").trim();

  if (!uid || !pwd) {
    return json({ ok: false, error: "REQUIRED" }, 400);
  }

  // SUPER_ADMINS_JSON 검사
  const admins = loadSuperAdmins();
  const found = admins.find((a) => a.id === uid && a.pw === pwd);

  if (!found) {
    return json({ ok: false, error: "INVALID_CREDENTIALS" }, 401);
  }

  // JWT payload
  const payload = {
    role: "super",
    realm: "super",
    superId: uid,
    uid,
    iat: Math.floor(Date.now() / 1000),
  };

  const secret = process.env.SUPER_JWT_SECRET || "super-secret-dev";

  // JWT 생성
  const token = await signJWT(payload, secret);

  // ★ JSON에도 token 내려줌 → localStorage 저장 가능
  return new Response(JSON.stringify({ ok: true, token }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      // HttpOnly cookie에도 token 저장
      "set-cookie": `super_token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
    },
  });
}
