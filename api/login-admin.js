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

  // -------------------------------
  // 1) body 읽기
  // -------------------------------
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

  // -------------------------------
  // 2) 관리자 계정 목록
  // -------------------------------
  let admins = [];
  try {
    admins = JSON.parse(process.env.ADMIN_USERS_JSON || "[]");
  } catch {
    return json({ ok: false, error: "BAD_ADMIN_USERS_JSON" }, 500);
  }

  // -------------------------------
  // 3) SUPER 계정 목록도 추가로 읽기
  // -------------------------------
  let supers = [];
  try {
    supers = JSON.parse(process.env.SUPER_ADMINS_JSON || "[]");
  } catch {
    return json({ ok: false, error: "BAD_SUPER_JSON" }, 500);
  }

  // -------------------------------
  // 4) ADMIN 또는 SUPER 중 하나라도 일치하면 로그인 성공
  // -------------------------------
  const adminMatch = admins.find((a) => a.id === uid && a.pw === pwd);
  const superMatch = supers.find((a) => a.id === uid && a.pw === pwd);

  if (!adminMatch && !superMatch) {
    return json({ ok: false, error: "INVALID_CREDENTIALS" }, 401);
  }

  // -------------------------------
  // 5) 토큰 발급
  //    SUPER도 관리자 화면에 들어올 수 있게 realm=admin으로 통일
  // -------------------------------
  const payload = {
    realm: "admin",
    uid,
    iat: Math.floor(Date.now() / 1000),
  };

  const secret = process.env.JWT_SECRET || "dev-secret";
  const token = await signJWT(payload, secret, 7200);

  return json({
    ok: true,
    token,
  });
}
