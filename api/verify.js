// /api/verify.js
// JWT 검증용 API (Edge + Web Crypto)
// ✅ 관리자/고객 쪽 예전 코드와 최대한 호환되게 만든 버전
//
// 지원하는 입력 방식:
//  1) POST JSON body: { "token": "..." }
//  2) Authorization: Bearer <token> 헤더
//  3) GET ?token=... 쿼리
//
// 응답 형식 (항상 HTTP 200으로 돌려줌):
//  - 성공: { ok:true, sub, realm, payload }
//  - 실패: { ok:false, error: '...' }

export const config = { runtime: 'edge' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json;charset=utf-8' },
  });
}

// base64url → Uint8Array 로 변환 (서명 검증용)
function base64UrlToBytes(b64url) {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad === 2) b64 += '==';
  else if (pad === 3) b64 += '=';
  else if (pad === 1) b64 += '===';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function verifyJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, error: 'BAD_TOKEN_FORMAT' };
  }

  const [headB64, bodyB64, sigB64] = parts;
  const enc = new TextEncoder();
  const secret =
    process.env.JWT_SECRET || 'dev-secret-please-change';

  // 검증용 키 생성 (login-admin / super-login / login-cust 와 동일한 키)
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const data = `${headB64}.${bodyB64}`;
  const sigBytes = base64UrlToBytes(sigB64);

  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes,
    enc.encode(data),
  );

  if (!ok) {
    return { ok: false, error: 'BAD_SIGNATURE' };
  }

  // payload decode
  let payload;
  try {
    const bodyJson = atob(bodyB64);
    payload = JSON.parse(bodyJson);
  } catch (_e) {
    return { ok: false, error: 'BAD_PAYLOAD_JSON' };
  }

  return {
    ok: true,
    sub: payload.sub || payload.uid || null,
    realm: payload.realm || null,
    payload,
  };
}

export default async function handler(req) {
  let token = '';

  // 1) Authorization: Bearer <token> 헤더에서 시도
  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) {
    token = auth.slice(7).trim();
  }

  // 2) URL 쿼리 (?token=...) 에서 시도
  if (!token) {
    try {
      const url = new URL(req.url);
      token = (url.searchParams.get('token') || '').trim();
    } catch (_e) {
      // 무시
    }
  }

  // 3) POST body: { token: "..." } 에서 시도
  if (!token && req.method === 'POST') {
    try {
      const body = await req.json();
      token = (body?.token || '').trim();
    } catch (_e) {
      // body가 JSON이 아니어도 일단 무시하고 아래에서 처리
    }
  }

  if (!token) {
    // 토큰이 아예 없을 때도 200 + ok:false 로만 응답 (옛 코드 호환)
    return json({ ok: false, error: 'TOKEN_REQUIRED' });
  }

  try {
    const result = await verifyJwt(token);
    // 여기서도 항상 200으로 내려줌 (data.ok만 보고 분기하는 기존 코드 호환)
    return json(result);
  } catch (e) {
    console.error('[verify] error', e);
    return json({ ok: false, error: 'VERIFY_ERROR' });
  }
}
