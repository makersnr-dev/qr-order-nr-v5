// /api/verify.js
// JWT 검증용 API (Edge + Web Crypto)
// 요청: POST { token }
// 응답:
//   - 성공: { ok:true, sub, realm, payload }
//   - 실패: { ok:false, error: '...' } (401/400/500)

export const config = { runtime: 'edge' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json;charset=utf-8' },
  });
}

// base64url → Uint8Array 로 변환 (서명 부분용)
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

async function verifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, error: 'BAD_TOKEN_FORMAT' };
  }

  const [headB64, bodyB64, sigB64] = parts;
  const enc = new TextEncoder();
  const secret =
    process.env.JWT_SECRET || 'dev-secret-please-change';

  // 서명 검증용 키 만들기
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
  if (req.method !== 'POST') {
    return json({ error: 'Method' }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch (_e) {
    return json({ ok: false, error: 'BAD_JSON' }, 400);
  }

  const token = (body?.token || '').trim();
  if (!token) {
    return json(
      { ok: false, error: 'TOKEN_REQUIRED' },
      400,
    );
  }

  try {
    const result = await verifyToken(token);
    if (!result.ok) {
      // 서명/형식 문제는 401로
      return json(result, 401);
    }
    return json(result);
  } catch (e) {
    console.error('[verify] error', e);
    return json(
      { ok: false, error: 'VERIFY_ERROR' },
      500,
    );
  }
}
