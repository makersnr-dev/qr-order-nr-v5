// /api/verify.js
// 공통 JWT 검증 엔드포인트 (admin / super / 고객 모두 사용)
// - HS256 (HMAC-SHA256)
// - JWT_SECRET 환경변수 사용
// - JSON 바디 { token } 또는 raw text 토큰 모두 지원됨

export const config = { runtime: 'edge' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// base64url → Uint8Array
function base64UrlToBytes(b64url) {
  let base64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad) base64 += '='.repeat(4 - pad);

  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

// base64url → JSON 디코딩
function base64UrlToJson(b64url) {
  let base64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad) base64 += '='.repeat(4 - pad);
  const text = atob(base64);
  return JSON.parse(text);
}

// 요청 바디 파싱 (JSON 또는 raw text 모두 지원)
async function parseBody(req) {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try {
      return await req.json();
    } catch (_e) {
      return {};
    }
  }
  // raw text 방식도 처리
  const txt = (await req.text()).trim();
  if (!txt) return {};
  return { token: txt };
}

// JWT 검증(HS256)
async function verifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('BAD_FORMAT');
  }

  const [head, body, sig] = parts;
  const header = base64UrlToJson(head);
  if (!header || header.alg !== 'HS256') {
    throw new Error('UNSUPPORTED_ALG');
  }

  const enc = new TextEncoder();
  const secret = process.env.JWT_SECRET || 'dev-secret-please-change';

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const data = `${head}.${body}`;
  const sigBytes = base64UrlToBytes(sig);

  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes,
    enc.encode(data),
  );

  if (!ok) {
    throw new Error('INVALID_SIGNATURE');
  }

  // payload 복원
  return base64UrlToJson(body); // ← payload 안에 storeId도 포함됨
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return json({ error: 'Method' }, 405);
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (_e) {
    return json({ ok: false, error: 'BAD_JSON' }, 400);
  }

  const token = body?.token || body?.t || null;
  if (!token) {
    return json({ ok: false, error: 'NO_TOKEN' }, 400);
  }

  try {
    const payload = await verifyToken(token);

    // 🔥 매우 중요:
    // login-admin.js에서 storeId를 JWT payload에 넣었기 때문에
    // 여기는 payload를 그대로 return하면 storeId가 admin.js로 전달됨.
    //
    // admin.js → session.storeId → window.qrnrStoreId 설정됨.
    return json({
      ok: true,
      ...payload, // storeId 여기서 포함됨!
    });
  } catch (e) {
    console.error('[verify] error', e);
    return json(
      {
        ok: false,
        error: 'INVALID_TOKEN',
        detail: e?.message || String(e),
      },
      401
    );
  }
}
