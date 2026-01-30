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
    const cookie = req.headers.get("cookie") || "";
    // 쿠키에서 admin_token 또는 super_token을 찾습니다.
    const match = cookie.match(/(admin_token|super_token)=([^;]+)/);
    if (match) token = match[2];
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
    // 3) realm 정규화 + storeId 확정 (🔥 0-2.5 핵심)
    // ----------------------------------------
    const isSuper = payload.realm === "super";
    const normalizedRealm = isSuper ? "admin" : payload.realm;

    // 🔒 순수 admin 은 반드시 storeId 필요
    if (!isSuper && normalizedRealm === "admin") {
      const storeId = payload.storeId;

      if (!storeId || typeof storeId !== "string") {
        return json(
          {
            ok: false,
            error: "STORE_ID_REQUIRED",
            message: "관리자 계정에 storeId가 설정되어 있지 않습니다.",
          },
          403
        );
      }

      return json({
        ok: true,
        realm: normalizedRealm,
        storeId,
        uid: payload.uid,
        name: payload.name || payload.uid,
      });
    }

    // 🔓 super (storeId 없이 허용)
    return json({
      ok: true,
      realm: normalizedRealm,
      uid: payload.uid,
      name: payload.name || payload.uid,
      isSuper: true, // 프론트 제어용 (선택)
    });

  } catch (e) {
    return json({
      ok: false,
      error: "INVALID",
      detail: e?.message || String(e),
    });
  }
}
