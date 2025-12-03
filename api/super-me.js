// /api/super-me.js
// SUPER 인증 확인용 API (Edge Runtime + HS256 + 단일 JWT_SECRET)

import { verifyJWT } from "../src/shared/jwt.js";

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

  // 1) 요청 JSON 해석
  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "BAD_JSON" }, 400);
  }

  // 2) 토큰 추출 (localStorage → fetch → body.token)
  const token = body?.token || null;
  if (!token) {
    return json({ ok: true, isSuper: false });
  }

  try {
    // 3) JWT_SECRET 하나로 검증 (관리자/고객/슈퍼 전부 동일)
    const secret = process.env.JWT_SECRET || "dev-secret-please-change";

    const payload = await verifyJWT(token, secret);
    if (!payload) {
      return json({ ok: true, isSuper: false });
    }

    // 4) realm 체크 → super 인지 판단
    if (payload.realm !== "super") {
      return json({ ok: true, isSuper: false });
    }

    const superId =
      payload.uid || payload.sub || payload.superId || "unknown";

    return json({
      ok: true,
      isSuper: true,
      superId,
      payload,
    });
  } catch (e) {
    console.error("[super-me] verify error", e);
    return json({ ok: true, isSuper: false });
  }
}
