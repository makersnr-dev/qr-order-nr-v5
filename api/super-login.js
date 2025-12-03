// /api/super-login.js
import { signJWT } from "../src/shared/jwt.js";

export const config = { runtime: "edge" };

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "BAD_JSON" }, 400);
  }

  const uid = (body?.uid || "").trim();
  const pwd = (body?.pwd || "").trim();

  if (!uid || !pwd) {
    return json({ ok: false, error: "ID_PW_REQUIRED" }, 400);
  }

  // SUPER 관리자 목록 불러오기
  let list = [];
  try {
    list = JSON.parse(process.env.SUPER_ADMINS_JSON || "[]");
  } catch {
    return json({ ok: false, error: "BAD_SUPER_ADMINS_JSON_PARSE" }, 500);
  }

  const user = list.find((u) => u.id === uid && u.pw === pwd);

  if (!user) {
    return json({ ok: false, error: "INVALID_CREDENTIALS" }, 401);
  }

  // JWT 생성
  const payload = {
    superId: uid,
    role: "super",
    iat: Math.floor(Date.now() / 1000),
  };

  const secret = process.env.JWT_SUPER_SECRET || "super-secret";
  const token = await signJWT(payload, secret);

  // ⭐ 쿠키로 저장
  return json(
    { ok: true },
    200,
    {
      "set-cookie": `super_token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
    }
  );
}
