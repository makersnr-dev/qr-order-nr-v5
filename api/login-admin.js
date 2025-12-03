// /api/login-admin.js
import { signJWT } from "../src/shared/jwt.js";

export const config = { runtime: "edge" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json;charset=utf-8" },
  });
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

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

  // 🔥 관리자 계정 목록 (환경변수)
  const raw = process.env.ADMIN_USERS_JSON || "[]";
  let admins = [];

  try {
    admins = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "BAD_ENV_JSON" }, 500);
  }

  const match = admins.find((a) => a.id === uid && a.pw === pwd);
  if (!match) {
    return json({ ok: false, error: "INVALID_CREDENTIALS" }, 401);
  }

  // 🔥 SUPER도 관리자 페이지 로그인 가능하도록 처리
  const payload = {
    realm: "admin",
    uid,
    iat: Math.floor(Date.now() / 1000),
  };

  const secret = process.env.JWT_SECRET || "dev-secret";
  const token = await signJWT(payload, secret, 7200);

  // 로그인 페이지는 localStorage 기반 → 토큰만 리턴
  return json({ ok: true, token });
}
