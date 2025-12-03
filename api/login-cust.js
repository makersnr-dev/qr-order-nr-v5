// /api/login-cust.js
// 고객용 로그인 (Edge + Web Crypto)
// 지금은 CUST_USERS_JSON(아이디/비번)으로 로그인.
// 나중에 소셜 로그인으로 바뀌면, 이 파일 대신
// /api/oauth-kakao-callback 등에서 같은 형태의 payload를 만들어 주면 됨.
//
// 요청:  POST { uid, pwd }   (테스트용 로컬 로그인)
// 환경변수 예시:
//   CUST_USERS_JSON=[
//     {"id":"user1@example.com","pw":"1234","name":"손님1","provider":"local"}
//   ]
//
// 성공 응답 예:
//   {
//     ok: true,
//     token: "....",
//     user: {
//       sub: "user1@example.com",
//       uid: "user1@example.com",
//       realm: "cust",
//       provider: "local",
//       name: "손님1",
//       iat: 1234567890
//     }
//   }

export const config = { runtime: 'edge' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json;charset=utf-8' },
  });
}

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

function getCustUsers() {
  const raw =
    process.env.CUST_USERS_JSON ||
    '[{"id":"guest@example.com","pw":"1234","name":"게스트","provider":"local"}]';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_e) {
    return { error: 'BAD_CUST_USERS_JSON_PARSE', users: [] };
  }

  const norm = [];

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const id = item.id || item.uid || item.email;
      const pw = item.pw || item.password;
      if (!id || !pw) continue;
      norm.push({
        id: String(id),
        pw: String(pw),
        name: item.name || item.displayName || String(id),
        provider: item.provider || 'local',
      });
    }
  } else if (parsed && typeof parsed === 'object') {
    // {"user1@example.com":"1234"} 형태도 허용
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
    return { error: 'NO_VALID_CUST_USERS', users: [] };
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

  const { error, users } = getCustUsers();
  if (error && users.length === 0) {
    console.error('[login-cust] config error:', error);
    return json({ ok: false, error }, 500);
  }

  const user =
    Array.isArray(users) &&
    users.find(
      (u) => u && u.id === uid && u.pw === pwd,
    );

  if (!user) {
    // 아이디/비번 틀린 경우
    return json({ ok: false, error: 'INVALID_CREDENTIALS' }, 401);
  }

  // ★ 여기 payload 구조를 "미래 소셜 로그인"까지 포함해서 통일
  const payload = {
    sub: user.id,                      // 내부 고유 ID (소셜이면 'kakao:12345' 이런 식 가능)
    uid: user.id,                      // 표면상 ID (이메일 등)
    realm: 'cust',                     // 고객 역할
    provider: user.provider || 'local',// local / kakao / google ...
    name: user.name || user.id,        // 화면에 표시할 이름
    iat: Math.floor(Date.now() / 1000),
  };

  const token = await sign(payload);

  return json({
    ok: true,
    token,
    user: payload,
  });
}
