// /api/login-admin.js
// 관리자 로그인 (Edge + Web Crypto)
// 요청:  POST { uid, pwd }
// 환경변수 예시:
//   ADMIN_USERS_JSON = [{"id":"admin","pw":"1234","name":"관리자이름","provider":"local","storeId":"cafe"}]
//   JWT_SECRET       = "아무 문자열 (길게)"

export const config = { runtime: 'edge' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Web Crypto 기반 JWT 서명 함수
async function sign(payload) {
  const enc = new TextEncoder();
  const secret =
    process.env.JWT_SECRET || 'dev-secret-please-change';

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const head = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const data = `${head}.${body}`;

  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const bytes = new Uint8Array(sig);

  let sigStr = '';
  for (let i = 0; i < bytes.length; i += 1) {
    sigStr += String.fromCharCode(bytes[i]);
  }

  const b64 = btoa(sigStr)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${data}.${b64}`;
}

export default async function handler(req) {
  // 1) 메서드 체크
  if (req.method !== 'POST') {
    return json(
      { ok: false, error: 'METHOD_NOT_ALLOWED' },
      405,
    );
  }

  // 2) JSON 파싱
  let body;
  try {
    body = await req.json();
  } catch (_e) {
    return json({ ok: false, error: 'BAD_JSON' }, 400);
  }

  const uid = (body && body.uid ? String(body.uid) : '').trim();
  const pwd = (body && body.pwd ? String(body.pwd) : '').trim();

  if (!uid || !pwd) {
    return json(
      { ok: false, error: 'ID_AND_PASSWORD_REQUIRED' },
      400,
    );
  }

  // 3) 환경변수에서 관리자 계정 목록 읽기
  const raw =
    process.env.ADMIN_USERS_JSON ||
    '[{"id":"admin","pw":"1234","name":"관리자","provider":"local","storeId":"store1"}]';

  let users;
  try {
    users = JSON.parse(raw);
  } catch (_e) {
    console.error('[login-admin] ADMIN_USERS_JSON parse error');
    return json(
      { ok: false, error: 'BAD_ADMIN_USERS_JSON' },
      500,
    );
  }

  const user =
    Array.isArray(users) &&
    users.find((u) => u && u.id === uid && u.pw === pwd);

  if (!user) {
    return json({ ok: false }, 401);
  }

  // 🔥 4) storeId 반드시 환경변수 JSON에서 받아야 함
  const storeId =
    user.storeId ||
    user.store ||
    user.store_id ||
    null;

  if (!storeId) {
    return json(
      { ok: false, error: 'STORE_ID_NOT_SET_FOR_ADMIN' },
      500
    );
  }

  // 5) 토큰 payload 구성 (storeId 추가)
  const payload = {
    sub: uid,
    uid,
    realm: 'admin',
    provider: user.provider || 'local',
    name: user.name || uid,
    storeId: storeId,              // ★ 핵심: 서버가 관리자의 매장ID를 강제 지정
    iat: Math.floor(Date.now() / 1000),
  };

  const token = await sign(payload);

  // 6) 최종 응답
  return json({
    ok: true,
    token,
    user: payload,
  });
}
