// /api/login-admin.js
import { signJWT } from "../src/shared/jwt.js";
import { rateLimit } from "./_lib/rate-limit.js";

export const config = { runtime: "edge" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json;charset=utf-8" },
  });
}

export default async function handler(req) {
  // 🔒 Rate Limit 적용
  const limit = rateLimit(req, "login-admin");
  if (!limit.ok) {
    return json({ ok: false, error: limit.reason }, 429);
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  // 요청 body 읽기
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

  // 🔥 관리자 계정 목록
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

  // 🔥 매장 관리자 매핑 로드
  const mapRaw = process.env.STORE_ADMIN_MAP_JSON || "{}";
  let map = {};
  try {
    map = JSON.parse(mapRaw);
  } catch {
    map = {};
  }

  // 매핑된 storeId
  const storeId =
    typeof map[uid] === "string"
      ? map[uid]
      : typeof map[uid] === "object"
      ? map[uid].storeId
      : null;

  // SUPER 계정도 admin 페이지 접근 가능 (realm=admin)
  const payload = {
    realm: "admin",
    uid,
    storeId: storeId || null,
    iat: Math.floor(Date.now() / 1000),
  };

  const secret = process.env.JWT_SECRET || "dev-secret";
  const token = await signJWT(payload, secret, 7200);

  return json({ ok: true, token });
}
