// /api/super-login.js
// SUPER_ADMINS_JSON 기반 SUPER 로그인 (Edge + Web Crypto)
// 요청:  POST { uid, pwd }
// 환경변수 예시:
//   SUPER_ADMINS_JSON=[{"id":"super","pw":"1234","name":"슈퍼관리자","provider":"local"}]
//
// 응답(성공):
//   { ok:true, token, user:{ sub, uid, realm:'super', provider, name, iat } }

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

// SUPER 계정 목록 파싱 (배열/맵 둘 다 지원)
function getSuperUsers() {
  const raw =
    process.env.SUPER_ADMINS_JSON ||
    '[{"id":"super","pw":"1234","name":"슈퍼관리자","provider":"local"}]';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_e) {
    return { error: 'BAD_SUPER_ADMINS_JSON_PARSE', users: [] };
  }

  const norm = [];

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const id =
        item.id ||
        item.uid ||
        item.user ||
        item.name;
      const pw =
        item.pw ||
        item.password;
      if (!id || !pw) continue;
      norm.push({
        id: String(id),
        pw: String(pw),
        name: item.displayName || item.name || String(id),
        provider: item.provider || 'local',
      });
    }
  } else if (parsed && typeof parsed === 'object') {
    // { "super":"1234", "owner":"abcd" } 형태도 지원
    for (const [k, v] of Object.entries(parsed)) {
      if (v == null) continue;
      norm.push({
        id: String(k),
        pw: String(v),
        name: String(k),
        provider: 'local',
      });
    }
  }

  if (!norm.length) {
    return { error: 'NO_VALID_SUPER_USERS', users: [] };
  }

  return { error: null, users: norm };
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return json({ error: 'Method' }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch (_e) {
    return json({ ok: false, error: 'BAD_JSON' }, 400);
  }

  const uid = (body?.uid || '').trim();
  const pwd = (body?.pwd || '').trim();

  if (!uid || !pwd) {
    return json(
      { ok: false, error: 'ID_AND_PASSWORD_REQUIRED' },
      400,
    );
  }

  const { error, users } = getSuperUsers();
  if (error && users.length === 0) {
    console.error('[super-login] config error:', error);
    return json({ ok: false, error }, 500);
  }

  const user =
    Array.isArray(users) &&
    users.find(
      (u) => u && u.id === uid && u.pw === pwd,
    );

  if (!user) {
    // SUPER도 실패하면 401 유지
    return json({ ok: false }, 401);
  }

  const payload = {
    sub: user.id,                     // 내부 고유 ID
    uid: user.id,                     // 기존 패턴 호환용
    realm: 'super',                   // SUPER 역할
    provider: user.provider || 'local',
    name: user.name || user.id,
    iat: Math.floor(Date.now() / 1000),
  };

  const token = await sign(payload);

  return json({
    ok: true,
    token,
    user: payload,
  });
}
