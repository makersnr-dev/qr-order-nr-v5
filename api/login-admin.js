// /api/login-admin.js
export const config = { runtime: 'edge' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// Edge Web Crypto 기반 JWT HS256
async function sign(payload) {
  const enc = new TextEncoder();
  const secret = process.env.JWT_SECRET || 'dev-secret-please-change';

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
  for (let i = 0; i < bytes.length; i++) {
    sigStr += String.fromCharCode(bytes[i]);
  }

  const b64 = btoa(sigStr)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${data}.${b64}`;
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);
  }

  // JSON 파싱
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'BAD_JSON' }, 400);
  }

  const uid = String(body.uid || '').trim();
  const pwd = String(body.pwd || '').trim();

  if (!uid || !pwd) {
    return json({ ok: false, error: 'ID_AND_PASSWORD_REQUIRED' }, 400);
  }

  // 1) 관리자 목록 로드 (환경변수)
  const raw =
    process.env.ADMIN_USERS_JSON ||
    '[{"id":"admin","pw":"1234","name":"관리자","provider":"local"}]';

  let users;
  try {
    users = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: 'BAD_ADMIN_USERS_JSON' }, 500);
  }

  const user =
    Array.isArray(users) &&
    users.find((u) => u.id === uid && u.pw === pwd);

  if (!user) return json({ ok: false }, 401);

  // 2) 매장 매핑 읽기
  // NOTE: Edge에서는 localStorage 접근 불가능 → storeAdmins는 파일 기반 /tmp JSON에 저장됨
  let map = {};
  try {
    const rawMap = await fetch(`${req.url.origin}/api/store-map`).then(r =>
      r.json()
    );
    map = rawMap.map || {};
  } catch (e) {
    console.error('[login-admin] 매핑 로드 실패', e);
  }

  const info = map[uid];
  const storeId = info?.storeId || null;

  if (!storeId) {
    return json(
      { ok: false, error: 'NO_MAPPING_FOR_ADMIN' },
      500
    );
  }

  // 3) JWT 생성
  const payload = {
    sub: uid,
    uid,
    realm: 'admin',
    provider: user.provider || 'local',
    name: user.name || uid,
    storeId,
    iat: Math.floor(Date.now() / 1000),
  };

  const token = await sign(payload);

  return json({ ok: true, token, user: payload });
}
