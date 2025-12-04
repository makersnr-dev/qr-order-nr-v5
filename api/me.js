// /api/me.js
// 공통 인증 상태 확인 API
// 전달 방식: POST { token } 또는 Authorization: Bearer xxx

import { verifyJWT } from "../src/shared/jwt.js";

export const config = { runtime: "edge" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  // ------------------------------------
  // 1) 토큰 읽기
  // ------------------------------------
  let token = null;

  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) {
    token = auth.substring(7);
  }

  if (!token) {
    try {
      const body = await req.json();
      token = body?.token || null;
    } catch {}
  }

  if (!token) {
    return json({ ok: false, error: "NO_TOKEN" });
  }

  // ------------------------------------
  // 2) JWT 검증
  // ------------------------------------
  try {
    const secret = process.env.JWT_SECRET || "dev-secret";
    const payload = await verifyJWT(token, secret);

    if (!payload) {
      return json({ ok: false, error: "INVALID" });
    }

    // ----------------------------------------
    // SUPER → admin 페이지 접근 허용
    // ----------------------------------------
    const normalizedRealm =
      payload.realm === "super" ? "admin" : payload.realm;

    return json({
      ok: true,
      realm: normalizedRealm,
      ...payload,
    });

  } catch (e) {
    return json({
      ok: false,
      error: "INVALID",
      detail: e?.message || String(e),
    });
  }
}
