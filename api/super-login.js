// /api/super-me.js
// SUPER 관리자 여부 확인 (Edge + WebCrypto)
// super도 admin/cust와 동일하게 JWT 검증은 /api/verify 에서 수행한다.

export const config = { runtime: "edge" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json;charset=utf-8" },
  });
}

export default async function handler(req) {
  try {
    // 1) 요청 바디에서 token 추출 (고객/관리자와 동일한 구조)
    const ct = req.headers.get("content-type") || "";
    let token = null;

    if (ct.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      token = body?.token || null;
    } else {
      // raw body fallback
      const txt = (await req.text().catch(() => "")).trim();
      if (txt) token = txt;
    }

    // 토큰 없으면 비로그인
    if (!token) {
      return json({ ok: true, isSuper: false });
    }

    // 2) 중앙 검증기로 전달
    const r = await fetch(`${req.nextUrl.origin}/api/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });

    const result = await r.json().catch(() => ({}));
    if (!result.ok) {
      return json({ ok: true, isSuper: false });
    }

    // 3) realm 으로 SUPER 판별
    if (result.realm !== "super") {
      return json({ ok: true, isSuper: false });
    }

    return json({
      ok: true,
      isSuper: true,
      superId: result.uid || result.sub,
      user: result,
    });
  } catch (e) {
    return json({ ok: true, isSuper: false });
  }
}
