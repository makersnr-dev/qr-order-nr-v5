// /api/super-login.js
// POST { id, password }
// 1) Vercel ENV SUPER_ADMINS_JSON 에서 아이디/비번 확인
// 2) HS256 JWT 서명 (Web Crypto 스타일) 해서 token 으로 반환

import { webcrypto } from 'crypto';

const subtle = webcrypto.subtle;
const encoder = new TextEncoder();

// base64url 인코딩
function base64UrlEncode(buf) {
  const b64 = Buffer.from(buf).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signHS256JWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerJson = JSON.stringify(header);
  const payloadJson = JSON.stringify(payload);

  const headerB64 = base64UrlEncode(Buffer.from(headerJson));
  const payloadB64 = base64UrlEncode(Buffer.from(payloadJson));
  const data = `${headerB64}.${payloadB64}`;

  const key = await subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBuf = await subtle.sign('HMAC', key, encoder.encode(data));
  const sigB64 = base64UrlEncode(new Uint8Array(sigBuf));

  return `${data}.${sigB64}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { id, password } = req.body || {};

    if (!id || !password) {
      return res.status(400).json({
        ok: false,
        error: 'MISSING_ID_OR_PASSWORD',
      });
    }

    // ✅ 1. SUPER_ADMINS_JSON 파싱
    const rawAdmins = process.env.SUPER_ADMINS_JSON || '';
    if (!rawAdmins) {
      return res.status(500).json({
        ok: false,
        error: 'SUPER_ADMINS_JSON_NOT_SET',
      });
    }

    let adminMap = {};
    try {
      adminMap = JSON.parse(rawAdmins);
    } catch (e) {
      console.error('[super-login] JSON parse error:', e);
      return res.status(500).json({
        ok: false,
        error: 'SUPER_ADMINS_JSON_INVALID',
        detail: e.message,
      });
    }

    const expectedPw = adminMap[id];
    if (!expectedPw || expectedPw !== password) {
      // 👉 여기서 "아이디 비밀번호가 옳지 않습니다" 상황
      return res.status(401).json({
        ok: false,
        error: 'INVALID_CREDENTIALS',
      });
    }

    // ✅ 2. JWT 서명용 시크릿
    const secret = process.env.SUPER_JWT_SECRET || '';
    if (!secret) {
      return res.status(500).json({
        ok: false,
        error: 'SUPER_JWT_SECRET_NOT_SET',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: id,
      role: 'super',
      iat: now,
      exp: now + 60 * 60 * 12, // 12시간
    };

    const token = await signHS256JWT(payload, secret);

    // 👉 다른 로그인과 동일하게, 보통은 프론트에서 localStorage 에 보관하거나
    // Authorization: Bearer 로 보내게 사용
    return res.status(200).json({
      ok: true,
      id,
      token,
    });
  } catch (err) {
    console.error('[super-login] top-level error:', err);
    return res.status(500).json({
      ok: false,
      error: 'INTERNAL_ERROR',
      detail: err?.message || String(err),
    });
  }
}
