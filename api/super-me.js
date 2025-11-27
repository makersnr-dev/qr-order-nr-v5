// /api/super-me.js
// GET /api/super-me
// 헤더: Authorization: Bearer <JWT>
// SUPER_JWT_SECRET 으로 HS256 검증

import { webcrypto } from 'crypto';

const subtle = webcrypto.subtle;
const encoder = new TextEncoder();

function base64UrlDecodeToUint8Array(b64url) {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad === 2) b64 += '==';
  else if (pad === 3) b64 += '=';
  else if (pad !== 0) b64 += '===';
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

async function verifyHS256JWT(token, secret) {
  const parts = (token || '').split('.');
  if (parts.length !== 3) {
    throw new Error('INVALID_JWT_FORMAT');
  }
  const [headerB64, payloadB64, sigB64] = parts;

  const data = `${headerB64}.${payloadB64}`;
  const sigBytes = base64UrlDecodeToUint8Array(sigB64);

  const key = await subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const ok = await subtle.verify(
    'HMAC',
    key,
    sigBytes,
    encoder.encode(data)
  );

  if (!ok) {
    throw new Error('JWT_SIGNATURE_INVALID');
  }

  const payloadJson = Buffer.from(
    base64UrlDecodeToUint8Array(payloadB64)
  ).toString('utf8');

  const payload = JSON.parse(payloadJson);

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) {
    throw new Error('JWT_EXPIRED');
  }

  return payload;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const auth =
      req.headers.authorization || req.headers.Authorization || '';

    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({
        ok: false,
        error: 'NO_TOKEN',
      });
    }

    const token = auth.slice('Bearer '.length).trim();
    const secret = process.env.SUPER_JWT_SECRET || '';
    if (!secret) {
      return res.status(500).json({
        ok: false,
        error: 'SUPER_JWT_SECRET_NOT_SET',
      });
    }

    const payload = await verifyHS256JWT(token, secret);

    // role 이 super 인지 한번 더 체크 (혹시나 나중에 다른 용도로 쓸 경우)
    if (payload.role !== 'super') {
      return res.status(403).json({
        ok: false,
        error: 'NOT_SUPER',
      });
    }

    return res.status(200).json({
      ok: true,
      id: payload.sub,
      role: payload.role,
      iat: payload.iat,
      exp: payload.exp,
    });
  } catch (err) {
    console.error('[super-me] error:', err);
    return res.status(401).json({
      ok: false,
      error: 'JWT_INVALID',
      detail: err?.message || String(err),
    });
  }
}
