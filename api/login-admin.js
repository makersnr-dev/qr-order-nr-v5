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

  // 🔥 환경변수 이름 올바르게 수정
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

  // 🔥 SUPER 계정도 관리자 페이지 로그인 허용
  const isSuper = (process.env.SUPER_ADMINS_JSON || "[]").includes(uid);

  const payload = {
    realm: isSuper ? "super" : "admin",
    uid,
    iat: Math.floor(Date.now() / 1000),
  };

  const secret = process.env.JWT_SECRET || "dev-secret";

  const token = await signJWT(payload, secret, 7200);

  // 🔥 localStorage 저장 기반 구조에 맞게 token만 반환
  return json({ ok: true, token });
}
