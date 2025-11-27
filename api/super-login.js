// /api/super-login.js
import { getIronSession } from 'iron-session';

const sessionOptions = {
  cookieName: 'qrnr_sess',
  password:
    process.env.SESSION_PASSWORD ||
    'change-me-32-characters-min-secret!!!!',
  cookieOptions: {
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
  },
};

// env: SUPER_ADMINS_JSON = {"super":"super1234!","audit":"audit-pass-9999"}
function getSuperAdminMap() {
  const raw = process.env.SUPER_ADMINS_JSON;
  if (!raw) {
    console.warn('[super] SUPER_ADMINS_JSON env not set');
    return {};
  }

  try {
    const parsed = JSON.parse(raw);

    // 형태 1) {"super":"pw","audit":"pw2"}
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }

    // 형태 2) [{"id":"super","password":"pw"}, ...] 도 허용
    if (Array.isArray(parsed)) {
      const map = {};
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        if (!item.id || !item.password) continue;
        map[item.id] = item.password;
      }
      return map;
    }

    console.warn('[super] SUPER_ADMINS_JSON has unexpected shape');
    return {};
  } catch (e) {
    console.error('[super] SUPER_ADMINS_JSON parse error:', e);
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    // Vercel / Node 함수에서는 JSON POST면 req.body에 들어오는 구조
    const body = req.body || {};
    const id = body.id || body.username || '';
    const password = body.password || '';

    if (!id || !password) {
      return res
        .status(400)
        .json({ ok: false, error: 'MISSING_CREDENTIALS' });
    }

    const map = getSuperAdminMap();
    const expectedPw = map[id];

    if (!expectedPw || expectedPw !== password) {
      // 이 부분이 지금 "아니래"의 원인
      return res
        .status(401)
        .json({ ok: false, error: 'INVALID_CREDENTIALS' });
    }

    const session = await getIronSession(req, res, sessionOptions);
    session.isSuper = true;
    session.superId = id;
    await session.save();

    return res.json({ ok: true });
  } catch (err) {
    console.error('[super-login] error:', err);
    return res
      .status(500)
      .json({ ok: false, error: 'INTERNAL_ERROR' });
  }
}
