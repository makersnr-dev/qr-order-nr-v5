// /api/verify.js
// JWT 검증 공용 API
// POST { token } -> { ok, sub, realm, payload }

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-dev-secret';

async function readBody(req) {
  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  let bodyText = '';
  try {
    bodyText = await readBody(req);
  } catch (e) {
    console.error('[verify] readBody error:', e);
    return res.status(400).json({ ok: false, error: 'BODY_READ_ERROR' });
  }

  let body = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'INVALID_JSON' });
  }

  const token = (body.token || '').trim();
  if (!token) {
    return res.status(400).json({ ok: false, error: 'TOKEN_REQUIRED' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const realm = decoded.realm || 'admin';

    return res.status(200).json({
      ok: true,
      sub: decoded.sub,
      realm,
      payload: decoded,
    });
  } catch (e) {
    console.error('[verify] jwt.verify error:', e);
    return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
  }
}
