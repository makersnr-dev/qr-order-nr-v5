// /api/me.js
// 공통 인증 상태 확인 API (localStorage 토큰 기반)
// 전달 방법: POST { token } 또는 Authorization: Bearer xxx

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
    return json({ ok: false, error: "Method" }, 405);
  }

  // 1) 토큰 추출: body.token 또는 Authorization 헤더
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
    return json({ ok: false, error: "NO_TOKEN" }, 200);
  }

  // 2) JWT 검증
  try {
    const secret = process.env.JWT_SECRET || "dev-secret-please-change";
    const payload = await verifyJWT(token, secret);

    if (!payload) {
      return json({ ok: false, error: "INVALID" });
    }

    return json({
      ok: true,
      ...payload, // {realm, uid, sub, name, provider, iat ...}
    });

  } catch (e) {
    return json({
      ok: false,
      error: "INVALID",
      detail: e?.message || String(e),
    }, 200);
  }
}
