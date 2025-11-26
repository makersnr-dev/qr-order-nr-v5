// /api/super-login.js
// SUPER_ADMINS_JSON + JWT 기반 SUPER 로그인 API
// POST { id, password } -> { ok, token, user }

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-dev-secret';

// 요청 body 읽기 유틸 (Node http.ServerResponse 기준)
async function readBody(req) {
  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      // 혹시 너무 큰 요청이 들어오면 방어
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// SUPER_ADMINS_JSON 파싱
// - 객체 형태: { "super": "pw", "owner": "pw2" }
// - 배열 형태: [ { "id": "super", "password": "pw" }, ... ]
function getSuperAdminMap() {
  const raw = process.env.SUPER_ADMINS_JSON;
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      const map = {};
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const id = item.id || item.uid || item.user || item.name;
        const pw = item.password || item.pw;
        if (!id || !pw) continue;
        map[id] = pw;
      }
      return map;
    }

    if (parsed && typeof parsed === 'object') {
      // { id: pw } 형태라고 가정
      return parsed;
    }

    return {};
  } catch (e) {
    console.error('[super-login] SUPER_ADMINS_JSON parse error:', e);
    return {};
  }
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
    console.error('[super-login] readBody error:', e);
    return res.status(400).json({ ok: false, error: 'BODY_READ_ERROR' });
  }

  let body = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'INVALID_JSON' });
  }

  const id = (body.id || '').trim();
  const password = (body.password || '').trim();

  if (!id || !password) {
    return res
      .status(400)
      .json({ ok: false, error: 'ID_AND_PASSWORD_REQUIRED' });
  }

  const map = getSuperAdminMap();
  const expectedPw = map[id];

  if (!expectedPw || expectedPw !== password) {
    return res
      .status(401)
      .json({ ok: false, error: 'INVALID_CREDENTIALS' });
  }

  // JWT payload 통일: sub + realm
  const payload = {
    sub: id,
    realm: 'super',
  };

  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: '12h', // 필요시 조정
  });

  return res.status(200).json({
    ok: true,
    token,
    user: {
      id,
      realm: 'super',
    },
  });
}
