// /api/super-login.js
// SUPER_ADMINS_JSON + JWT 기반 SUPER 로그인 (Edge 런타임, Web Crypto 방식)
// 요청:  POST { uid, pwd }
// 응답:  { ok: true, token } 또는 { ok:false } / { error: ... }

export const config = { runtime: 'edge' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json;charset=utf-8' },
  });
}

// login-admin.js와 동일한 방식으로 JWT 서명
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
  if (req.method !== 'POST') {
    return json({ error: 'Method' }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch (_e) {
    return json({ error: 'Bad JSON' }, 400);
  }

  const uid = (body?.uid || '').trim();
  const pwd = (body?.pwd || '').trim();

  // SUPER 계정 목록: SUPER_ADMINS_JSON
  // 형식 예시: [ {"id":"super","pw":"1234"}, {"id":"owner","pw":"abcd"} ]
  const raw =
    process.env.SUPER_ADMINS_JSON ||
    '[{"id":"super","pw":"1234"}]';

  let users;
  try {
    users = JSON.parse(raw);
  } catch (_e) {
    return json({ error: 'bad SUPER_ADMINS_JSON' }, 500);
  }

  const ok =
    Array.isArray(users) &&
    users.some((u) => u.id === uid && u.pw === pwd);

  if (!ok) {
    return json({ ok: false }, 401);
  }

  const token = await sign({
    uid,
    realm: 'super',
    tenant: 'default',
    iat: Math.floor(Date.now() / 1000),
  });

  return json({ ok: true, token });
}
