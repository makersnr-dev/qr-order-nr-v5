// /api/login-admin.js
// 관리자 로그인 (Node.js 런타임)

export const config = { runtime: 'nodejs' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function sign(payload) {
  const enc = new TextEncoder();
  const secret = process.env.JWT_SECRET || 'dev-secret-change-me';

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
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

  let body;
  try {
    body = await req.json();
  } catch (_) {
    return json({ ok: false, error: 'BAD_JSON' }, 400);
  }

  const uid = (body.uid || '').trim();
  const pwd = (body.pwd || '').trim();

  if (!uid || !pwd) {
    return json({ ok: false, error: 'ID_PASSWORD_REQUIRED' }, 400);
  }

  // === 관리자 목록 불러오기 (환경변수) ===
  const raw = process.env.ADMIN_USERS_JSON;
  if (!raw) {
    return json({ ok: false, error: 'ADMIN_USERS_JSON_NOT_SET' }, 500);
  }

  let users = null;
  try {
    users = JSON.parse(raw);
  } catch (e) {
    return json({
      ok: false,
      error: 'ADMIN_USERS_JSON_PARSE_ERROR',
      detail: String(e),
    }, 500);
  }

  if (!Array.isArray(users)) {
    return json({ ok: false, error: 'ADMIN_USERS_JSON_INVALID_STRUCTURE' }, 500);
  }

  const user = users.find((u) => u.id === uid && u.pw === pwd);
  if (!user) {
    return json({ ok: false, error: 'LOGIN_FAIL' }, 401);
  }

  // storeId 필수
  const storeId = user.storeId;
  if (!storeId) {
    return json({ ok: false, error: 'STORE_ID_NOT_SET' }, 500);
  }

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

  return json({
    ok: true,
    token,
    user: payload,
  });
}
